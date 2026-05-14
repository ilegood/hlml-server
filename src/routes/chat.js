import express from "express";
import multer from "multer";
import { query } from "../db.js";
import auth from "../middleware/auth.js";
import { cloudinary } from "../middleware/cloudinary.js";

const router = express.Router();

const countHangul = (value) =>
  (String(value).match(/[\uAC00-\uD7A3]/g) || []).length;

const normalizeOriginalName = (name) => {
  const value = String(name || "file");
  const decoded = Buffer.from(value, "latin1").toString("utf8");
  return countHangul(decoded) > countHangul(value) ? decoded : value;
};

const chatUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

const uploadChatFileToCloudinary = (file) => {
  const originalName = normalizeOriginalName(file.originalname);

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "hlml_uploads/chat",
        resource_type: "auto",
        use_filename: true,
        unique_filename: true,
        filename_override: originalName,
      },
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }

        resolve({ ...result, originalName });
      },
    );

    stream.end(file.buffer);
  });
};

const getCloudinaryDownloadUrl = ({ publicId, resourceType, filename }) =>
  cloudinary.url(publicId, {
    secure: true,
    resource_type: resourceType || "auto",
    flags: `attachment:${filename || "download"}`,
  });

const hasBlockedRelation = async (userA, userB) => {
  const [[relation]] = await query(
    `SELECT id FROM user_relations
     WHERE status = 'blocked'
       AND ((requester_id = ? AND target_id = ?) OR (requester_id = ? AND target_id = ?))
     LIMIT 1`,
    [userA, userB, userB, userA],
  );
  return Boolean(relation);
};

router.post("/upload", auth, chatUpload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "file is required" });
  }

  try {
    const result = await uploadChatFileToCloudinary(req.file);
    const resourceType =
      result.resource_type ||
      (req.file.mimetype.startsWith("video/") ? "video" : "image");

    res.json({
      url: result.secure_url,
      downloadUrl: getCloudinaryDownloadUrl({
        publicId: result.public_id,
        resourceType,
        filename: result.originalName,
      }),
      publicId: result.public_id,
      resourceType,
      name: result.originalName,
      mimeType: req.file.mimetype,
      size: req.file.size,
    });
  } catch (err) {
    console.error("Cloudinary chat upload failed:", err);
    res.status(500).json({ message: "file upload failed" });
  }
});

router.get("/rooms/:roomId/block-warning", auth, async (req, res) => {
  const myId = req.userId;
  const { roomId } = req.params;

  try {
    const [blockedUsers] = await query(
      `SELECT u.user_id AS id, u.nickname
       FROM user_relations r
       JOIN users u ON u.user_id = r.target_id
       WHERE r.requester_id = ? AND r.status = 'blocked'`,
      [myId],
    );

    if (blockedUsers.length === 0) {
      return res.json({ shouldWarn: false, blockedUsers: [] });
    }

    const [postCreatorRows] = await query(
      "SELECT user_id AS id FROM posts WHERE post_id = ?",
      [roomId],
    );

    const [postParticipantsRows] = await query(
      "SELECT user_id AS id FROM post_participants WHERE post_id = ?",
      [roomId],
    );

    const memberIdsInRoom = new Set(
      [...postCreatorRows, ...postParticipantsRows].map((member) =>
        Number(member.id),
      ),
    );
    const presentBlockedUsers = blockedUsers.filter((user) =>
      memberIdsInRoom.has(Number(user.id)),
    );

    res.json({
      shouldWarn: presentBlockedUsers.length > 0,
      blockedUsers: presentBlockedUsers,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: `blocked user warning lookup failed: ${err.message}`,
    });
  }
});

router.get("/dm", auth, async (req, res) => {
  const myId = req.userId;
  try {
    const [rows] = await query(
      `SELECT
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
      ORDER BY lastMessageTime DESC`,
      [myId, myId, myId, myId, myId, myId],
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "DM 목록 조회 실패" });
  }
});

router.post("/dm", auth, async (req, res) => {
  const myId = req.userId;
  const { targetId } = req.body;

  if (!targetId) {
    return res.status(400).json({ message: "대상 ID가 필요합니다." });
  }

  const u1 = Math.min(myId, targetId);
  const u2 = Math.max(myId, targetId);

  try {
    if (await hasBlockedRelation(myId, targetId)) {
      return res.status(403).json({ message: "blocked user" });
    }

    const [[existing]] = await query(
      "SELECT id FROM dm_rooms WHERE user1_id = ? AND user2_id = ?",
      [u1, u2],
    );

    if (existing) {
      return res.json({ roomId: existing.id });
    }

    const [result] = await query(
      "INSERT INTO dm_rooms (user1_id, user2_id) VALUES (?, ?)",
      [u1, u2],
    );
    res.json({ roomId: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "DM 방 생성 실패" });
  }
});

router.get("/dm/:roomId", auth, async (req, res) => {
  const myId = req.userId;
  const { roomId } = req.params;

  try {
    const [[room]] = await query(
      `SELECT
        dr.id,
        u.user_id as targetId,
        u.nickname as targetNickname,
        u.profile_img as targetProfileImg
      FROM dm_rooms dr
      JOIN users u ON (dr.user1_id = u.user_id AND dr.user2_id = ?) OR (dr.user2_id = u.user_id AND dr.user1_id = ?)
      WHERE dr.id = ? AND (dr.user1_id = ? OR dr.user2_id = ?)`,
      [myId, myId, roomId, myId, myId],
    );

    if (!room) {
      return res.status(404).json({ message: "방을 찾을 수 없습니다." });
    }

    res.json(room);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "DM 정보 조회 실패" });
  }
});

export default router;
