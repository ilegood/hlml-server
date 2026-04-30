import { ROOMS } from "./channels.js";
import { users, members } from "./state.js";
import pool from "../src/db.js";

const CHAT_ROOM_MAX_CAPACITY = 5;

export const registerChatHandlers = (io, socket) => {
  const handleJoin = async (username, channel, userId) => {
    const numericChannel = Number(channel);

    try {
      const [rooms] = await pool.query(
        "SELECT author FROM posts WHERE post_id = ?",
        [numericChannel],
      );

      if (rooms.length === 0) {
        socket.emit("error_message", "존재하지 않는 방입니다.");
        return;
      }

      const { author } = rooms[0];
      const maxCapacity = CHAT_ROOM_MAX_CAPACITY;

      const [entries] = await pool.query(
        "SELECT COUNT(*) as currentCount FROM room_entries WHERE channel = ?",
        [String(numericChannel)],
      );
      const currentCount = entries[0].currentCount;

      const [existingEntry] = await pool.query(
        "SELECT * FROM room_entries WHERE username = ? AND channel = ?",
        [username, String(numericChannel)],
      );

      const isNewMember = existingEntry.length === 0;

      if (isNewMember && currentCount >= maxCapacity) {
        socket.leave(String(numericChannel));
        socket.emit("room_full", { maxCapacity });
        return;
      }

      socket.join(String(numericChannel));
      socket.emit("room_info", { author });

      if (isNewMember) {
        console.log(
          `[new member] ${username} -> room ${numericChannel} (${currentCount + 1}/${maxCapacity})`,
        );

        await pool.query(
          "INSERT INTO room_entries (username, channel) VALUES (?, ?)",
          [username, String(numericChannel)],
        );

        await pool.query(
          "UPDATE posts SET participants = (SELECT COUNT(*) FROM room_entries WHERE channel = ?) WHERE post_id = ?",
          [String(numericChannel), numericChannel],
        );

        const systemMsgText = `${username}님이 들어왔습니다.`;
        await pool.query(
          "INSERT INTO chat_messages (post_id, user_id, message, is_system) VALUES (?, ?, ?, ?)",
          [numericChannel, userId || 0, systemMsgText, 1],
        );

        io.to(String(numericChannel)).emit("receive_message", {
          id: `join-${Date.now()}`,
          room_id: numericChannel,
          nickname: "시스템",
          message: systemMsgText,
          is_system: 1,
          created_at: new Date(),
        });
      } else {
        console.log(`[rejoin] ${username} -> room ${numericChannel}`);

        io.to(String(numericChannel)).emit("receive_message", {
          id: `re-join-${Date.now()}`,
          room_id: numericChannel,
          nickname: "시스템",
          message: `${username}님이 접속했습니다.`,
          is_system: 1,
          created_at: new Date(),
        });
      }

      const user = {
        id: socket.id,
        username,
        channel: numericChannel,
        nameColor: "#5865f2",
        online: true,
      };
      users.set(socket.id, user);
      members.set(username, user);

      socket.emit("rooms", ROOMS);
      socket.emit("history", { channel: numericChannel, messages: [] });
      io.emit("users", Array.from(members.values()));
    } catch (err) {
      console.error("Failed to join room:", err);
    }
  };

  socket.on("join", ({ username, channel }) => handleJoin(username, channel, 0));

  socket.on("join_room", (data) => {
    handleJoin(data.nickname, data.roomId, data.userId);
  });

  socket.on("send_message", async (data) => {
    const { room_id, user_id, message, nickname, image } = data;
    const msgObj = {
      id: Date.now() + Math.random(),
      room_id,
      user_id,
      nickname,
      message,
      image,
      created_at: new Date(),
    };

    io.to(String(room_id)).emit("receive_message", msgObj);

    try {
      await pool.query(
        "INSERT INTO chat_messages (post_id, user_id, message, image) VALUES (?, ?, ?, ?)",
        [room_id, user_id, message, image || null],
      );
    } catch (e) {
      console.error("Failed to save chat message:", e);
    }
  });

  socket.on("leave_room", ({ roomId }) => {
    socket.leave(String(roomId));
  });

  socket.on("disconnect", () => {
    const user = users.get(socket.id);
    if (user) {
      users.delete(socket.id);
      if (members.has(user.username)) members.get(user.username).online = false;
      io.emit("users", Array.from(members.values()));
    }
  });
};
