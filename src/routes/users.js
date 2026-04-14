import express from "express";
import pool from "../db.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const router = express.Router();

router.post("/register", async (req, res) => {
  try {
    const { nickname, email, password, phone_number, birthday, gender } =
      req.body;

    // 이메일 중복 체크
    const [emailCheck] = await pool.query(
      "SELECT * FROM users WHERE email = ?",
      [email],
    );
    if (emailCheck.length > 0) {
      return res.status(409).json({ message: "이미 사용중인 이메일" });
    }

    // 닉네임 중복 체크
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
    res.status(500).json({ message: "Server Error" });
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

    const token = jwt.sign({ userId: user.id }, process.env.SECRET_KEY, {
      expiresIn: "7d",
    });

    res.status(200).json({ message: "로그인 성공!", token, nickname: user.nickname });
  } catch (error) {
    res.status(500).json({ message: "서버 에러" });
  }
});

// JWT 인증 미들웨어 (간단하게 구현)
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "인증 필요" });

  try {
    const decoded = jwt.verify(token, process.env.SECRET_KEY);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    res.status(401).json({ message: "유효하지 않은 토큰" });
  }
};

router.patch("/profile", authenticate, async (req, res) => {
  try {
    const { nickname, bio, currentPassword, newPassword } = req.body;
    const userId = req.userId;

    // 현재 사용자 정보 확인
    const [userRows] = await pool.query("SELECT * FROM users WHERE id = ?", [userId]);
    const user = userRows[0];

    // 비밀번호 변경 요청이 있는 경우
    if (currentPassword && newPassword) {
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) {
        return res.status(400).json({ message: "현재 비밀번호가 일치하지 않습니다" });
      }
      const hashedNewPassword = await bcrypt.hash(newPassword, 10);
      await pool.query("UPDATE users SET password = ? WHERE id = ?", [hashedNewPassword, userId]);
    }

    // 닉네임 및 자기소개 업데이트
    await pool.query(
      "UPDATE users SET nickname = ?, bio = ? WHERE id = ?",
      [nickname || user.nickname, bio || user.bio, userId]
    );

    res.status(200).json({ message: "프로필 수정 완료", nickname, bio });
  } catch (error) {
    res.status(500).json({ message: "서버 에러" });
  }
});

export default router;
