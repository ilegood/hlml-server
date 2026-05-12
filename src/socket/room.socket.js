import pool from "../db.js";
import { parseJsonArray, toInt } from "./utils.js";

const formatMessageRows = (rows) =>
  rows.map((row) => ({
    ...row,
    nickname: row.is_system
      ? row.nickname
      : row.latestNickname || row.nickname,
    profileImg: row.latestProfileImg || "",
    reactions: parseJsonArray(row.reactions),
  }));

export const registerRoomSocket = (io, socket) => {
  const saveSystemMessage = async ({ roomId, userId, content }) => {
    const [result] = await pool.query(
      "INSERT INTO messages (room_id, user_id, nickname, content, is_system) VALUES (?, ?, ?, ?, ?)",
      [roomId, userId, "System", content, 1],
    );

    return {
      id: result.insertId,
      roomId: String(roomId),
      userId,
      nickname: "System",
      content,
      isSystem: true,
      created_at: new Date().toISOString(),
    };
  };

  socket.on("join_room", async ({ roomId, nickname, userId }) => {
    const roomIdInt = toInt(roomId);
    const userIdInt = toInt(userId);
    if (!roomIdInt) return;

    const roomStr = String(roomIdInt);
    socket.join(roomStr);

    try {
      const [roomRows] = await pool.query(
        "SELECT title, image FROM posts WHERE post_id = ?",
        [roomIdInt],
      );

      if (roomRows.length > 0) {
        socket.emit("room_info", {
          title: roomRows[0].title,
          image: roomRows[0].image,
        });
      }

      if (nickname && userIdInt) {
        const joinMsgContent = `${nickname}\ub2d8\uc774 \uc785\uc7a5\ud558\uc168\uc2b5\ub2c8\ub2e4.`;
        const [existing] = await pool.query(
          "SELECT id FROM messages WHERE room_id = ? AND user_id = ? AND is_system = 1 AND content = ?",
          [roomIdInt, userIdInt, joinMsgContent],
        );

        if (existing.length === 0) {
          const message = await saveSystemMessage({
            roomId: roomIdInt,
            userId: userIdInt,
            content: joinMsgContent,
          });

          io.to(roomStr).emit("receive_message", message);
        }
      }

      const [rows] = await pool.query(
        `SELECT
           m.*,
           ANY_VALUE(u.nickname) AS latestNickname,
           ANY_VALUE(u.profile_img) AS latestProfileImg,
           JSON_ARRAYAGG(
             IF(r.id IS NOT NULL, JSON_OBJECT('emoji', r.emoji, 'userId', r.user_id), NULL)
           ) AS reactions
         FROM messages m
         LEFT JOIN users u ON m.user_id = u.user_id
         LEFT JOIN message_reactions r ON m.id = r.message_id
         WHERE m.room_id = ?
         GROUP BY m.id
         ORDER BY m.created_at ASC
         LIMIT 50`,
        [roomIdInt],
      );

      socket.emit("load_messages", formatMessageRows(rows));
    } catch (error) {
      console.error("Failed to load room messages:", error);
    }
  });

  socket.on("leave_room", async ({ roomId, nickname, userId }, ack) => {
    const roomIdInt = toInt(roomId);
    const userIdInt = toInt(userId);
    if (!roomIdInt || !userIdInt) {
      if (typeof ack === "function") ack({ ok: false });
      return;
    }

    const roomStr = String(roomIdInt);

    try {
      socket.leave(roomStr);
      if (typeof ack === "function") ack({ ok: true });
    } catch (error) {
      console.error("Failed to leave room:", error);
      if (typeof ack === "function") ack({ ok: false });
    }
  });
};
