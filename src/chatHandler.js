import pool from "./db.js"; // app.js와 동일한 위치에 있으므로 ./db.js가 맞습니다.

export default function registerChatHandlers(io) {
  io.on("connection", (socket) => {
    console.log("새로운 사용자 연결됨:", socket.id);

    socket.on("join_room", async ({ roomId, nickname, userId }) => {
      socket.join(String(roomId));
      console.log(`사용자 ${nickname}(${socket.id})가 ${roomId}번 방에 입장함`);

      const messageText = `${nickname}님이 입장하셨습니다.`;

      // DB에 입장 기록 저장 (is_system = 1)
      try {
        await pool.query(
          "INSERT INTO chat_messages (post_id, user_id, message, is_system) VALUES (?, ?, ?, ?)",
          [roomId, userId, messageText, 1],
        );
      } catch (e) {
        console.error("❌ 입장 메시지 DB 저장 실패:", e.message);
      }

      // 실시간 전송용 객체
      const systemMsg = {
        id: `system-${Date.now()}`,
        room_id: roomId,
        user_id: userId,
        nickname: nickname,
        message: messageText,
        is_system: 1,
        created_at: new Date(),
      };

      io.to(String(roomId)).emit("receive_message", systemMsg);
    });

    socket.on("send_message", async (data) => {
      const { room_id, user_id, message, nickname, image } = data;

      const msgObj = {
        ...data,
        created_at: new Date(),
        id: Date.now(),
      };

      console.log(
        `메시지 전송 - 방:${room_id}, 사용자:${nickname}, 이미지:${!!image}`,
      );

      // 실시간 브로드캐스트
      io.to(String(room_id)).emit("receive_message", msgObj);

      // DB 저장
      try {
        await pool.query(
          "INSERT INTO chat_messages (post_id, user_id, message, image) VALUES (?, ?, ?, ?)",
          [room_id, user_id, message, image || null],
        );
      } catch (e) {
        console.error("❌ 채팅 DB 저장 실패:", e.message);
      }
    });

    socket.on("disconnect", () => {
      console.log("사용자 연결 해제:", socket.id);
    });
  });
}
