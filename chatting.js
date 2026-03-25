const express = require("express");
const mysql = require("mysql2/promise");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

const pool = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "비밀번호", // ← 본인 MySQL 비밀번호
  database: "DB이름", // ← 본인 DB 이름
  port: 3306,
});

// 기본 경로('/') 접속 시 chat_ai.html 화면을 띄워줍니다.
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "chat_ai.html"));
});

app.get("/api/users", async (req, res) => {
  try {
    const [rows] = await pool.execute("SELECT * FROM users");
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 프론트엔드 채팅창에서 보내는 메시지를 수신하고 응답하는 API
app.post("/api/chat", (req, res) => {
  const userMessage = req.body.message;
  // 받은 메시지를 확인했다는 가상의 봇 응답을 클라이언트로 보냅니다.
  res.json({ reply: `"${userMessage}" 라고 하셨군요! (서버 연동 성공)` });
});

app.listen(3000, () => console.log("서버 실행: http://localhost:3000"));
