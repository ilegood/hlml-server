import express from "express";
import http from "http";
import { Server } from "socket.io";
import socketHandler from "./socket/index.js";

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

socketHandler(io); // 👈 여기로 넘김

server.listen(3000, () => {
  console.log("서버 실행됨");
});
