const { users } = require("./user");
// 유저 관리 핵심
module.exports = (io, socket) => {
  socket.on("join", ({ username, channel }) => {
    socket.username = username;

    users[socket.id] = {
      username,
      online: true,
    };

    socket.join(channel);

    io.emit("users", Object.values(users));
  });

  socket.on("updateStatus", (isOnline) => {
    if (users[socket.id]) {
      users[socket.id].online = isOnline;
    }
    io.emit("users", Object.values(users));
  });
};
