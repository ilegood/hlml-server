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
import friendsRoutes from "./routes/friends.js";
import chatRoutes from "./routes/chat.js";

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
app.use("/friends", friendsRoutes);
app.use("/posts", postRoutes);
app.use("/users", userRoutes);
app.use("/chat", chatRoutes);

io.on("connection", (socket) => {
  console.log("유저 접속:", socket.id);

  socket.on("join_room", async ({ roomId, nickname, userId }) => {
    try {
      // 강퇴 내역 확인 (post_bans 테이블 활용)
      const [banRows] = await pool.query(
        "SELECT id FROM post_bans WHERE post_id = ? AND user_id = ?",
        [roomId, userId],
      );

      if (banRows.length > 0) {
        socket.emit(
          "error_message",
          "이 방에서 강퇴당하여 다시 입장할 수 없습니다.",
        );
        return;
      }

      // 강퇴 여부 확인 통과 후 방 입장
      socket.join(roomId);
    } catch (err) {
      console.error("강퇴 여부 확인 실패:", err);
    }

    try {
      // 채팅방 정보 가져오기 (게시글 채팅 또는 DM)
      if (String(roomId).startsWith("dm_")) {
        const dmId = roomId.split("_")[1];
        const [roomRows] = await pool.query(
          `SELECT 
            u.nickname as targetNickname, 
            u.profile_img as targetProfileImg
          FROM dm_rooms dr
          JOIN users u ON (dr.user1_id = u.user_id AND dr.user2_id = ?) OR (dr.user2_id = u.user_id AND dr.user1_id = ?)
          WHERE dr.id = ?`,
          [userId, userId, dmId],
        );
        if (roomRows.length > 0) {
          socket.emit("room_info", {
            title: roomRows[0].targetNickname,
            image: roomRows[0].targetProfileImg,
            author: "System",
            isDM: true,
          });
        }
      } else {
        const [roomRows] = await pool.query(
          "SELECT title, image, author FROM posts WHERE post_id = ?",
          [roomId],
        );
        if (roomRows.length > 0) {
          socket.emit("room_info", {
            title: roomRows[0].title,
            image: roomRows[0].image,
            author: roomRows[0].author,
            isDM: false,
          });
        }
      }

      // 시스템 메시지: 유저 입장 알림 (DM이 아닐 때만)
      if (!String(roomId).startsWith("dm_") && nickname && userId) {
        // 이전에 입장하거나 퇴장한 기록이 있는지 확인
        const [history] = await pool.query(
          "SELECT id, content FROM messages WHERE room_id = ? AND user_id = ? AND is_system = 1 ORDER BY id DESC LIMIT 1",
          [roomId, userId],
        );

        let joinMsgContent = `${nickname}님이 입장하셨습니다.`;
        let shouldInsert = false;

        if (history.length === 0) {
          // 아예 처음 들어오는 경우
          shouldInsert = true;
        } else {
          // 기록이 있는데, 마지막 기록이 '퇴장'이었거나 이미 '입장' 기록이 있는 경우 (재입장 판단)
          // 여기서는 단순하게 "기록이 있으면 재입장"으로 처리하거나,
          // 더 정확하게 "마지막이 퇴장"이었을 때만 새 메시지를 넣을 수 있습니다.
          // 사용자의 요청은 "다시 입장 했을 때" 이므로, 퇴장 기록 이후 들어오는 상황을 타겟팅합니다.
          if (history[0].content.includes("퇴장하셨습니다")) {
            joinMsgContent = `${nickname}님이 다시 입장하셨습니다.`;
            shouldInsert = true;
          }
        }

        if (shouldInsert) {
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

  socket.on("leave_room", async ({ roomId, nickname, userId }) => {
    const leaveMsgContent = `${nickname}님이 퇴장하셨습니다.`;

    try {
      // 시스템 메시지 DB 저장
      const [result] = await pool.query(
        "INSERT INTO messages (room_id, user_id, nickname, content, is_system) VALUES (?, ?, ?, ?, ?)",
        [roomId, userId, "System", leaveMsgContent, 1],
      );

      io.to(roomId).emit("receive_message", {
        id: result.insertId,
        roomId,
        userId,
        nickname: "System",
        content: leaveMsgContent,
        isSystem: true,
        created_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error("퇴장 메시지 저장 실패:", err);
    }

    socket.leave(roomId);
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
        "SELECT emoji, user_id as userId FROM message_reactions WHERE message_id = ?",
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

  socket.on(
    "kick_user",
    async ({ roomId, targetUserId, targetNickname, myUserId }) => {
      try {
        // 1. 방장 권한 확인 (게시글 작성자와 요청 유저의 닉네임 비교)
        const [postRows] = await pool.query(
          "SELECT author FROM posts WHERE post_id = ?",
          [roomId],
        );
        const [userRows] = await pool.query(
          "SELECT nickname FROM users WHERE user_id = ?",
          [myUserId],
        );

        if (postRows.length === 0 || userRows.length === 0) return;

        const isAuthor = postRows[0].author === userRows[0].nickname;
        if (!isAuthor) {
          return socket.emit(
            "error_message",
            "방장만 유저를 강퇴할 수 있습니다.",
          );
        }

        // 1.5 DB에서 참여자 삭제 및 인원수 업데이트
        await pool.query(
          "DELETE FROM post_participants WHERE post_id = ? AND user_id = ?",
          [roomId, targetUserId],
        );

        // 1.7 post_bans 테이블에 강퇴 기록 추가 (목록 노출용)
        await pool.query(
          "INSERT IGNORE INTO post_bans (post_id, user_id) VALUES (?, ?)",
          [roomId, targetUserId],
        );

        // 2. 시스템 메시지 저장 (강퇴 알림 - 이것이 곧 ban 기록이 됨)
        const kickMsgContent = `${targetNickname}님이 강퇴되었습니다.`;
        const [result] = await pool.query(
          "INSERT INTO messages (room_id, user_id, nickname, content, is_system) VALUES (?, ?, ?, ?, ?)",
          [roomId, targetUserId, "System", kickMsgContent, 1],
        );

        const kickData = {
          id: result.insertId,
          roomId,
          userId: targetUserId, // 강퇴된 유저의 ID
          targetNickname,
          nickname: "System",
          content: kickMsgContent,
          isSystem: true,
          created_at: new Date().toISOString(),
        };

        // 3. 전체 방에 메시지 전송 및 특정 유저 강퇴 이벤트 전송
        io.to(roomId).emit("receive_message", kickData);
        io.to(roomId).emit("user_kicked", { targetUserId, roomId });
      } catch (err) {
        console.error("강퇴 처리 중 오류:", err);
      }
    },
  );

  socket.on("disconnect", () => {
    console.log("유저 퇴장:", socket.id);
  });
});
server.listen(4000, () => {
  console.log("Server running on 4000");
});
