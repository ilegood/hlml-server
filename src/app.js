import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import http from "http";
import { Server } from "socket.io";
import pool from "./db.js";

import postRoutes from "./routes/post.js";
import userRoutes from "./routes/user.js";

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"],
  },
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(cors());
app.use(express.json());

// static
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// routes
app.use("/posts", postRoutes);
app.use("/users", userRoutes);

io.on("connection", (socket) => {
  console.log("유저 접속:", socket.id);

  socket.on("join_room", async (roomId) => {
    socket.join(roomId);

    try {
      // 채팅방 정보(게시글 제목) 가져오기
      const [roomRows] = await pool.query(
        "SELECT title FROM posts WHERE id = ?",
        [roomId],
      );
      if (roomRows.length > 0) {
        socket.emit("room_info", { title: roomRows[0].title });
      }

      const [rows] = await pool.query(
        `SELECT m.*, 
          JSON_ARRAYAGG(
            IF(r.id IS NOT NULL, JSON_OBJECT('emoji', r.emoji, 'userId', r.user_id), NULL)
          ) as reactions
         FROM messages m
         LEFT JOIN message_reactions r ON m.id = r.message_id
         WHERE m.room_id = ?
         GROUP BY m.id
         ORDER BY m.created_at ASC LIMIT 50`,
        [roomId],
      );
      const formatted = rows.map((row) => ({
        ...row,
        reactions: JSON.parse(row.reactions || "[]").filter(Boolean),
      }));
      socket.emit("load_messages", formatted);
    } catch (err) {
      console.error("메시지 불러오기 실패:", err);
    }
  });

  socket.on("send_message", async (data) => {
    const { roomId, userId, nickname, content, isSystem, parentId } = data;

    try {
      const [result] = await pool.query(
        "INSERT INTO messages (room_id, user_id, nickname, content, is_system, parent_id) VALUES (?, ?, ?, ?, ?, ?)",
        [roomId, userId, nickname, content, isSystem ? 1 : 0, parentId || null],
      );
      const messageId = result.insertId;
      io.to(roomId).emit("receive_message", { ...data, id: messageId });
    } catch (err) {
      console.error("메시지 저장 실패:", err);
    }
  });

  socket.on("edit_message", async ({ messageId, content, roomId }) => {
    try {
      await pool.query(
        "UPDATE messages SET content = ?, is_edited = 1 WHERE id = ?",
        [content, messageId],
      );
      io.to(roomId).emit("message_edited", { messageId, content });
    } catch (err) {
      console.error("메시지 수정 실패:", err);
    }
  });

  socket.on("delete_message", async ({ messageId, roomId }) => {
    try {
      await pool.query(
        "UPDATE messages SET is_deleted = 1, content = '삭제된 메시지입니다.' WHERE id = ?",
        [messageId],
      );
      io.to(roomId).emit("message_deleted", { messageId });
    } catch (err) {
      console.error("메시지 삭제 실패:", err);
    }
  });

  socket.on("react_message", async ({ messageId, userId, emoji, roomId }) => {
    try {
      const [[existing]] = await pool.query(
        "SELECT id FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?",
        [messageId, userId, emoji],
      );

      if (existing) {
        await pool.query("DELETE FROM message_reactions WHERE id = ?", [
          existing.id,
        ]);
      } else {
        await pool.query(
          "INSERT INTO message_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)",
          [messageId, userId, emoji],
        );
      }

      const [reactions] = await pool.query(
        "SELECT emoji, user_id FROM message_reactions WHERE message_id = ?",
        [messageId],
      );
      io.to(roomId).emit("update_reactions", { messageId, reactions });
    } catch (err) {
      console.error("리액션 실패:", err);
    }
  });

  socket.on("mark_read", async ({ messageId, userId, roomId }) => {
    try {
      const [[{ readCount }]] = await pool.query(
        "SELECT COUNT(*) as readCount FROM message_reads WHERE message_id = ? AND user_id = ?",
        [messageId, userId],
      );

      if (readCount === 0) {
        await pool.query(
          "INSERT INTO message_reads (message_id, user_id) VALUES (?, ?)",
          [messageId, userId],
        );
        const [[{ total }]] = await pool.query(
          "SELECT COUNT(*) as total FROM message_reads WHERE message_id = ?",
          [messageId],
        );
        io.to(roomId).emit("update_read_count", {
          messageId,
          readCount: total,
        });
      }
    } catch (err) {
      console.error("읽음 처리 실패:", err);
    }
  });

  socket.on("disconnect", () => {
    console.log("유저 퇴장:", socket.id);
  });
});
server.listen(4000, () => {
  console.log("Server running on 4000");
});
