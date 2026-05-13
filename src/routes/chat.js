import express from "express";
import pool from "../db.js";
import auth from "../middleware/auth.js";

const router = express.Router();

// 1. 내 DM 목록 조회
router.get("/dm", auth, async (req, res) => {
  const myId = req.userId;
  try {
    const [rows] = await pool.query(
      `
      SELECT 
        dr.id as roomId,
        u.user_id as targetId,
        u.nickname as targetNickname,
        u.profile_img as targetProfileImg,
        (SELECT content FROM messages WHERE room_id = CONCAT('dm_', dr.id) ORDER BY id DESC LIMIT 1) as lastMessage,
        (SELECT created_at FROM messages WHERE room_id = CONCAT('dm_', dr.id) ORDER BY id DESC LIMIT 1) as lastMessageTime
      FROM dm_rooms dr
      JOIN users u ON (dr.user1_id = ? AND dr.user2_id = u.user_id) OR (dr.user2_id = ? AND dr.user1_id = u.user_id)
      WHERE dr.user1_id = ? OR dr.user2_id = ?
      ORDER BY lastMessageTime DESC
    `,
      [myId, myId, myId, myId],
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "DM 목록 조회 실패" });
  }
});

// 2. 특정 유저와의 DM 방 조회 또는 생성
router.post("/dm", auth, async (req, res) => {
  const myId = req.userId;
  const { targetId } = req.body;

  if (!targetId) return res.status(400).json({ message: "대상 ID가 필요합니다." });

  const u1 = Math.min(myId, targetId);
  const u2 = Math.max(myId, targetId);

  try {
    // 기존 방 확인
    const [[existing]] = await pool.query(
      "SELECT id FROM dm_rooms WHERE user1_id = ? AND user2_id = ?",
      [u1, u2],
    );

    if (existing) {
      return res.json({ roomId: existing.id });
    }

    // 새 방 생성
    const [result] = await pool.query(
      "INSERT INTO dm_rooms (user1_id, user2_id) VALUES (?, ?)",
      [u1, u2],
    );
    res.json({ roomId: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "DM 방 생성 실패" });
  }
});

// 3. DM 방 상세 정보 조회
router.get("/dm/:roomId", auth, async (req, res) => {
  const myId = req.userId;
  const { roomId } = req.params;

  try {
    const [[room]] = await pool.query(
      `
      SELECT 
        dr.id,
        u.user_id as targetId,
        u.nickname as targetNickname,
        u.profile_img as targetProfileImg
      FROM dm_rooms dr
      JOIN users u ON (dr.user1_id = u.user_id AND dr.user2_id = ?) OR (dr.user2_id = u.user_id AND dr.user1_id = ?)
      WHERE dr.id = ? AND (dr.user1_id = ? OR dr.user2_id = ?)
    `,
      [myId, myId, roomId, myId, myId],
    );

    if (!room) return res.status(404).json({ message: "방을 찾을 수 없습니다." });

    res.json(room);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "DM 정보 조회 실패" });
  }
});

export default router;
