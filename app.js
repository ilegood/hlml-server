import express from "express";
import mysql from "mysql2/promise";
import cors from "cors";

const app = express();

const pool = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "password", // 본인 비밀번호로 수정 필수
  database: "hlml",
  waitForConnections: true,
  connectionLimit: 10
});

app.use(cors());
app.use(express.json({ limit: "50mb" }));

// 1. 게시글 목록 조회
app.get("/api/posts", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM posts ORDER BY createdAt DESC");
    const posts = rows.map(p => ({
      ...p,
      categories: JSON.parse(p.categories || '{}'),
      comments: JSON.parse(p.comments || '[]'),
      likedBy: JSON.parse(p.likedBy || '[]'),
      joinedBy: JSON.parse(p.joinedBy || '[]')
    }));
    res.json(posts);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 2. 게시글 상세 조회
app.get("/api/posts/:id", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM posts WHERE id = ?", [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: "Post not found" });
    const post = rows[0];
    res.json({
      ...post,
      categories: JSON.parse(post.categories || '{}'),
      comments: JSON.parse(post.comments || '[]'),
      likedBy: JSON.parse(post.likedBy || '[]'),
      joinedBy: JSON.parse(post.joinedBy || '[]')
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 3. 게시글 작성
app.post("/api/posts", async (req, res) => {
  const { title, content, date, time, place, capacity, categories, image, author } = req.body;
  try {
    const [result] = await pool.query(
      "INSERT INTO posts (title, content, date, time, place, capacity, categories, image, author, comments, likedBy, joinedBy) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', '[]', '[]')",
      [title, content, date, time, place, capacity, JSON.stringify(categories), image, author]
    );
    res.json({ success: true, id: result.insertId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 4. 게시글 업데이트 (좋아요, 참여, 댓글 등 통합 업데이트)
app.put("/api/posts/:id", async (req, res) => {
  const { likedBy, joinedBy, comments, likes, participants, status, title, content, date, time, place, capacity, categories, image } = req.body;
  try {
    const [result] = await pool.query(
      "UPDATE posts SET likedBy=?, joinedBy=?, comments=?, likes=?, participants=?, status=?, title=?, content=?, date=?, time=?, place=?, capacity=?, categories=?, image=?, edited=true WHERE id=?",
      [JSON.stringify(likedBy), JSON.stringify(joinedBy), JSON.stringify(comments), likes, participants, status, title, content, date, time, place, capacity, JSON.stringify(categories), image, req.params.id]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 5. 게시글 삭제
app.delete("/api/posts/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM posts WHERE id = ?", [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.listen(4000, () => {
  console.log("🚀 Server running on http://localhost:4000");
});
