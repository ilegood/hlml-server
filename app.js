import express from "express";
import mysql from "mysql2/promise";
import cors from "cors";
import fs from "fs";
import path from "path";

const app = express();

// 업로드 폴더 생성
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

const parseJson = (data, fallback) => {
  if (!data) return fallback;
  if (typeof data === "string") {
    try {
      return JSON.parse(data);
    } catch {
      return fallback;
    }
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
    const [rows] = await pool.query(
      "SELECT * FROM posts ORDER BY created_at DESC",
    );
    res.json(rows.map(parsePost));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/posts/:id", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM posts WHERE post_id = ?", [
      req.params.id,
    ]);
    rows.length
      ? res.json(parsePost(rows[0]))
      : res.status(404).json({ error: "Not found" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/posts", async (req, res) => {
  const b = req.body;
  const capacity = b.capacity || 4;
  const author = b.author || "익명";

  try {
    const [result] = await pool.query(
      "INSERT INTO posts (title, content, date, time, place, capacity, categories, image, author, participants) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        b.title,
        b.content,
        formatDate(b.date),
        formatTime(b.time),
        b.place || "",
        capacity,
        JSON.stringify(b.categories || {}),
        b.image || null,
        author,
        1, // 작성자 본인 포함
      ],
    );
    res.json({ success: true, id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/posts/:id", async (req, res) => {
  const b = req.body;
  const id = req.params.id;

  try {
    const [rows] = await pool.query("SELECT * FROM posts WHERE post_id = ?", [id]);
    if (rows.length === 0)
      return res.status(404).json({ error: "Post not found" });
    const old = rows[0];

    const val = (key, fallback) => (b[key] !== undefined ? b[key] : fallback);

    const title = val("title", old.title);
    const content = val("content", old.content);
    const date = formatDate(val("date", old.date));
    const time = formatTime(val("time", old.time));
    const place = val("place", old.place);
    const capacity = val("capacity", old.capacity);
    const status = val("status", old.status);
    const categories = JSON.stringify(val("categories", parseJson(old.categories, {})));
    const image = val("image", old.image);
    const participants = val("participants", old.participants);
    const edited = b.edited !== undefined ? (b.edited ? 1 : 0) : old.edited;

    const [result] = await pool.query(
      `UPDATE posts SET 
        title=?, content=?, date=?, time=?, place=?, 
        capacity=?, status=?, categories=?, image=?, participants=?, edited=? 
      WHERE post_id=?`,
      [
        title, content, date, time, place,
        capacity, status, categories, image, participants, edited, id
      ],
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/posts/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM posts WHERE post_id = ?", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 회원가입 API 추가
app.post("/users/register", async (req, res) => {
  const { nickname, email, password, birthday, gender, phone_number } = req.body;

  try {
    const [result] = await pool.query(
      "INSERT INTO users (nickname, email, password, birthday, gender, phone_number) VALUES (?, ?, ?, ?, ?, ?)",
      [nickname, email, password, birthday, gender, phone_number]
    );
    res.json({ success: true, message: "회원가입 성공" });
  } catch (err) {
    console.error("Register Error:", err);
    if (err.code === 'ER_DUP_ENTRY') {
      res.status(400).json({ message: "이미 사용 중인 닉네임 또는 이메일입니다." });
    } else {
      res.status(500).json({ message: "회원가입 처리 중 오류가 발생했습니다." });
    }
  }
});

// 로그인 API 추가 (간단한 구현)
app.post("/users/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const [rows] = await pool.query(
      "SELECT * FROM users WHERE email = ? AND password = ?",
      [email, password]
    );

    if (rows.length > 0) {
      const user = rows[0];
      res.json({ 
        success: true, 
        token: "fake-jwt-token", // 실제 구현 시 JWT 발급 권장
        user: { 
          nickname: user.nickname, 
          email: user.email,
          bio: user.bio,
          profile_img: user.profile_img
        } 
      });
    } else {
      res.status(401).json({ message: "이메일 또는 비밀번호가 일치하지 않습니다." });
    }
  } catch (err) {
    res.status(500).json({ message: "로그인 처리 중 오류가 발생했습니다." });
  }
});

// 프로필 수정 API 추가 (파일 저장 방식)
app.put("/users/profile", async (req, res) => {
  const { nickname, bio, email, profile_img } = req.body;
  let finalImgPath = profile_img;

  try {
    // 만약 이미지가 Base64 데이터라면 파일로 저장
    if (profile_img && profile_img.startsWith("data:image")) {
      const base64Data = profile_img.replace(/^data:image\/\w+;base64,/, "");
      const ext = profile_img.split(";")[0].split("/")[1];
      const fileName = `profile_${Date.now()}.${ext}`;
      const filePath = path.join("uploads", fileName);
      
      fs.writeFileSync(filePath, base64Data, 'base64');
      finalImgPath = `/uploads/${fileName}`; // DB에는 짧은 경로 저장
    }

    await pool.query(
      "UPDATE users SET nickname = ?, bio = ?, profile_img = ? WHERE email = ?",
      [nickname, bio, finalImgPath, email]
    );
    res.json({ success: true, nickname, bio, profile_img: finalImgPath });
  } catch (err) {
    console.error("Profile Update Error:", err);
    res.status(500).json({ message: "프로필 수정 중 오류가 발생했습니다." });
  }
});

app.listen(4000, () => console.log("🚀 Server on http://localhost:4000"));
