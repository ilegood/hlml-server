import { users } from "../data/users.js";

export default (io, socket) => {
  socket.on("join", ({ username, channel }) => {
    socket.username = username;
    socket.currentChannel = channel;

    users[socket.id] = {
      username,
      online: true,
      channel,
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

  socket.on("disconnect", () => {
    delete users[socket.id];
    io.emit("users", Object.values(users));
  });
};
