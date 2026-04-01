const chat = require("./chat");
const user = require("./user");
const channel = require("./channel");

// 기능별 파일 연결
module.exports = (io) => {
  io.on("connection", (socket) => {
    user(io, socket);
    chat(io, socket);
    channel(io, socket);
  });
};
