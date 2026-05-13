import { registerMessageSocket } from "./message.socket.js";
import { registerRoomSocket } from "./room.socket.js";

export const registerChatSocket = (io) => {
  io.on("connection", (socket) => {
    console.log("Socket connected:", socket.id);

    registerRoomSocket(io, socket);
    registerMessageSocket(io, socket);

    socket.on("disconnect", () => {
      console.log("Socket disconnected:", socket.id);
    });
  });
};
