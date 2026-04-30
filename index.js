import express from "express";
import http from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";
import { registerChatHandlers } from "./socket/chatHandlers.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 4000;

// 정적 파일 서빙
app.use(express.static(path.join(__dirname, "public")));

io.on("connection", (socket) => {
  console.log("새로운 사용자 연결됨:", socket.id);
  registerChatHandlers(io, socket);
});

server.listen(PORT, () =>
  console.log(`Server is running on http://localhost:${PORT}`),
);
