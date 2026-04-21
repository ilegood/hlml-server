import express from "express";
import pool from "../db.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import authMiddleware from "../middleware/auth.js";
import multer from "multer";
import path from "path";
import fs from "fs";
import sharp from "sharp";

const router = express.Router();

const uploadDir = "uploads";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

router.post("/register", async (req, res) => {
  try {
    const { nickname, email, password, phone_number, birthday, gender } =
      req.body;

    const [emailCheck] = await pool.query(
      "SELECT * FROM users WHERE email = ?",
      [email],
    );
    if (emailCheck.length > 0) {
      return res.status(409).json({ message: "이미 사용중인 이메일" });
    }

    const [nicknameCheck] = await pool.query(
      "SELECT * FROM users WHERE nickname = ?",
      [nickname],
    );
    if (nicknameCheck.length > 0) {
      return res.status(409).json({ message: "이미 사용중인 닉네임" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await pool.query(
      "INSERT INTO users(nickname, email, password, phone_number, birthday, gender) VALUES(?, ?, ?, ?, ?, ?)",
      [nickname, email, hashedPassword, phone_number, birthday, gender],
    );

    res.status(201).json({ message: "회원가입 완료" });
  } catch (error) {
    console.error("Register Error:", error);
    res.status(500).json({ message: "서버 에러가 발생했습니다." });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const [checked] = await pool.query("SELECT * FROM users WHERE email = ?", [
      email,
    ]);

    if (checked.length === 0) {
      return res
        .status(401)
        .json({ message: "이메일 또는 비밀번호가 잘못되었습니다" });
    }

    const user = checked[0];

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res
        .status(401)
        .json({ message: "이메일 또는 비밀번호가 잘못되었습니다" });
    }

    const token = jwt.sign({ userId: user.user_id }, process.env.SECRET_KEY, {
      expiresIn: "7d",
    });

    res.status(200).json({ 
      message: "로그인 성공!", 
      token, 
      nickname: user.nickname,
      email: user.email,
      bio: user.bio || "",
      profile_img: user.profile_img || ""
    });
  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({ message: "서버 에러" });
  }
});

router.patch("/profile", authMiddleware, upload.single("profile_img"), async (req, res) => {
  try {
    const { nickname, bio, currentPassword, newPassword } = req.body;
    const userId = req.userId;
    let profile_img = null;

    if (req.file) {
      const isGif = req.file.mimetype === 'image/gif';
      const ext = isGif ? '.gif' : '.jpg';
      const filename = `profile-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
      const outputPath = path.join(uploadDir, filename);

      if (isGif) {
        // GIF는 애니메이션 유지를 위해 형식을 보존하고 처리 (animated: true 설정)
        await sharp(req.file.buffer, { animated: true })
          .toFile(outputPath);
      } else {
        // 일반 이미지는 기존처럼 흰색 배경 채우고 JPG로 변환
        await sharp(req.file.buffer)
          .flatten({ background: '#ffffff' })
          .toFormat('jpeg')
          .toFile(outputPath);
      }

      profile_img = `/uploads/${filename}`;
    }

    const [userRows] = await pool.query("SELECT * FROM users WHERE user_id = ?", [userId]);
    const user = userRows[0];

    if (!user) {
      return res.status(404).json({ message: "사용자를 찾을 수 없습니다" });
    }

    if (currentPassword && newPassword) {
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) {
        return res.status(400).json({ message: "현재 비밀번호가 일치하지 않습니다" });
      }
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await pool.query("UPDATE users SET password = ? WHERE user_id = ?", [hashedPassword, userId]);
    }

    const finalNickname = nickname !== undefined ? nickname : user.nickname;
    const finalBio = bio !== undefined ? bio : user.bio;
    const finalImg = profile_img !== null ? profile_img : user.profile_img;

    await pool.query(
      "UPDATE users SET nickname = ?, bio = ?, profile_img = ? WHERE user_id = ?",
      [finalNickname, finalBio, finalImg, userId]
    );

    res.status(200).json({ 
      message: "프로필 수정 완료", 
      nickname: finalNickname, 
      bio: finalBio,
      profile_img: finalImg
    });
  } catch (error) {
    console.error("Profile Update Error:", error);
    res.status(500).json({ message: "서버 에러가 발생했습니다." });
  }
});

export default router;
