import pool from "../db.js";
import { toInt } from "./utils.js";

export const registerMessageSocket = (io, socket) => {
  socket.on("send_message", async (data, ack) => {
    const { roomId, userId, nickname, content, isSystem, parentId } = data;
    const roomStr = String(roomId || "");
    const userIdInt = toInt(userId);
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

    try {
      await pool.query(
        "UPDATE messages SET content = ?, is_edited = 1 WHERE id = ?",
        [content, messageId],
      );
      io.to(roomStr).emit("message_edited", { messageId, content });
    } catch (error) {
      console.error("Failed to edit message:", error);
    }
  });

  socket.on("delete_message", async ({ messageId, roomId }) => {
    const roomStr = String(roomId);

    try {
      await pool.query(
        "UPDATE messages SET is_deleted = 1, content = ? WHERE id = ?",
        ["\uc0ad\uc81c\ub41c \uba54\uc2dc\uc9c0\uc785\ub2c8\ub2e4.", messageId],
      );
      io.to(roomStr).emit("message_deleted", { messageId });
    } catch (error) {
      console.error("Failed to delete message:", error);
    }
  });

  socket.on("react_message", async ({ messageId, userId, emoji, roomId }) => {
    const roomStr = String(roomId);
    const userIdInt = toInt(userId);
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
    const userIdInt = toInt(userId);
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
      }
    } catch (error) {
      console.error("Failed to mark message read:", error);
    }
  });
};
