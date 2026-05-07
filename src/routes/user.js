import express from "express";
import pool from "../db.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import auth from "../middleware/auth.js";
import multer from "multer";
import path from "path";

const router = express.Router();

// 이미지 업로드 설정
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "src/uploads/");
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});
const upload = multer({ storage: storage });

// 회원가입: /users/register
router.post("/register", async (req, res) => {
  const { nickname, email, password, birthday, gender, phone_number } = req.body;

  try {
    // 이메일 중복체크
    const [checked] = await pool.query("SELECT * FROM users WHERE email = ?", [email]);
    if (checked.length > 0) {
      return res.status(409).json({ message: "이미 사용중인 이메일입니다." });
    }

    // 비밀번호 암호화
    const hashedPassword = await bcrypt.hash(password, 10);

    const query = `
      INSERT INTO users (nickname, email, password, birthday, gender, phone_number)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    await pool.query(query, [nickname, email, hashedPassword, birthday, gender, phone_number]);
    res.status(201).json({ message: "회원가입 완료" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// 로그인: /users/login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const [rows] = await pool.query("SELECT * FROM users WHERE email = ?", [email]);
    
    if (rows.length === 0) {
      return res.status(401).json({ message: "이메일 또는 비밀번호가 일치하지 않습니다." });
    }

    const user = rows[0];

    // 비밀번호 확인
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "이메일 또는 비밀번호가 일치하지 않습니다." });
    }

    // JWT 토큰 생성
    const token = jwt.sign(
      { userId: user.user_id, email: user.email },
      process.env.SECRET_KEY,
      { expiresIn: "7d" }
    );

    res.json({
      token,
      user_id: user.user_id,
      nickname: user.nickname,
      email: user.email,
      bio: user.bio,
      profile_img: user.profile_img
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// 프로필 조회: /users/profile
router.get("/profile", auth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT user_id, nickname, email, bio, profile_img FROM users WHERE user_id = ?", 
      [req.userId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: "사용자를 찾을 수 없습니다." });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// 프로필 수정: /users/profile
router.patch("/profile", auth, upload.single("profile_img"), async (req, res) => {
  const { nickname, bio, currentPassword, newPassword } = req.body;
  const userId = req.userId;
  let profileImgPath = req.file ? `/uploads/${req.file.filename}` : null;

  try {
    // 1. 기존 정보 가져오기
    const [users] = await pool.query("SELECT * FROM users WHERE user_id = ?", [userId]);
    if (users.length === 0) {
      return res.status(404).json({ message: "사용자를 찾을 수 없습니다." });
    }
    const user = users[0];

    // 2. 닉네임 중복 체크 (본인 제외)
    if (nickname && nickname !== user.nickname) {
      const [dup] = await pool.query("SELECT * FROM users WHERE nickname = ? AND user_id != ?", [nickname, userId]);
      if (dup.length > 0) {
        return res.status(400).json({ message: "이미 사용 중인 닉네임입니다." });
      }
    }

    // 3. 비밀번호 변경 로직
    let hashedPassword = user.password;
    if (currentPassword && newPassword) {
      // bcrypt 암호화 방식과 평문 방식을 모두 고려 (과거 데이터 호환성)
      let isMatch = false;
      try {
        isMatch = await bcrypt.compare(currentPassword, user.password);
      } catch (e) {
        // 만약 DB에 평문으로 저장되어 있다면 직접 비교
        isMatch = (currentPassword === user.password);
      }

      if (!isMatch) {
        return res.status(400).json({ message: "현재 비밀번호가 일치하지 않습니다." });
      }
      hashedPassword = await bcrypt.hash(newPassword, 10);
    }

    // 4. DB 업데이트
    const finalNickname = nickname || user.nickname;
    const finalBio = bio !== undefined ? bio : user.bio;
    const finalProfileImg = profileImgPath || user.profile_img;

    await pool.query(
      "UPDATE users SET nickname = ?, bio = ?, password = ?, profile_img = ? WHERE user_id = ?",
      [finalNickname, finalBio, hashedPassword, finalProfileImg, userId]
    );

    res.json({
      message: "프로필이 수정되었습니다.",
      nickname: finalNickname,
      bio: finalBio,
      profile_img: finalProfileImg
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "서버 내부 오류가 발생했습니다." });
  }
});

// 유저 검색: /users/search?q=...
router.get("/search", auth, async (req, res) => {
  const query = req.query.q;
  if (!query) return res.json([]);

  try {
    const [rows] = await pool.query(
      "SELECT user_id, nickname, profile_img FROM users WHERE nickname LIKE ? AND user_id != ? LIMIT 10",
      [`%${query}%`, req.userId]
    );
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// 회원 탈퇴: /users (DELETE)
router.delete("/", auth, async (req, res) => {
  const connection = await pool.getConnection();
  await connection.beginTransaction();

  try {
    const userId = req.userId;

    // 1. 유저 정보(닉네임) 가져오기
    const [users] = await connection.query("SELECT nickname FROM users WHERE user_id = ?", [userId]);
    if (users.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: "사용자를 찾을 수 없습니다." });
    }
    const userNickname = users[0].nickname;

    // 2. 유저가 참여 중인 게시글 목록 가져오기 (본인 게시글 제외)
    const [joinedPosts] = await connection.query(
      "SELECT post_id FROM post_participants WHERE user_id = ?",
      [userId]
    );

    // 3. 본인이 작성한 게시글 삭제
    await connection.query("DELETE FROM posts WHERE author = ?", [userNickname]);

    // 4. 유저 삭제 (post_participants 등은 ON DELETE CASCADE로 자동 삭제됨)
    const [result] = await connection.query("DELETE FROM users WHERE user_id = ?", [userId]);
    
    // 5. 유저가 참여했던 게시글들의 인원수 및 상태 업데이트
    for (const post of joinedPosts) {
      const postId = post.post_id;
      
      // 해당 게시글이 아직 존재하는지 확인 (본인 작성 게시글이면 이미 삭제됨)
      const [postExists] = await connection.query("SELECT capacity FROM posts WHERE post_id = ?", [postId]);
      if (postExists.length > 0) {
        const capacity = postExists[0].capacity;
        
        // 현재 남은 참여자 수 계산 (작성자 1명 + 참여자 테이블 수)
        const [participantCount] = await connection.query(
          "SELECT COUNT(*) AS count FROM post_participants WHERE post_id = ?",
          [postId]
        );
        const currentParticipants = 1 + participantCount[0].count;
        
        // 상태 업데이트 (인원이 여유 있으면 '모집중'으로 변경)
        const nextStatus = currentParticipants >= capacity ? "모집완료" : "모집중";
        await connection.query(
          "UPDATE posts SET participants = ?, status = ? WHERE post_id = ?",
          [currentParticipants, nextStatus, postId]
        );
      }
    }

    await connection.commit();
    res.json({ message: "회원 탈퇴가 완료되었습니다." });
  } catch (error) {
    await connection.rollback();
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  } finally {
    connection.release();
  }
});

export default router;
