const express = require("express"); // Express 프레임워크 로드
const http = require("http"); // HTTP 모듈 로드
const { Server } = require("socket.io"); // Socket.io 클래스 로드
const path = require("path"); // 경로 처리 모듈 로드
const { ROOMS } = require("./chat-app/data/channels");

const app = express();
const server = http.createServer(app);
const io = new Server(server); // HTTP 서버에 Socket.io 연결

const PORT = 4000; // 서버 포트 번호 설정

// 정적 파일 서빙: /public 폴더 내의 HTML, CSS, JS를 웹에서 접근 가능하게 설정
app.use(express.static(path.join(__dirname, "chat-app", "public")));

// 메모리 데이터 저장소 (서버 재시작 시 초기화됨, 실제 서비스는 DB 권장)
const messages = {}; // 채널별 메시지 내역 저장소
const users = new Map(); // 현재 접속 중인 소켓 정보 저장 (ID 기준)
const members = new Map(); // 전체 유저 정보 저장 (닉네임 기준, 온라인/오프라인 상태 포함)
let serverHost = null; // 서버 전체 방장 (1명)

io.on("connection", (socket) => {
  // 1. 채팅 입장 이벤트 처리
  socket.on("join", ({ username, channel }) => {
    const user = {
      id: socket.id,
      username,
      channel,
      nameColor: "#5865f2", // 기본 닉네임 색상
      online: true,
    };
    users.set(socket.id, user);
    members.set(username, user); // 멤버 목록에 추가하거나 정보 업데이트

    socket.join(channel); // 해당 소켓을 소켓 룸(채널)에 입장시킴

    // 서버 전체 방장이 없으면 첫 접속자를 방장으로 설정
    if (!serverHost) {
      serverHost = username;
    }

    if (!messages[channel]) messages[channel] = [];

    // 클라이언트에 데이터 전송
    socket.emit("rooms", ROOMS);
    socket.emit("history", { channel, messages: messages[channel] });
    io.emit("users", Array.from(members.values())); // 전체 멤버 목록 브로드캐스트
    io.emit("serverHost", serverHost);

    // 채널 내 다른 사람들에게 입장 알림 전송
    socket
      .to(channel)
      .emit("system", { channel, text: `${username}님이 입장하셨습니다.` });
  });

  // 2. 채널 이동 이벤트 처리
  socket.on("switchChannel", (newChannel) => {
    const user = users.get(socket.id);
    if (!user) return;

    const oldChannel = user.channel;
    socket.leave(oldChannel); // 이전 채널 퇴장
    user.channel = newChannel; // 정보 갱신
    socket.join(newChannel); // 새 채널 입장

    if (members.has(user.username)) {
      members.get(user.username).channel = newChannel;
    }

    if (!messages[newChannel]) messages[newChannel] = [];

    // 새 채널 내역 전송 및 정보 갱신
    socket.emit("history", {
      channel: newChannel,
      messages: messages[newChannel],
    });
    io.emit("users", Array.from(members.values()));
    io.emit("serverHost", serverHost);
  });

  // 3. 메시지/이미지 공통 처리 함수
  const handleMessage = (channel, payload, isImage = false) => {
    const user = users.get(socket.id);
    if (!user) return;

    const msg = {
      id: Date.now() + Math.random(), // 고유 ID 생성
      username: user.username,
      nameColor: user.nameColor,
      time: new Date().toLocaleTimeString("ko-KR", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      replyTo: payload.replyTo, // 답장 대상 정보
      reactions: {}, // 리액션(이모지) 데이터
      ...(isImage ? { image: payload.dataUrl } : { text: payload.text }), // 이미지 혹은 텍스트 저장
    };

    if (!messages[channel]) messages[channel] = [];
    messages[channel].push(msg); // 메모리에 메시지 저장
    io.to(channel).emit("message", { channel, msg }); // 채널 전체에 메시지 전송
  };

  socket.on("message", (data) => handleMessage(data.channel, data));
  socket.on("image", (data) => handleMessage(data.channel, data, true));

  // 4. 메시지 리액션(이모지) 처리
  socket.on("reaction", ({ channel, msgId, emoji }) => {
    const user = users.get(socket.id);
    const msg = messages[channel]?.find((m) => String(m.id) === String(msgId));
    if (!msg || !user) return;

    if (!msg.reactions[emoji]) msg.reactions[emoji] = [];
    const index = msg.reactions[emoji].indexOf(user.username);

    // 이미 클릭한 이모지면 취소, 아니면 추가 (Toggle 방식)
    if (index > -1) msg.reactions[emoji].splice(index, 1);
    else msg.reactions[emoji].push(user.username);

    io.to(channel).emit("reaction", {
      channel,
      msgId,
      emoji,
      users: msg.reactions[emoji],
    });
  });

  // 5. 메시지 수정 및 삭제
  socket.on("editMessage", ({ channel, msgId, newText }) => {
    const user = users.get(socket.id);
    const msg = messages[channel]?.find((m) => String(m.id) === String(msgId));
    if (msg && msg.username === user.username) {
      msg.text = newText;
      msg.edited = true;
      io.to(channel).emit("editMessage", { channel, msgId, newText });
    }
  });

  socket.on("deleteMessage", ({ channel, msgId }) => {
    const user = users.get(socket.id);
    const index = messages[channel]?.findIndex(
      (m) => String(m.id) === String(msgId),
    );
    if (index > -1) {
      const msg = messages[channel][index];
      // 본인이거나 서버 방장인 경우에만 삭제 가능
      if (msg.username === user.username || serverHost === user.username) {
        messages[channel].splice(index, 1);
        io.to(channel).emit("deleteMessage", { channel, msgId });
      }
    }
  });

  // 6. 타이핑 상태 및 닉네임 색상 변경
  socket.on("typing", ({ channel }) => {
    const user = users.get(socket.id);
    if (user) socket.to(channel).emit("typing", { username: user.username });
  });

  socket.on("changeNameColor", ({ color }) => {
    const user = users.get(socket.id);
    if (user) {
      user.nameColor = color;
      if (members.has(user.username)) {
        members.get(user.username).nameColor = color;
      }
      io.to(user.channel).emit("nameColorUpdate", {
        username: user.username,
        color,
      });
      io.emit("users", Array.from(members.values()));
    }
  });

  // 7. 브라우저 탭 활성/비활성 감지에 따른 온라인 상태 업데이트
  socket.on("updateStatus", (isOnline) => {
    const user = users.get(socket.id);
    if (user && members.has(user.username)) {
      members.get(user.username).online = isOnline;
      io.emit("users", Array.from(members.values()));
    }
  });

  // 8. 유저 추방 (방장 전용)
  socket.on("kickUser", ({ username, channel }) => {
    const hostUser = users.get(socket.id);
    if (serverHost === hostUser?.username) {
      members.delete(username); // 멤버 목록에서 완전 삭제

      const target = Array.from(users.values()).find(
        (u) => u.username === username && u.channel === channel,
      );
      if (target) {
        io.to(target.id).emit("kicked", { channel, by: hostUser.username });
      }

      io.emit("users", Array.from(members.values())); // 전체 목록 갱신 알림
    }
  });

  // 9. 소켓 연결 종료 처리
  socket.on("disconnect", () => {
    const user = users.get(socket.id);
    if (user) {
      const { username, channel } = user;
      users.delete(socket.id); // 접속자 맵에서 삭제

      // 멤버 목록에서는 오프라인(회색)으로 표시하기 위해 online 값만 false로 변경
      if (members.has(username)) {
        members.get(username).online = false;
      }

      io.emit("users", Array.from(members.values()));

      // 나간 사람이 서버 방장이었다면 다음 접속자에게 권한 위임
      if (serverHost === username) {
        const remaining = Array.from(users.values());
        serverHost = remaining.length > 0 ? remaining[0].username : null;
        io.emit("serverHost", serverHost);
      }
    }
  });
});

// 지정된 포트에서 서버 실행
server.listen(PORT, () =>
  console.log(`Server is running on http://localhost:${PORT}`),
);
