const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // 로컬 HTML 파일에서 접근 가능하도록 모든 출처 허용
    methods: ["GET", "POST"],
  },
});
const PORT = 3000;

// 미들웨어 설정
// CORS 허용: 로컬 파일(html)에서 localhost API로 요청할 때 발생하는 보안 에러 방지
app.use(cors());
// JSON 요청 바디를 파싱하기 위해 필요 (chat_ai.js에서 전송한 JSON.stringify 파싱)
app.use(express.json());

io.on("connection", (socket) => {
  console.log(`[서버 로그] 새로운 클라이언트 접속: ${socket.id}`);

  socket.emit(
    "system",
    "채팅방에 입장했습니다! 다른 창에서 메시지를 보내보세요.",
  );

  socket.on("chat message", (msg) => {
    console.log(`[메시지 수신] ${socket.id}: ${msg}`);
    // 메시지를 보낸 사람을 제외한 '나머지 모든 창'에 메시지를 전송합니다.
    socket.broadcast.emit("chat message", msg);
  });

  socket.on("disconnect", () => {
    console.log(`[서버 로그] 클라이언트 접속 종료: ${socket.id}`);
  });
});

server.listen(PORT, () => {
  console.log(
    `테스트용 채팅 서버가 http://localhost:${PORT} 에서 실행 중입니다.`,
  );
});
