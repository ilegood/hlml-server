import express from "express";
import mysql from "mysql2/promise";
import cors from "cors";
import fs from "fs";
import path from "path";

const app = express();

if (!fs.existsSync("./uploads")) {
  fs.mkdirSync("./uploads");
}

const pool = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "qwer1234",
  database: "hlml",
  waitForConnections: true,
  connectionLimit: 10,
});

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use("/uploads", express.static("uploads"));

// 모든 요청에 대해 x-user-id 헤더 로깅
app.use((req, res, next) => {
  const userId = req.headers['x-user-id'];
  if (userId) {
    console.log(`[Request] ${req.method} ${req.url} | x-user-id: ${userId}`);
  }
  next();
});

// --- Helper Functions ---
const parseJson = (data, fallback) => {
  if (!data) return fallback;
  if (typeof data === "string") {
    try { return JSON.parse(data); } catch { return fallback; }
  }
  return data;
};

// --- Post APIs ---
const parsePost = (p) => ({
  ...p,
  categories: parseJson(p.categories, {}),
  comments: parseJson(p.comments, []),
  likedBy: parseJson(p.likedBy, []),
  joinedBy: parseJson(p.joinedBy, []),
});

app.get("/api/posts", async (req, res) => {
  const myId = parseInt(req.headers['x-user-id']);
  try {
    let query = "SELECT * FROM posts ORDER BY created_at DESC";
    let params = [];

    // 로그인한 유저라면 차단한 유저의 게시글 제외
    if (!isNaN(myId)) {
      query = `
        SELECT p.* FROM posts p
        WHERE p.user_id NOT IN (
          SELECT target_id FROM user_relations 
          WHERE requester_id = ? AND status = 'blocked'
        )
        ORDER BY p.created_at DESC
      `;
      params = [myId];
    }

    const [rows] = await pool.query(query, params);
    res.json(rows.map(parsePost));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/posts/:id", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM posts WHERE post_id = ?", [req.params.id]);
    rows.length ? res.json(parsePost(rows[0])) : res.status(404).json({ error: "Not found" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- User Auth APIs ---
app.post("/users/register", async (req, res) => {
  const { nickname, email, password, birthday, gender, phone_number } = req.body;
  try {
    await pool.query(
      "INSERT INTO users (nickname, email, password, birthday, gender, phone_number) VALUES (?, ?, ?, ?, ?, ?)",
      [nickname, email, password, birthday, gender, phone_number]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ message: "가입 실패" }); }
});
app.post("/users/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const [rows] = await pool.query("SELECT * FROM users WHERE email = ? AND password = ?", [email, password]);
    if (rows.length > 0) {
      const u = rows[0];
      // user.id를 명확히 u.user_id로 매핑하여 반환
      res.json({ 
        success: true, 
        token: "fake-jwt", 
        user: { 
          id: u.user_id, 
          nickname: u.nickname, 
          email: u.email, 
          bio: u.bio, 
          profile_img: u.profile_img 
        } 
      });
    } else { res.status(401).json({ message: "로그인 실패" }); }
  } catch (err) { res.status(500).json({ message: "서버 오류" }); }
});

// 프로필 수정 API
app.put("/users/profile", async (req, res) => {
  const { nickname, bio, email, profile_img, currentPassword, newPassword } = req.body;
  const myId = parseInt(req.headers['x-user-id']);

  if (isNaN(myId)) return res.status(401).json({ message: "로그인이 필요합니다." });

  try {
    // 1. 기본 정보 업데이트 준비
    let updateFields = ["nickname = ?", "bio = ?"];
    let queryParams = [nickname, bio];

    // 2. 이미지 처리 (Base64 -> 파일 저장)
    if (profile_img && profile_img.startsWith("data:image")) {
      const format = profile_img.split(";")[0].split("/")[1];
      const base64Data = profile_img.split(",")[1];
      const fileName = `profile_${Date.now()}.${format}`;
      const filePath = path.join("./uploads", fileName);

      fs.writeFileSync(filePath, base64Data, "base64");
      const dbPath = `/uploads/${fileName}`;

      updateFields.push("profile_img = ?");
      queryParams.push(dbPath);
    }

    // 3. 비밀번호 변경 처리
    if (currentPassword && newPassword) {
      const [userRows] = await pool.query("SELECT password FROM users WHERE user_id = ?", [myId]);
      if (userRows[0].password !== currentPassword) {
        return res.status(400).json({ message: "현재 비밀번호가 일치하지 않습니다." });
      }
      updateFields.push("password = ?");
      queryParams.push(newPassword);
    }

    // 4. DB 업데이트
    queryParams.push(myId);
    await pool.query(
      `UPDATE users SET ${updateFields.join(", ")} WHERE user_id = ?`,
      queryParams
    );

    // 5. 업데이트된 정보 반환
    const [updatedRows] = await pool.query("SELECT * FROM users WHERE user_id = ?", [myId]);
    const u = updatedRows[0];
    res.json({
      nickname: u.nickname,
      bio: u.bio,
      profile_img: u.profile_img,
      success: true
    });

  } catch (err) {
    console.error("[Profile Update Error]", err);
    res.status(500).json({ message: "수정 실패: " + err.message });
  }
});

// --- Friend & Relation APIs ---

// 유저 검색
app.get("/users/search", async (req, res) => {
  const { q } = req.query;
  const myId = parseInt(req.headers['x-user-id']);
  try {
    // 닉네임 검색 시: 본인 제외 + 탈퇴 유저 제외 + 내가 차단한 유저 제외
    const [rows] = await pool.query(`
      SELECT user_id as id, nickname, profile_img 
      FROM users 
      WHERE nickname LIKE ? 
      AND is_deleted = FALSE 
      AND user_id != ?
      AND user_id NOT IN (
        SELECT target_id FROM user_relations 
        WHERE requester_id = ? AND status = 'blocked'
      )
    `, [`%${q}%`, myId || 0, myId || 0]);
    res.json(rows);
  } catch (err) { res.status(500).json({ message: "검색 실패" }); }
});

// 친구 목록
app.get("/friends", async (req, res) => {
  const myId = parseInt(req.headers['x-user-id']);
  if (isNaN(myId)) return res.json([]);
  try {
    const [rows] = await pool.query(`
      SELECT u.user_id as id, u.nickname as name, u.profile_img, u.bio as statusMessage, 'online' as status
      FROM user_relations r
      JOIN users u ON (u.user_id = r.target_id AND r.requester_id = ?) OR (u.user_id = r.requester_id AND r.target_id = ?)
      WHERE r.status = 'accepted' AND u.is_deleted = FALSE
    `, [myId, myId]);
    res.json(rows);
  } catch (err) { res.status(500).json({ message: "조회 실패" }); }
});

// 받은 친구 요청 목록
app.get("/friends/requests", async (req, res) => {
  const myId = parseInt(req.headers['x-user-id']);
  if (isNaN(myId)) return res.json([]);
  try {
    const [rows] = await pool.query(`
      SELECT u.user_id as id, u.nickname as name, u.profile_img 
      FROM user_relations r
      JOIN users u ON u.user_id = r.requester_id 
      WHERE r.target_id = ? AND r.status = 'pending' AND u.is_deleted = FALSE
    `, [myId]);
    res.json(rows);
  } catch (err) { res.status(500).json({ message: "요청 조회 실패" }); }
});

// 친구 요청 보내기
app.post("/friends/add", async (req, res) => {
  const { targetNickname } = req.body;
  const myId = parseInt(req.headers['x-user-id']);
  if (isNaN(myId)) return res.status(401).json({ message: "로그인이 필요합니다." });

  try {
    const [users] = await pool.query("SELECT user_id FROM users WHERE nickname = ? AND is_deleted = FALSE", [targetNickname]);
    if (users.length === 0) return res.status(404).json({ message: "유저를 찾을 수 없습니다." });
    
    const targetId = users[0].user_id;
    if (myId == targetId) return res.status(400).json({ message: "본인에게는 요청할 수 없습니다." });

    const [existing] = await pool.query(
      "SELECT * FROM user_relations WHERE (requester_id = ? AND target_id = ?) OR (requester_id = ? AND target_id = ?)",
      [myId, targetId, targetId, myId]
    );

    if (existing.length > 0) {
      const relation = existing[0];
      if (relation.status === 'accepted') return res.status(400).json({ message: "이미 친구입니다." });
      if (relation.status === 'blocked') return res.status(400).json({ message: "차단된 사용자입니다." });
      if (relation.status === 'pending' && relation.requester_id == targetId) {
        await pool.query("UPDATE user_relations SET status = 'accepted' WHERE id = ?", [relation.id]);
        return res.json({ success: true, message: "상대방의 요청을 수락하여 친구가 되었습니다." });
      }
      if (relation.status === 'pending' && relation.requester_id == myId) {
        return res.status(400).json({ message: "이미 친구 요청을 보냈습니다." });
      }
    }

    await pool.query("INSERT INTO user_relations (requester_id, target_id, status) VALUES (?, ?, 'pending')", [myId, targetId]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ message: "요청 실패: " + err.message }); }
});

// 친구 요청 수락
app.post("/friends/accept", async (req, res) => {
  const { targetId } = req.body;
  const myId = parseInt(req.headers['x-user-id']);
  if (isNaN(myId)) return res.status(401).json({ message: "로그인이 필요합니다." });

  try {
    const [result] = await pool.query(
      "UPDATE user_relations SET status = 'accepted' WHERE requester_id = ? AND target_id = ? AND status = 'pending'", 
      [targetId, myId]
    );
    if (result.affectedRows === 0) return res.status(400).json({ message: "수락할 수 있는 요청이 없습니다." });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ message: "수락 실패" }); }
});

// 친구 요청 거절/삭제
app.post("/friends/reject", async (req, res) => {
  const { targetId } = req.body;
  const myId = parseInt(req.headers['x-user-id']);
  if (isNaN(myId)) return res.status(401).json({ message: "로그인이 필요합니다." });

  try {
    await pool.query(
      "DELETE FROM user_relations WHERE (requester_id = ? AND target_id = ?) OR (requester_id = ? AND target_id = ?)", 
      [targetId, myId, myId, targetId]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ message: "삭제 실패" }); }
});

// 차단하기
app.post("/friends/block", async (req, res) => {
  const { targetId } = req.body;
  const myId = parseInt(req.headers['x-user-id']);
  if (isNaN(myId)) return res.status(401).json({ message: "로그인이 필요합니다." });

  try {
    const [existing] = await pool.query(
      "SELECT * FROM user_relations WHERE (requester_id = ? AND target_id = ?) OR (requester_id = ? AND target_id = ?)",
      [myId, targetId, targetId, myId]
    );

    if (existing.length > 0) {
      await pool.query(
        "UPDATE user_relations SET requester_id = ?, target_id = ?, status = 'blocked' WHERE id = ?",
        [myId, targetId, existing[0].id]
      );
    } else {
      await pool.query(
        "INSERT INTO user_relations (requester_id, target_id, status) VALUES (?, ?, 'blocked')",
        [myId, targetId]
      );
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ message: "차단 실패" }); }
});

// 차단 해제하기 (관계 삭제)
app.post("/friends/unblock", async (req, res) => {
  const { targetId } = req.body;
  const myId = parseInt(req.headers['x-user-id']);
  
  if (isNaN(myId)) return res.status(401).json({ message: "로그인이 필요합니다." });

  try {
    const [result] = await pool.query(
      "DELETE FROM user_relations WHERE requester_id = ? AND target_id = ? AND status = 'blocked'",
      [myId, targetId]
    );

    if (result.affectedRows === 0) {
      return res.status(400).json({ message: "차단 내역을 찾을 수 없습니다." });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: "차단 해제 실패" });
  }
});

// 차단 목록 조회
app.get("/friends/blocked", async (req, res) => {
  const myId = parseInt(req.headers['x-user-id']);
  if (isNaN(myId)) return res.status(401).json({ message: "로그인이 필요합니다." });
  try {
    const [rows] = await pool.query(`
      SELECT u.user_id as id, u.nickname, u.profile_img 
      FROM users u 
      JOIN user_relations r ON u.user_id = r.target_id 
      WHERE r.requester_id = ? AND r.status = 'blocked'
    `, [myId]);
    res.json(rows);
  } catch (err) { res.status(500).json({ message: "차단 목록 조회 실패" }); }
});

app.listen(4000, () => console.log("🚀 Server v1.2 on http://localhost:4000"));
