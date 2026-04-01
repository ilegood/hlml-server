import chat from "./chat.js";
import user from "./user.js";
import channel from "./channels.js";

// 기능별 파일 연결
module.exports = (io) => {
  io.on("connection", (socket) => {
    user(io, socket);
    chat(io, socket);
    channel(io, socket);
  });
};
