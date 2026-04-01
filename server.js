const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const socketHandler = require("./socket");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

socketHandler(io); // 👈 여기로 넘김

server.listen(3000, () => {
  console.log("서버 실행됨");
});
