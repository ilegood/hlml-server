const { messages } = require("../data/messages");

// 메세지 전용
module.exports = (io, socket) => {
  socket.on("message", ({ channel, text }) => {
    const msg = {
      id: Date.now(),
      text,
      username: socket.username,
    };

    messages[channel].push(msg);

    io.to(channel).emit("message", { channel, msg });
  });
};
