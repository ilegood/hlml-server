import { registerMessageSocket } from "./message.socket.js";
import { registerRoomSocket } from "./room.socket.js";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export const registerChatSocket = (io) => {
  io.on("connection", (socket) => {
    const token = socket.handshake.auth?.token;
    if (token) {
      try {
        const decoded = jwt.verify(token, env.jwtSecret);
        socket.data.userId = decoded.userId ?? decoded.user_id ?? decoded.sub;
        if (socket.data.userId) {
          socket.join(`user_${socket.data.userId}`);
        }
      } catch (error) {
        console.error("Socket auth failed:", error.name, error.message);
      }
    }

    console.log("Socket connected:", socket.id);

    registerRoomSocket(io, socket);
    registerMessageSocket(io, socket);

    socket.on("disconnect", () => {
      console.log("Socket disconnected:", socket.id);
    });
  });
};
