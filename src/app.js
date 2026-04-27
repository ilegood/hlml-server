import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

// 분리된 모듈들을 현재 위치(src) 기준으로 가져옵니다.
import pool from "./db.js";
import registerChatHandlers from "./chatHandler.js";

// ES 모듈에서 __dirname 정의
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 환경 변수 로드 (.env 파일이 루트에 있는 경우)
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  maxHttpBufferSize: 1e8, // 100MB까지 허용 (이미지 전송 대응)
});

app.use(cors());
app.use(express.json());
// 정적 파일 서빙 설정 (루트의 public 폴더)
app.use(express.static(path.join(__dirname, "..", "public")));

// 회원가입 API
app.post("/api/register", async (req, res) => {
  const {
    nickname,
    email,
    password,
    birthday,
    gender,
    phone_number,
    address,
    profile_img,
    bio,
  } = req.body;
  try {
    const [result] = await pool.query(
      "INSERT INTO users (nickname, email, password, birthday, gender, phone_number, address, profile_img, bio) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        nickname,
        email,
        password,
        birthday,
        gender,
        phone_number,
        address,
        profile_img || null,
        bio || null,
      ],
    );
    res.json({ success: true, user_id: result.insertId });
  } catch (e) {
    console.error("회원가입 실패 상세:", e);
    res
      .status(500)
      .json({ success: false, message: "회원가입 실패: " + e.message });
  }
});

// 로그인 API (아이디로 로그인)
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  console.log("로그인 시도:", email);
  try {
    const [rows] = await pool.query(
      "SELECT user_id AS id, nickname, email, profile_img FROM users WHERE email = ? AND password = ?",
      [email, password],
    );

    if (rows.length > 0) {
      res.json({ success: true, user: rows[0] });
    } else {
      res
        .status(401) // 401: Unauthorized
        .json({
          success: false,
          message: "아이디 또는 비밀번호가 일치하지 않습니다.",
        });
    }
  } catch (e) {
    console.error("로그인 중 서버 에러:", e);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

// 방 생성 API (500 에러 해결을 위해 더 견고하게 수정)
app.post("/api/rooms", async (req, res) => {
  const { title, content, author } = req.body;
  if (!title) {
    return res.status(400).json({ error: "방 제목이 필요합니다." });
  }

  console.log("방 생성 요청:", title);

  try {
    const [result] = await pool.query(
      "INSERT INTO posts (title, content, author) VALUES (?, ?, ?)",
      [title, content || "", author || "익명"],
    );
    console.log("방 생성 성공:", result.insertId);
    res.json({ id: result.insertId, post_id: result.insertId, title });
  } catch (e) {
    console.error("DB 방 생성 실패 상세 원인:", e);
    // 실제 실패 원인을 클라이언트에게도 전달 (개발 단계)
    res.status(500).json({
      error: "DB 게시글 생성 실패",
      message: e.message,
      code: e.code,
    });
  }
});

// 나머지 API...
app.get("/api/rooms", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT post_id AS id, title, status FROM posts",
    );
    res.json(rows);
  } catch (e) {
    res.json([]);
  }
});

app.post("/api/chatting/send", async (req, res) => {
  const { room_id, user_id, message, image } = req.body;
  try {
    // API는 단순히 DB 저장용으로만 남겨두거나, 아예 호출하지 않도록 합니다.
    await pool.query(
      "INSERT INTO chat_messages (post_id, user_id, message, image) VALUES (?, ?, ?, ?)",
      [room_id, user_id, message, image || null],
    );
    res.json({ success: true });
  } catch (e) {
    console.warn("메시지 DB 저장 실패");
    res.status(500).json({ success: false });
  }
});

app.get("/api/chatting/:roomId", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT mc.message_id AS id, mc.*, u.nickname, u.profile_img FROM chat_messages mc LEFT JOIN users u ON mc.user_id = u.user_id WHERE mc.post_id = ? ORDER BY mc.created_at ASC",
      [req.params.roomId],
    );
    res.json(rows);
  } catch (e) {
    console.error("채팅 내역 불러오기 실패:", e);
    res.json([]);
  }
});

// 소켓 핸들러 등록
registerChatHandlers(io);

// 서버 시작 및 DB 연결 테스트
const startServer = async () => {
  const PORT = process.env.PORT || 4000;
  try {
    await pool.query("SELECT 1");
    console.log("✅ 데이터베이스 연결 성공!");
  } catch (err) {
    console.error("❌ 데이터베이스 연결 실패:", err.message);
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log("-----------------------------------------");
    console.log(`서버가 ${PORT}번 포트에서 정상 실행 중입니다.`);
    console.log("-----------------------------------------");
  });
};

startServer();
