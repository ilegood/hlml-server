import express from "express";
import pool from "../db.js";
import bcrypt from "bcrypt";

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

export default router;
