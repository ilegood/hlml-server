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
  const isDmRoom = (roomId) => String(roomId).startsWith("dm_");

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
    const userIdInt = toInt(userId);
    if (!roomId) return;

    const roomStr = String(roomId);
    socket.join(roomStr);

    try {
      if (isDmRoom(roomStr)) {
        const dmId = toInt(roomStr.slice(3));
        if (!dmId || !userIdInt) return;

        const [roomRows] = await pool.query(
          `SELECT
             u.nickname AS targetNickname,
             u.profile_img AS targetProfileImg
           FROM dm_rooms dr
           JOIN users u
             ON (dr.user1_id = u.user_id AND dr.user2_id = ?)
             OR (dr.user2_id = u.user_id AND dr.user1_id = ?)
           WHERE dr.id = ?`,
          [userIdInt, userIdInt, dmId],
        );

        if (roomRows.length > 0) {
          socket.emit("room_info", {
            title: roomRows[0].targetNickname,
            image: roomRows[0].targetProfileImg,
            author: "System",
            isDM: true,
          });
        }
      } else {
        const roomIdInt = toInt(roomId);
        if (!roomIdInt) return;

        if (userIdInt) {
          const [banRows] = await pool.query(
            "SELECT id FROM post_bans WHERE post_id = ? AND user_id = ?",
            [roomIdInt, userIdInt],
          );

          if (banRows.length > 0) {
            socket.emit("error_message", "You cannot re-enter this room.");
            socket.leave(roomStr);
            return;
          }
        }

        const [roomRows] = await pool.query(
          `SELECT p.title, p.image, p.place, p.latitude, p.longitude, u.nickname AS author
           FROM posts p
           JOIN users u ON p.user_id = u.user_id
           WHERE p.post_id = ?`,
          [roomIdInt],
        );

        if (roomRows.length > 0) {
          socket.emit("room_info", {
            title: roomRows[0].title,
            image: roomRows[0].image,
            author: roomRows[0].author,
            place: roomRows[0].place,
            latitude: roomRows[0].latitude,
            longitude: roomRows[0].longitude,
            isDM: false,
          });
        }

        if (nickname && userIdInt) {
          const joinMsgContent = `${nickname}\ub2d8\uc774 \uc785\uc7a5\ud558\uc168\uc2b5\ub2c8\ub2e4.`;
          const [existing] = await pool.query(
            "SELECT id FROM messages WHERE room_id = ? AND user_id = ? AND is_system = 1 AND content = ?",
            [roomStr, userIdInt, joinMsgContent],
          );

          if (existing.length === 0) {
            const message = await saveSystemMessage({
              roomId: roomStr,
              userId: userIdInt,
              content: joinMsgContent,
            });

            io.to(roomStr).emit("receive_message", message);
          }
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
        [roomStr],
      );

      socket.emit("load_messages", formatMessageRows(rows));
    } catch (error) {
      console.error("Failed to load room messages:", error);
    }
  });

  socket.on("leave_room", async ({ roomId, nickname, userId }, ack) => {
    const userIdInt = toInt(userId);
    if (!roomId || !userIdInt) {
      if (typeof ack === "function") ack({ ok: false });
      return;
    }

    const roomStr = String(roomId);

    try {
      socket.leave(roomStr);
      if (typeof ack === "function") ack({ ok: true });
    } catch (error) {
      console.error("Failed to leave room:", error);
      if (typeof ack === "function") ack({ ok: false });
    }
  });

  socket.on(
    "kick_user",
    async ({ roomId, targetUserId, targetNickname, myUserId }) => {
      const roomIdInt = toInt(roomId);
      const targetUserIdInt = toInt(targetUserId);
      const myUserIdInt = toInt(myUserId);
      if (!roomIdInt || !targetUserIdInt || !myUserIdInt) return;

      const roomStr = String(roomIdInt);

      try {
        const [[post]] = await pool.query(
          `SELECT p.post_id, u.nickname AS author
           FROM posts p
           JOIN users u ON p.user_id = u.user_id
           WHERE p.post_id = ?`,
          [roomIdInt],
        );
        const [[user]] = await pool.query(
          "SELECT nickname FROM users WHERE user_id = ?",
          [myUserIdInt],
        );

        if (!post || !user || post.author !== user.nickname) {
          socket.emit("error_message", "Only the room owner can kick users.");
          return;
        }

        await pool.query(
          "DELETE FROM post_participants WHERE post_id = ? AND user_id = ?",
          [roomIdInt, targetUserIdInt],
        );
        await pool.query(
          "INSERT IGNORE INTO post_bans (post_id, user_id) VALUES (?, ?)",
          [roomIdInt, targetUserIdInt],
        );
        const [[{ count }]] = await pool.query(
          "SELECT COUNT(*) AS count FROM post_participants WHERE post_id = ?",
          [roomIdInt],
        );
        const [[postCapacity]] = await pool.query(
          "SELECT capacity, participants, status FROM posts WHERE post_id = ?",
          [roomIdInt],
        );
        const participants = 1 + count;
        const wasFull =
          (postCapacity?.participants || 1) >= (postCapacity?.capacity || 2);
        const status =
          (postCapacity?.status === "\ubaa8\uc9d1\uc644\ub8cc" && !wasFull) ||
          participants >= (postCapacity?.capacity || 2)
            ? "\ubaa8\uc9d1\uc644\ub8cc"
            : "\ubaa8\uc9d1\uc911";
        await pool.query(
          "UPDATE posts SET participants = ?, status = ? WHERE post_id = ?",
          [participants, status, roomIdInt],
        );

        const kickMsgContent = `${targetNickname}\ub2d8\uc774 \uac15\ud1f4\ub418\uc5c8\uc2b5\ub2c8\ub2e4.`;
        const message = await saveSystemMessage({
          roomId: roomStr,
          userId: targetUserIdInt,
          content: kickMsgContent,
        });

        io.to(roomStr).emit("receive_message", {
          ...message,
          targetNickname,
        });
        io.to(roomStr).emit("user_kicked", {
          targetUserId: targetUserIdInt,
          roomId: roomStr,
        });
      } catch (error) {
        console.error("Failed to kick user:", error);
      }
    },
  );
};
