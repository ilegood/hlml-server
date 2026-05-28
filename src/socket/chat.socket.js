import { registerMessageSocket } from "./message.socket.js";
import { registerRoomSocket } from "./room.socket.js";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import pool from "../db.js";

const onlineUsers = new Map(); // userId -> Set<socketId>

const getRelevantUserIds = async (userId) => {
  const [friendRows] = await pool.query(
    `SELECT requester_id, target_id FROM user_relations
     WHERE status = 'accepted'
     AND (requester_id = ? OR target_id = ?)`,
    [userId, userId],
  );
  const friendIds = friendRows.map((row) =>
    Number(row.requester_id) === Number(userId)
      ? Number(row.target_id)
      : Number(row.requester_id),
  );

  const [dmRows] = await pool.query(
    `SELECT user1_id, user2_id FROM dm_rooms
     WHERE user1_id = ? OR user2_id = ?`,
    [userId, userId],
  );
  const dmPartnerIds = dmRows.map((row) =>
    Number(row.user1_id) === Number(userId)
      ? Number(row.user2_id)
      : Number(row.user1_id),
  );

  const set = new Set([...friendIds, ...dmPartnerIds]);
  return [...set];
};

const broadcastOnlineStatus = async (io, userId, online) => {
  try {
    const ids = await getRelevantUserIds(userId);
    ids.forEach((id) => {
      io.to(`user_${id}`).emit("friend_online_status", {
        userId: Number(userId),
        online,
      });
    });
    if (ids.length > 0) {
      console.log(`Broadcast online=${online} for user ${userId} to ${ids.length} partners`);
    }
  } catch (error) {
    console.error("Failed to broadcast online status:", error);
  }
};

export const registerChatSocket = (io) => {
  io.on("connection", async (socket) => {
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

    const uid = socket.data.userId;
    if (uid) {
      if (!onlineUsers.has(uid)) {
        onlineUsers.set(uid, new Set());
      }
      onlineUsers.get(uid).add(socket.id);

      if (onlineUsers.get(uid).size === 1) {
        broadcastOnlineStatus(io, uid, true);
      }
    }

    console.log("Socket connected:", socket.id);

    registerRoomSocket(io, socket);
    registerMessageSocket(io, socket);

    socket.on("get_online_friends", async (_, ack) => {
      if (!uid) {
        if (typeof ack === "function") ack([]);
        return;
      }
      try {
        const ids = await getRelevantUserIds(uid);
        const onlineIds = ids.filter((id) =>
          onlineUsers.has(id),
        );
        if (typeof ack === "function") ack(onlineIds);
      } catch (error) {
        console.error("Failed to get online friends:", error);
        if (typeof ack === "function") ack([]);
      }
    });

    socket.on("disconnect", () => {
      console.log("Socket disconnected:", socket.id);

      if (uid && onlineUsers.has(uid)) {
        onlineUsers.get(uid).delete(socket.id);
        if (onlineUsers.get(uid).size === 0) {
          onlineUsers.delete(uid);
          broadcastOnlineStatus(io, uid, false);
        }
      }
    });
  });
};
