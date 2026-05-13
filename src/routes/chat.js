import express from "express";
import fs from "fs";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import pool from "../db.js";
import auth from "../middleware/auth.js";

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.join(__dirname, "..", "uploads", "chat");

const chatStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const safeBase = path
      .basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .slice(0, 40);
    cb(null, `${Date.now()}-${safeBase || "upload"}${ext}`);
  },
});

const chatUpload = multer({
  storage: chatStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/") || file.mimetype.startsWith("video/")) {
      cb(null, true);
      return;
    }
    cb(new Error("Only image and video files are allowed"));
  },
});

const hasBlockedRelation = async (userA, userB) => {
  const [[relation]] = await pool.query(
    `SELECT id FROM user_relations
     WHERE status = 'blocked'
       AND ((requester_id = ? AND target_id = ?) OR (requester_id = ? AND target_id = ?))
     LIMIT 1`,
    [userA, userB, userB, userA],
  );
  return Boolean(relation);
};

router.post("/upload", auth, chatUpload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "file is required" });
  }

  res.json({
    url: `/uploads/chat/${req.file.filename}`,
    name: req.file.originalname,
    mimeType: req.file.mimetype,
    size: req.file.size,
  });
});

// 1. 내 DM 목록 조회
router.get("/rooms/:roomId/block-warning", auth, async (req, res) => {
  const myId = req.userId;
  const { roomId } = req.params;

  try {
    const [blockedUsers] = await pool.query(
      `SELECT u.user_id AS id, u.nickname
       FROM user_relations r
       JOIN users u ON u.user_id = r.target_id
       WHERE r.requester_id = ? AND r.status = 'blocked'`,
      [myId],
    );

    if (blockedUsers.length === 0) {
      return res.json({ shouldWarn: false, blockedUsers: [] });
    }

    const blockedIds = blockedUsers.map((user) => Number(user.id));
    
    // Fetch post creator
    const [postCreatorRows] = await pool.query(
      `SELECT user_id AS id FROM posts WHERE post_id = ?`,
      [roomId],
    );

    // Fetch post participants
    const [postParticipantsRows] = await pool.query(
      `SELECT user_id AS id FROM post_participants WHERE post_id = ?`,
      [roomId],
    );

    // Combine all members and filter by blockedIds in JavaScript
    const allMembersInRoom = [...postCreatorRows, ...postParticipantsRows];
    const memberIdsInRoom = new Set(allMembersInRoom.map((member) => Number(member.id)));
    
    const presentBlockedUsers = blockedUsers.filter((user) =>
      memberIdsInRoom.has(Number(user.id)),
    );

    res.json({
      shouldWarn: presentBlockedUsers.length > 0,
      blockedUsers: presentBlockedUsers,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: `blocked user warning lookup failed: ${err.message}` });
  }
});

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
      WHERE (dr.user1_id = ? OR dr.user2_id = ?)
        AND NOT EXISTS (
          SELECT 1 FROM user_relations r
          WHERE r.status = 'blocked'
            AND ((r.requester_id = ? AND r.target_id = u.user_id) OR (r.requester_id = u.user_id AND r.target_id = ?))
        )
      ORDER BY lastMessageTime DESC
    `,
      [myId, myId, myId, myId, myId, myId],
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
    if (await hasBlockedRelation(myId, targetId)) {
      return res.status(403).json({ message: "blocked user" });
    }

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
