import express from "express";
import mysql from "mysql2/promise";
import cors from "cors";
import dotenv from "dotenv";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// .env 파일이 src 안에 있으므로 경로를 명시해줍니다.
dotenv.config({ path: path.join(__dirname, ".env") });

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(cors());
app.use(express.json());

// DB 연결
const dbConfig = {
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_DATABASE || "hlml",
  port: process.env.DB_PORT || 3306,
};

const pool = mysql.createPool(dbConfig);

// DB 연결 확인 (데이터베이스 이름 없이 먼저 접속 테스트)
const testConfig = { ...dbConfig };
delete testConfig.database; 
const testPool = mysql.createPool(testConfig);

console.log(`DB 로그인 시도: ${dbConfig.user}@${dbConfig.host}:${dbConfig.port}`);
try {
  const connection = await testPool.getConnection();
  console.log("✅ 1단계: MySQL 서버 로그인 성공!");
  connection.release();
  await testPool.end();

  // 2단계: 데이터베이스 접근 테스트
  try {
    const dbConnection = await pool.getConnection();
    console.log(`✅ 2단계: '${dbConfig.database}' 데이터베이스 연결 성공!`);
    dbConnection.release();
  } catch (dbErr) {
    if (dbErr.code === 'ER_BAD_DB_ERROR') {
      console.log(`❌ 2단계 실패: '${dbConfig.database}' 데이터베이스가 존재하지 않습니다.`);
      console.log("해결법: MySQL Workbench에서 'CREATE DATABASE hlml;'을 실행해 주세요.");
    } else {
      console.log("❌ 2단계 실패:", dbErr.message);
    }
  }
} catch (err) {
  console.log("❌ 1단계 실패: 로그인 거부!");
  console.log("에러 메시지:", err.message);
  console.log("해결법: 비밀번호가 '1234qwer'이 맞는지 다시 확인해 주세요.");
  if (dbConfig.password === '1234qwer') {
    console.log("힌트: 혹시 비밀번호가 '1234' 이거나 다른 것일 수도 있습니다.");
  }
}

// 방 생성 API (500 에러 해결을 위해 더 견고하게 수정)
app.post("/api/rooms", async (req, res) => {
  const { title } = req.body;
  if (!title) {
    return res.status(400).json({ error: "방 제목이 필요합니다." });
  }
  
  console.log("방 생성 요청:", title);
  
  try {
    const [result] = await pool.query("INSERT INTO rooms (title) VALUES (?)", [title]);
    console.log("방 생성 성공:", result.insertId);
    res.json({ id: result.insertId, title });
  } catch (e) {
    console.error("DB 방 생성 실패 상세 원인:", e);
    // 실제 실패 원인을 클라이언트에게도 전달 (개발 단계)
    res.status(500).json({ 
      error: "DB 방 생성 실패", 
      message: e.message,
      code: e.code 
    });
  }
});

// 나머지 API...
app.get("/api/rooms", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM rooms");
    res.json(rows);
  } catch (e) { res.json([]); }
});

app.post("/api/chatting/send", async (req, res) => {
  const { room_id, user_id, message, nickname } = req.body;
  const msgObj = { room_id, user_id, message, nickname: nickname || "익명", created_at: new Date() };
  io.to(String(room_id)).emit("receive_message", msgObj);
  try {
    await pool.query("INSERT INTO main_chatting (room_id, user_id, message) VALUES (?, ?, ?)", [room_id, user_id, message]);
  } catch (e) { console.warn("메시지 DB 저장 실패"); }
  res.json({ success: true });
});

app.get("/api/chatting/:roomId", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT mc.*, u.nickname FROM main_chatting mc LEFT JOIN users u ON mc.user_id = u.id WHERE mc.room_id = ? ORDER BY mc.created_at ASC", [req.params.roomId]);
    res.json(rows);
  } catch (e) { res.json([]); }
});

io.on("connection", (socket) => {
  socket.on("join_room", (roomId) => socket.join(String(roomId)));
});

httpServer.listen(4000, () => {
  console.log("-----------------------------------------");
  console.log("서버가 4000번 포트에서 정상 실행 중입니다.");
  console.log("DB 접속 정보:", dbConfig.host, dbConfig.database);
  console.log("-----------------------------------------");
});
