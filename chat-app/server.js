const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 10 * 1024 * 1024,
});

app.use(express.static(path.join(__dirname, "public")));

const CHANNELS = [
  "일반",
  "자유수다",
  "정보공유",
  "개발잡담",
  "코드리뷰",
  "짤방",
];
const messages = {};
CHANNELS.forEach((ch) => (messages[ch] = []));

const users = {};

io.on("connection", (socket) => {
  console.log("접속:", socket.id);

  socket.on("join", ({ username, channel }) => {
    socket.username = username;
    socket.color =
      "#" +
      Math.floor(Math.random() * 0xaaaaaa + 0x333333)
        .toString(16)
        .padStart(6, "0");
    socket.currentChannel = channel || "일반";
    socket.join(socket.currentChannel);
    users[socket.id] = { username, color: socket.color, status: "online" };
    io.emit("users", Object.values(users));
    socket.emit("history", {
      channel: socket.currentChannel,
      messages: messages[socket.currentChannel].slice(-50),
    });
    io.to(socket.currentChannel).emit("system", {
      channel: socket.currentChannel,
      text: `${username}님이 입장했습니다.`,
    });
  });

  socket.on("switchChannel", (channel) => {
    if (socket.currentChannel) socket.leave(socket.currentChannel);
    socket.currentChannel = channel;
    socket.join(channel);
    socket.emit("history", { channel, messages: messages[channel].slice(-50) });
  });

  socket.on("message", ({ channel, text }) => {
    const msg = {
      id: Date.now(),
      username: socket.username,
      color: socket.color,
      text,
      time: new Date().toLocaleTimeString("ko-KR", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      reactions: {},
    };
    messages[channel].push(msg);
    if (messages[channel].length > 200) messages[channel].shift();
    io.to(channel).emit("message", { channel, msg });
  });

  socket.on("image", ({ channel, dataUrl, filename }) => {
    if (!dataUrl || dataUrl.length > 10 * 1024 * 1024) return;
    const msg = {
      id: Date.now(),
      username: socket.username,
      color: socket.color,
      text: "",
      image: dataUrl,
      filename: filename || "이미지",
      time: new Date().toLocaleTimeString("ko-KR", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      reactions: {},
    };
    messages[channel].push(msg);
    if (messages[channel].length > 200) messages[channel].shift();
    io.to(channel).emit("message", { channel, msg });
  });

  socket.on("reaction", ({ channel, msgId, emoji }) => {
    const msg = messages[channel].find((m) => m.id === msgId);
    if (!msg) return;
    if (!msg.reactions[emoji]) msg.reactions[emoji] = [];
    const idx = msg.reactions[emoji].indexOf(socket.username);
    if (idx === -1) msg.reactions[emoji].push(socket.username);
    else msg.reactions[emoji].splice(idx, 1);
    io.to(channel).emit("reaction", {
      channel,
      msgId,
      emoji,
      users: msg.reactions[emoji],
    });
  });

  socket.on("typing", ({ channel }) => {
    socket.to(channel).emit("typing", { username: socket.username });
  });

  socket.on("disconnect", () => {
    delete users[socket.id];
    io.emit("users", Object.values(users));
    if (socket.username && socket.currentChannel) {
      io.to(socket.currentChannel).emit("system", {
        channel: socket.currentChannel,
        text: `${socket.username}님이 퇴장했습니다.`,
      });
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () =>
  console.log(`서버 실행 중: http://localhost:${PORT}`),
);
