import pool from "./db.js";

const CHAT_ROOM_MAX_CAPACITY = 5;

export default function registerChatHandlers(io) {
  io.on("connection", (socket) => {
    console.log("New socket connected:", socket.id);

    socket.on("join_room", async ({ roomId, nickname, userId }) => {
      const numericRoomId = Number(roomId);

      try {
        const [rooms] = await pool.query(
          "SELECT author FROM posts WHERE post_id = ?",
          [numericRoomId],
        );

        if (rooms.length === 0) {
          socket.emit("error_message", "존재하지 않는 방입니다.");
          return;
        }

        const { author } = rooms[0];
        const maxCapacity = CHAT_ROOM_MAX_CAPACITY;

        const [entries] = await pool.query(
          "SELECT COUNT(*) as currentCount FROM room_entries WHERE channel = ?",
          [String(numericRoomId)],
        );
        const currentCount = entries[0].currentCount;

        const [userEntry] = await pool.query(
          "SELECT * FROM room_entries WHERE username = ? AND channel = ?",
          [nickname, String(numericRoomId)],
        );
        const isAlreadyMember = userEntry.length > 0;
        const isHost = nickname === author;

        if (!isHost && !isAlreadyMember && currentCount >= maxCapacity) {
          console.log(
            `[join denied] room ${numericRoomId} is full (${currentCount}/${maxCapacity})`,
          );
          socket.leave(String(numericRoomId));
          socket.emit("room_full", { maxCapacity });
          return;
        }

        socket.join(String(numericRoomId));
        socket.emit("room_info", { author });

        if (!isAlreadyMember) {
          console.log(
            `[new member] ${nickname} -> room ${numericRoomId} (${currentCount + 1}/${maxCapacity})`,
          );

          await pool.query(
            "INSERT INTO room_entries (username, channel) VALUES (?, ?)",
            [nickname, String(numericRoomId)],
          );

          await pool.query(
            "UPDATE posts SET participants = (SELECT COUNT(*) FROM room_entries WHERE channel = ?) WHERE post_id = ?",
            [String(numericRoomId), numericRoomId],
          );

          const joinMessage = `${nickname}님이 들어왔습니다.`;
          await pool.query(
            "INSERT INTO chat_messages (post_id, user_id, message, is_system) VALUES (?, ?, ?, ?)",
            [numericRoomId, userId || 0, joinMessage, 1],
          );

          io.to(String(numericRoomId)).emit("receive_message", {
            id: `join-${Date.now()}`,
            room_id: numericRoomId,
            nickname: "시스템",
            message: joinMessage,
            is_system: 1,
            created_at: new Date(),
          });
        } else {
          io.to(String(numericRoomId)).emit("receive_message", {
            id: `re-join-${Date.now()}`,
            room_id: numericRoomId,
            nickname: "시스템",
            message: `${nickname}님이 접속했습니다.`,
            is_system: 1,
            created_at: new Date(),
          });
        }
      } catch (err) {
        console.error("Failed to join room:", err.message);
      }
    });

    socket.on("send_message", async (data) => {
      const { room_id, user_id, message, image } = data;
      const msgObj = {
        ...data,
        created_at: new Date(),
        id: Date.now(),
      };

      io.to(String(room_id)).emit("receive_message", msgObj);

      try {
        await pool.query(
          "INSERT INTO chat_messages (post_id, user_id, message, image) VALUES (?, ?, ?, ?)",
          [room_id, user_id, message, image || null],
        );
      } catch (e) {
        console.error("Failed to save chat message:", e.message);
      }
    });

    socket.on("leave_room", ({ roomId }) => {
      socket.leave(String(roomId));
    });

    socket.on("disconnect", () => {
      console.log("Socket disconnected:", socket.id);
    });
  });
}
