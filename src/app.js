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

  socket.on("join_room", async ({ roomId, nickname, userId }) => {
    socket.join(roomId);

    try {
      // 채팅방 정보(게시글 제목, 이미지) 가져오기
      const [roomRows] = await pool.query(
        "SELECT title, image FROM posts WHERE post_id = ?",
        [roomId],
      );
      if (roomRows.length > 0) {
        socket.emit("room_info", {
          title: roomRows[0].title,
          image: roomRows[0].image,
        });
      }

      // 시스템 메시지: 유저 입장 알림 (DB 저장 및 전송)
      if (nickname && userId) {
        const joinMsgContent = `${nickname}님이 입장하셨습니다.`;
        // 해당 유저의 시스템 메시지(입장 알림)가 이미 있는지 확인
        const [existing] = await pool.query(
          "SELECT id, content FROM messages WHERE room_id = ? AND user_id = ? AND is_system = 1",
          [roomId, userId],
        );

        if (existing.length === 0) {
          // 최초 입장 시에만 저장
          const [result] = await pool.query(
            "INSERT INTO messages (room_id, user_id, nickname, content, is_system) VALUES (?, ?, ?, ?, ?)",
            [roomId, userId, "System", joinMsgContent, 1],
          );
          const messageId = result.insertId;

          io.to(roomId).emit("receive_message", {
            id: messageId,
            roomId,
            userId,
            nickname: "System",
            content: joinMsgContent,
            isSystem: true,
            created_at: new Date().toISOString(),
          });
        } else {
          // 이미 입장 메시지가 있는데 닉네임이 바뀐 경우 업데이트
          if (existing[0].content !== joinMsgContent) {
            await pool.query("UPDATE messages SET content = ? WHERE id = ?", [
              joinMsgContent,
              existing[0].id,
            ]);
            // 모든 클라이언트에 업데이트 알림 (이미 불러온 메시지 목록 갱신용)
            io.to(roomId).emit("message_edited", {
              messageId: existing[0].id,
              content: joinMsgContent,
            });
          }
        }
      }

      const [rows] = await pool.query(
        `SELECT 
    m.*, 
    ANY_VALUE(u.nickname) as latestNickname, 
    ANY_VALUE(u.profile_img) as latestProfileImg,
    JSON_ARRAYAGG(
      IF(r.id IS NOT NULL, JSON_OBJECT('emoji', r.emoji, 'userId', r.user_id), NULL)
    ) as reactions
   FROM messages m
   LEFT JOIN users u ON m.user_id = u.user_id
   LEFT JOIN message_reactions r ON m.id = r.message_id
   WHERE m.room_id = ?
   GROUP BY m.id
   ORDER BY m.created_at ASC LIMIT 50`,
        [roomId],
      );
      const formatted = rows.map((row) => {
        let reactions = [];
        try {
          if (Array.isArray(row.reactions)) {
            reactions = row.reactions;
          } else if (row.reactions) {
            reactions = JSON.parse(row.reactions);
          }
        } catch (e) {
          console.error("JSON parse error for reactions:", e);
        }
        return {
          ...row,
          nickname: row.is_system
            ? row.nickname
            : row.latestNickname || row.nickname,
          profileImg: row.latestProfileImg || "",
          reactions: reactions.filter(Boolean),
        };
      });
      socket.emit("load_messages", formatted);
    } catch (err) {
      console.error("메시지 불러오기 실패:", err);
    }
  });

  socket.on("send_message", async (data) => {
    const {
      roomId,
      userId,
      nickname,
      content,
      isSystem,
      parentId,
      profileImg,
    } = data;

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
