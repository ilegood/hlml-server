import pool from "../db.js";
import { toInt } from "./utils.js";
import { STATUS_OPEN, STATUS_CLOSED } from "../config/constants.js";

const DELETED_MESSAGE_CONTENT = "삭제된 메시지입니다.";

const getRoomMemberIds = async (roomStr) => {
  if (roomStr.startsWith("dm_")) {
    const dmRoomId = Number(roomStr.slice(3));
    const [[room]] = await pool.query(
      "SELECT user1_id, user2_id FROM dm_rooms WHERE id = ?",
      [dmRoomId],
    );
    return room ? [Number(room.user1_id), Number(room.user2_id)] : [];
  }

  const roomId = Number(roomStr);
  if (!roomId) return [];

  const [rows] = await pool.query(
    `SELECT user_id FROM posts WHERE post_id = ?
     UNION
     SELECT user_id FROM post_participants WHERE post_id = ?`,
    [roomId, roomId],
  );
  return rows.map((row) => Number(row.user_id));
};

const emitUnreadChanged = async (io, roomStr, exceptUserId = null) => {
  const memberIds = await getRoomMemberIds(roomStr);
  memberIds.forEach((memberId) => {
    if (exceptUserId && Number(memberId) === Number(exceptUserId)) return;
    io.to(`user_${memberId}`).emit("chat_unread_changed", {
      roomId: roomStr,
      reason: "message",
    });
  });
};

export const registerMessageSocket = (io, socket) => {
  socket.on("send_message", async (data, ack) => {
    const { roomId, userId, nickname, content, isSystem, parentId } = data;
    const roomStr = String(roomId || "");
    const userIdInt = toInt(socket.data.userId) || toInt(userId);
    const parentIdInt = parentId ? toInt(parentId) : null;
    if (!roomStr || !userIdInt || !content?.trim()) {
      if (typeof ack === "function") ack({ ok: false });
      return;
    }

    try {
      if (roomStr.startsWith("dm_")) {
        const dmRoomId = Number(roomStr.slice(3));
        const [[dmRoom]] = await pool.query(
          "SELECT user1_id, user2_id FROM dm_rooms WHERE id = ? AND (user1_id = ? OR user2_id = ?)",
          [dmRoomId, userIdInt, userIdInt],
        );

        if (!dmRoom) {
          if (typeof ack === "function") ack({ ok: false });
          return;
        }

        const otherUserId =
          Number(dmRoom.user1_id) === userIdInt
            ? dmRoom.user2_id
            : dmRoom.user1_id;
        const [[blocked]] = await pool.query(
          `SELECT id FROM user_relations
           WHERE status = 'blocked'
             AND ((requester_id = ? AND target_id = ?) OR (requester_id = ? AND target_id = ?))
           LIMIT 1`,
          [userIdInt, otherUserId, otherUserId, userIdInt],
        );

        if (blocked) {
          if (typeof ack === "function") ack({ ok: false });
          return;
        }
      }

      const [result] = await pool.query(
        "INSERT INTO messages (room_id, user_id, nickname, content, is_system, parent_id) VALUES (?, ?, ?, ?, ?, ?)",
        [
          roomStr,
          userIdInt,
          nickname,
          content,
          isSystem ? 1 : 0,
          parentIdInt,
        ],
      );

      const message = {
        ...data,
        id: result.insertId,
        roomId: roomStr,
        userId: userIdInt,
        parentId: parentIdInt,
        content: content.trim(),
        created_at: new Date().toISOString(),
      };

      io.to(roomStr).emit("receive_message", message);
      await emitUnreadChanged(io, roomStr, userIdInt);
      if (typeof ack === "function") ack({ ok: true, message });
    } catch (error) {
      console.error("Failed to save message:", error);
      if (typeof ack === "function") {
        ack({ ok: false, message: "Failed to save message" });
      }
    }
  });

  socket.on("edit_message", async ({ messageId, content, roomId }) => {
    const roomStr = String(roomId);
    const userIdInt = toInt(socket.data.userId);
    if (!roomStr || !messageId || !userIdInt || !content?.trim()) return;

    try {
      const [result] = await pool.query(
        `UPDATE messages
         SET content = ?, is_edited = 1
         WHERE id = ? AND room_id = ? AND user_id = ? AND is_deleted = 0`,
        [content.trim(), messageId, roomStr, userIdInt],
      );
      if (result.affectedRows === 0) return;

      io.to(roomStr).emit("message_edited", {
        messageId,
        content: content.trim(),
      });
    } catch (error) {
      console.error("Failed to edit message:", error);
    }
  });

  socket.on("delete_message", async ({ messageId, roomId }) => {
    const roomStr = String(roomId);
    const userIdInt = toInt(socket.data.userId);
    if (!roomStr || !messageId || !userIdInt) return;

    try {
      const [result] = await pool.query(
        `UPDATE messages
         SET is_deleted = 1, content = ?
         WHERE id = ? AND room_id = ? AND user_id = ?`,
        [DELETED_MESSAGE_CONTENT, messageId, roomStr, userIdInt],
      );
      if (result.affectedRows === 0) return;

      io.to(roomStr).emit("message_deleted", { messageId });
    } catch (error) {
      console.error("Failed to delete message:", error);
    }
  });

  socket.on("react_message", async ({ messageId, userId, emoji, roomId }) => {
    const roomStr = String(roomId);
    const userIdInt = toInt(socket.data.userId) || toInt(userId);
    if (!userIdInt) return;

    try {
      const [[existing]] = await pool.query(
        "SELECT id FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?",
        [messageId, userIdInt, emoji],
      );

      if (existing) {
        await pool.query("DELETE FROM message_reactions WHERE id = ?", [
          existing.id,
        ]);
      } else {
        await pool.query(
          "INSERT INTO message_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)",
          [messageId, userIdInt, emoji],
        );
      }

      const [reactions] = await pool.query(
        "SELECT emoji, user_id AS userId FROM message_reactions WHERE message_id = ?",
        [messageId],
      );
      io.to(roomStr).emit("update_reactions", { messageId, reactions });
    } catch (error) {
      console.error("Failed to update reaction:", error);
    }
  });

  socket.on("mark_read", async ({ messageId, userId, roomId }) => {
    const roomStr = String(roomId);
    const userIdInt = toInt(socket.data.userId) || toInt(userId);
    if (!userIdInt) return;

    try {
      const [[{ readCount }]] = await pool.query(
        "SELECT COUNT(*) AS readCount FROM message_reads WHERE message_id = ? AND user_id = ?",
        [messageId, userIdInt],
      );

      if (readCount === 0) {
        await pool.query(
          "INSERT INTO message_reads (message_id, user_id) VALUES (?, ?)",
          [messageId, userIdInt],
        );

        const [[{ total }]] = await pool.query(
          "SELECT COUNT(*) AS total FROM message_reads WHERE message_id = ?",
          [messageId],
        );
        io.to(roomStr).emit("update_read_count", {
          messageId,
          readCount: total,
        });
        io.to(`user_${userIdInt}`).emit("chat_unread_changed", {
          roomId: roomStr,
          reason: "read",
        });
      }
    } catch (error) {
      console.error("Failed to mark message read:", error);
    }
  });
};
