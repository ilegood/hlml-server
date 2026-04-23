import express from "express";
import mysql from "mysql2/promise";
import cors from "cors";

const app = express();
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

const parseJson = (data, fallback) => {
  if (!data) return fallback;
  if (typeof data === 'string') {
    try { return JSON.parse(data); } catch { return fallback; }
  }
  return data;
};

// 날짜 형식을 YYYY-MM-DD로 정규화
const formatDate = (d) => {
  if (!d) return null;
  const s = String(d);
  return s.includes("T") ? s.split("T")[0] : s;
};

// 시간 형식을 HH:mm:ss 또는 HH:mm으로 정규화
const formatTime = (t) => {
  if (!t) return null;
  const s = String(t);
  return s.includes("T") ? s.split("T")[1].split(".")[0] : s;
};

const parsePost = (p) => ({
  ...p,
  categories: parseJson(p.categories, {}),
  comments: parseJson(p.comments, []),
  likedBy: parseJson(p.likedBy, []),
  joinedBy: parseJson(p.joinedBy, []),
});

app.get("/api/posts", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM posts ORDER BY createdAt DESC");
    res.json(rows.map(parsePost));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/posts/:id", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM posts WHERE id = ?", [req.params.id]);
    rows.length ? res.json(parsePost(rows[0])) : res.status(404).json({ error: "Not found" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/posts", async (req, res) => {
  const b = req.body;
  
  // 모집 인원 검증 (2~10명)
  const capacity = b.capacity || 4;
  if (capacity < 2 || capacity > 10) {
    return res.status(400).json({ error: "모집 인원은 2명에서 10명 사이여야 합니다." });
  }

  const author = b.author || "익명";
  // 작성자를 참여자 명단에 기본 포함
  const joinedBy = JSON.stringify([author]);
  const participants = 1;

  try {
    const [result] = await pool.query(
      "INSERT INTO posts (title, content, date, time, place, capacity, categories, image, author, comments, likedBy, joinedBy, participants) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', '[]', ?, ?)",
      [b.title, b.content, formatDate(b.date), formatTime(b.time), b.place || "", capacity, JSON.stringify(b.categories || {}), b.image || null, author, joinedBy, participants]
    );
    res.json({ success: true, id: result.insertId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put("/api/posts/:id", async (req, res) => {
  const b = req.body;
  const id = req.params.id;

  try {
    const [rows] = await pool.query("SELECT * FROM posts WHERE id = ?", [id]);
    if (rows.length === 0) return res.status(404).json({ error: "Post not found" });
    const old = rows[0];

    const val = (key, fallback) => (b[key] !== undefined ? b[key] : fallback);

    // 데이터 안전하게 병합
    let joinedByArray = val('joinedBy', parseJson(old.joinedBy, []));
    
    // 작성자가 참여자 명단에서 빠지지 않도록 강제 적용
    if (!joinedByArray.includes(old.author)) {
      joinedByArray = [old.author, ...joinedByArray];
    }
    
    const joinedBy = JSON.stringify(joinedByArray);
    const participants = joinedByArray.length;

    const likedBy = JSON.stringify(val('likedBy', parseJson(old.likedBy, [])));
    const comments = JSON.stringify(val('comments', parseJson(old.comments, [])));
    const likes = b.likedBy ? b.likedBy.length : val('likes', old.likes);
    const status = val('status', old.status);
    const title = val('title', old.title);
    const content = val('content', old.content);
    const date = formatDate(val('date', old.date));
    const time = formatTime(val('time', old.time));
    const place = val('place', old.place);
    const capacity = val('capacity', old.capacity);
    const categories = JSON.stringify(val('categories', parseJson(old.categories, {})));
    const image = val('image', old.image);
    const edited = b.edited !== undefined ? (b.edited ? 1 : 0) : old.edited;

    const [result] = await pool.query(
      `UPDATE posts SET 
        likedBy=?, joinedBy=?, comments=?, likes=?, participants=?, 
        status=?, title=?, content=?, date=?, time=?, 
        place=?, capacity=?, categories=?, image=?, edited=? 
      WHERE id=?`,
      [likedBy, joinedBy, comments, likes, participants, status, title, content, date, time, place, capacity, categories, image, edited, id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("PUT SQL Error:", err.message);
    // 에러 메시지를 클라이언트에 상세히 전달
    res.status(500).json({ error: `DB Error: ${err.message}`, sqlState: err.sqlState });
  }
});

app.delete("/api/posts/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM posts WHERE id = ?", [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.listen(4000, () => console.log("🚀 Server on http://localhost:4000"));
