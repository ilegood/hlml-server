import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { registerMessageSocket } from "./message.socket.js";
import { registerRoomSocket } from "./room.socket.js";

export const registerChatSocket = (io) => {
  io.use((socket, next) => {
    const token =
      socket.handshake.auth?.token || socket.handshake.headers?.authorization;
    if (!token) return next();

    try {
      const cleanToken = token.startsWith("Bearer ") ? token.slice(7) : token;
      const decoded = jwt.verify(cleanToken, env.jwtSecret);
      socket.userId = decoded.userId ?? decoded.user_id ?? decoded.sub;
      next();
    } catch (err) {
      console.error("Socket auth error:", err.message);
      next();
    }
  });

  io.on("connection", (socket) => {
    console.log("Socket connected:", socket.id, "User:", socket.userId);

    if (socket.userId) {
      socket.join(`user_${socket.userId}`);
    }

    registerRoomSocket(io, socket);
    registerMessageSocket(io, socket);

    socket.on("disconnect", () => {
      console.log("Socket disconnected:", socket.id);
    });
  });
};
