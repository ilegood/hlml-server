import express from "express";
import multer from "multer";
import pool, { query } from "../db.js";
import auth from "../middleware/auth.js";
import { cloudinary } from "../middleware/cloudinary.js";
import { toUtcIsoString } from "../utils/time.js";

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

const getCloudinaryResourceType = (file) => {
  const mimeType = file.mimetype || "";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  return "raw";
};

const uploadChatFileToCloudinary = (file) => {
  const originalName = normalizeOriginalName(file.originalname);
  const resourceType = getCloudinaryResourceType(file);

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "hlml_uploads/chat",
        resource_type: resourceType,
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

const getCloudinaryDownloadUrl = ({ publicId, resourceType, filename }) => {
  const safeFilename = String(filename || "download").replace(/[\/\\]/g, "_");

  return cloudinary.url(publicId, {
    secure: true,
    resource_type: resourceType || "auto",
    flags: `attachment:${safeFilename}`,
  });
};

const getDownloadProxyUrl = ({ url, filename }) =>
  `/chat/download?url=${encodeURIComponent(url)}&name=${encodeURIComponent(
    filename || "download",
  )}`;

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

  if (req.file.size === 0 || req.file.buffer.length === 0) {
    return res.status(400).json({ message: "빈 파일은 업로드할 수 없습니다." });
  }

  try {
    const result = await uploadChatFileToCloudinary(req.file);
    const resourceType = result.resource_type || getCloudinaryResourceType(req.file);

    res.json({
      url: result.secure_url,
      downloadUrl: getDownloadProxyUrl({
        url:
          resourceType === "raw"
            ? result.secure_url
            : getCloudinaryDownloadUrl({
                publicId: result.public_id,
                resourceType,
                filename: result.originalName,
              }),
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

router.get("/download", async (req, res) => {
  const { url, name } = req.query;

  try {
    const parsedUrl = new URL(String(url || ""));
    if (parsedUrl.hostname !== "res.cloudinary.com") {
      return res.status(400).json({ message: "invalid download url" });
    }

    const response = await fetch(parsedUrl);
    if (!response.ok || !response.body) {
      return res.status(502).json({ message: "download failed" });
    }

    const filename = String(name || "download").replace(/["\r\n]/g, "_");
    res.setHeader(
      "Content-Type",
      response.headers.get("content-type") || "application/octet-stream",
    );
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);

    const reader = response.body.getReader();
    const write = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
      res.end();
    };
    await write();
  } catch (error) {
    console.error("Chat file download failed:", error);
    res.status(400).json({ message: "download failed" });
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

const getRoomUnreadCounts = async (userId, roomIds) => {
  const uniqueRoomIds = [...new Set(roomIds.filter(Boolean).map(String))];
  if (uniqueRoomIds.length === 0) return new Map();

  const placeholders = uniqueRoomIds.map(() => "?").join(",");
  const [rows] = await query(
    `SELECT m.room_id AS roomId, COUNT(*) AS unreadCount
     FROM messages m
     LEFT JOIN message_reads mr
       ON mr.message_id = m.id AND mr.user_id = ?
     WHERE m.room_id IN (${placeholders})
       AND m.user_id <> ?
       AND m.is_system = 0
       AND m.is_deleted = 0
       AND mr.message_id IS NULL
     GROUP BY m.room_id`,
    [userId, ...uniqueRoomIds, userId],
  );

  return new Map(rows.map((row) => [String(row.roomId), Number(row.unreadCount)]));
};

const getMyGroupRooms = async (userId) => {
  const [rows] = await query(
    `SELECT DISTINCT
       p.post_id AS roomId,
       p.title,
       p.date,
       p.time
     FROM posts p
     LEFT JOIN post_participants pp ON pp.post_id = p.post_id
     WHERE p.user_id = ? OR pp.user_id = ?`,
    [userId, userId],
  );

  return rows.map((row) => ({
    ...row,
    roomKey: String(row.roomId),
  }));
};

const getMyDmRooms = async (userId) => {
  const [rows] = await query(
    `SELECT
       dr.id AS roomId,
       CONCAT('dm_', dr.id) AS roomKey,
       u.nickname AS title
     FROM dm_rooms dr
     JOIN users u
       ON (dr.user1_id = ? AND dr.user2_id = u.user_id)
       OR (dr.user2_id = ? AND dr.user1_id = u.user_id)
     WHERE dr.user1_id = ? OR dr.user2_id = ?`,
    [userId, userId, userId, userId],
  );

  return rows;
};

const getSeoulDateTimeString = (offsetMinutes = 0) => {
  const date = new Date(Date.now() + offsetMinutes * 60 * 1000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second}`;
};

const expirationDeadlineSql = `
  TIMESTAMP(
    DATE_ADD(p.date, INTERVAL 1 DAY),
    CASE
      WHEN p.time IS NOT NULL AND p.time >= '22:00:00' THEN '12:00:00'
      ELSE '00:00:00'
    END
  )
`;

const getAppointmentReminders = async (userId) => {
  const now = getSeoulDateTimeString();
  const inThirtyMinutes = getSeoulDateTimeString(30);
  const [rows] = await query(
    `SELECT DISTINCT
       p.post_id AS roomId,
       p.title,
       p.date,
       p.time,
       p.place
     FROM posts p
     LEFT JOIN post_participants pp ON pp.post_id = p.post_id
     WHERE (p.user_id = ? OR pp.user_id = ?)
       AND p.date IS NOT NULL
       AND p.time IS NOT NULL
       AND TIMESTAMP(p.date, p.time) BETWEEN ? AND ?
     ORDER BY p.date ASC, p.time ASC
     LIMIT 20`,
    [userId, userId, now, inThirtyMinutes],
  );

  return rows;
};

const getDeletionWarnings = async (userId) => {
  const warningStart = getSeoulDateTimeString(0);
  const warningEnd = getSeoulDateTimeString(30);

  const [rows] = await query(
    `SELECT DISTINCT
       p.post_id AS roomId,
       p.title,
       p.date,
       ${expirationDeadlineSql} AS deletesAt
     FROM posts p
     LEFT JOIN post_participants pp ON pp.post_id = p.post_id
     WHERE (p.user_id = ? OR pp.user_id = ?)
       AND p.date IS NOT NULL
       AND ${expirationDeadlineSql} BETWEEN ? AND ?`,
    [userId, userId, warningStart, warningEnd],
  );

  return rows.map((row) => ({
    ...row,
    deletesAt: `${String(row.deletesAt).replace(" ", "T")}+09:00`,
  }));
};

router.get("/unread-summary", auth, async (req, res) => {
  const myId = req.userId;

  try {
    const [groupRooms, dmRooms] = await Promise.all([
      getMyGroupRooms(myId),
      getMyDmRooms(myId),
    ]);

    const groupRoomKeys = groupRooms.map((room) => room.roomKey);
    const dmRoomKeys = dmRooms.map((room) => room.roomKey);
    const unreadCounts = await getRoomUnreadCounts(myId, [
      ...groupRoomKeys,
      ...dmRoomKeys,
    ]);

    const groupUnread = groupRoomKeys.reduce(
      (sum, roomKey) => sum + (unreadCounts.get(roomKey) || 0),
      0,
    );
    const dmUnread = dmRoomKeys.reduce(
      (sum, roomKey) => sum + (unreadCounts.get(roomKey) || 0),
      0,
    );

    res.json({
      groupUnread,
      dmUnread,
      totalUnread: groupUnread + dmUnread,
      rooms: {
        groups: groupRooms.map((room) => ({
          roomId: room.roomId,
          unreadCount: unreadCounts.get(room.roomKey) || 0,
        })),
        dms: dmRooms.map((room) => ({
          roomId: room.roomId,
          unreadCount: unreadCounts.get(room.roomKey) || 0,
        })),
      },
    });
  } catch (err) {
    console.error("Unread summary lookup failed:", err);
    res.status(500).json({ message: "unread summary lookup failed" });
  }
});

router.get("/notifications", auth, async (req, res) => {
  const myId = req.userId;

  try {
    const [groupRooms, dmRooms, reminders, deletionWarnings] = await Promise.all([
      getMyGroupRooms(myId),
      getMyDmRooms(myId),
      getAppointmentReminders(myId),
      getDeletionWarnings(myId),
    ]);

    const allRoomKeys = [
      ...groupRooms.map((room) => room.roomKey),
      ...dmRooms.map((room) => room.roomKey),
    ];
    const unreadCounts = await getRoomUnreadCounts(myId, allRoomKeys);
    const roomTitles = new Map([
      ...groupRooms.map((room) => [room.roomKey, room.title || "그룹 채팅"]),
      ...dmRooms.map((room) => [room.roomKey, room.title || "개인 메시지"]),
    ]);

    const unreadItems = allRoomKeys
      .map((roomKey) => ({
        id: `unread:${roomKey}`,
        type: roomKey.startsWith("dm_") ? "dm" : "group",
        roomId: roomKey.startsWith("dm_") ? roomKey.slice(3) : roomKey,
        roomKey,
        title: roomTitles.get(roomKey),
        count: unreadCounts.get(roomKey) || 0,
      }))
      .filter((item) => item.count > 0);

    res.json({
      unread: unreadItems,
      reminders: reminders.map((row) => ({
        id: `reminder:${row.roomId}`,
        type: "appointment",
        roomId: row.roomId,
        title: row.title || "약속",
        date: row.date,
        time: row.time,
        place: row.place,
      })),
      deletionWarnings: deletionWarnings.map((row) => ({
        id: `delete-warning:${row.roomId}:${row.deletesAt}`,
        type: "deletion",
        roomId: row.roomId,
        title: row.title || "약속 게시글",
        date: row.date,
        deletesAt: row.deletesAt,
        message: `'${row.title || "약속 게시글"}' 게시글의 약속 날짜가 지났습니다. 30분 뒤 채팅방과 채팅 기록, 파일이 삭제됩니다.`,
      })),
    });
  } catch (err) {
    console.error("Notifications lookup failed:", err);
    res.status(500).json({ message: "notifications lookup failed" });
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
        (SELECT created_at FROM messages WHERE room_id = CONCAT('dm_', dr.id) ORDER BY id DESC LIMIT 1) as lastMessageTime,
        (
          SELECT COUNT(*)
          FROM messages m
          LEFT JOIN message_reads mr
            ON mr.message_id = m.id AND mr.user_id = ?
          WHERE m.room_id = CONCAT('dm_', dr.id)
            AND m.user_id <> ?
            AND m.is_system = 0
            AND m.is_deleted = 0
            AND mr.message_id IS NULL
        ) as unreadCount
      FROM dm_rooms dr
      JOIN users u ON (dr.user1_id = ? AND dr.user2_id = u.user_id) OR (dr.user2_id = ? AND dr.user1_id = u.user_id)
      WHERE (dr.user1_id = ? OR dr.user2_id = ?)
        AND NOT EXISTS (
          SELECT 1 FROM user_relations r
          WHERE r.status = 'blocked'
            AND ((r.requester_id = ? AND r.target_id = u.user_id) OR (r.requester_id = u.user_id AND r.target_id = ?))
        )
      ORDER BY lastMessageTime DESC`,
      [myId, myId, myId, myId, myId, myId, myId, myId],
    );
    res.json(
      rows.map((row) => ({
        ...row,
        lastMessageTime: toUtcIsoString(row.lastMessageTime),
        unreadCount: Number(row.unreadCount || 0),
      })),
    );
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

router.delete("/dm/:roomId", auth, async (req, res) => {
  const myId = req.userId;
  const { roomId } = req.params;
  const roomIdInt = Number(roomId);

  if (!roomIdInt) {
    return res.status(400).json({ message: "invalid room id" });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [[room]] = await connection.query(
      "SELECT id FROM dm_rooms WHERE id = ? AND (user1_id = ? OR user2_id = ?)",
      [roomIdInt, myId, myId],
    );

    if (!room) {
      await connection.rollback();
      return res.status(404).json({ message: "room not found" });
    }

    const roomKey = `dm_${roomIdInt}`;
    await connection.query(
      `DELETE mr FROM message_reactions mr JOIN messages m ON mr.message_id = m.id WHERE m.room_id = ?`,
      [roomKey],
    );
    await connection.query(
      `DELETE mrd FROM message_reads mrd JOIN messages m ON mrd.message_id = m.id WHERE m.room_id = ?`,
      [roomKey],
    );
    await connection.query("DELETE FROM messages WHERE room_id = ?", [roomKey]);
    await connection.query("DELETE FROM dm_rooms WHERE id = ?", [roomIdInt]);

    await connection.commit();

    const io = req.app.get("io");
    io?.to(roomKey)?.emit("dm_room_deleted", {
      roomId: roomIdInt,
      deletedBy: myId,
    });

    res.json({ success: true });
  } catch (err) {
    await connection.rollback();
    console.error("DM delete failed:", err);
    res.status(500).json({ message: "dm delete failed" });
  } finally {
    connection.release();
  }
});

router.post("/share", auth, async (req, res) => {
  const myId = req.userId;
  const { targetId, postId, postTitle } = req.body;

  if (!targetId || !postId) {
    return res.status(400).json({ message: "대상과 게시글 정보가 필요합니다." });
  }

  try {
    if (await hasBlockedRelation(myId, targetId)) {
      return res.status(403).json({ message: "blocked user" });
    }

    const u1 = Math.min(myId, targetId);
    const u2 = Math.max(myId, targetId);
    const [[existing]] = await query(
      "SELECT id FROM dm_rooms WHERE user1_id = ? AND user2_id = ?",
      [u1, u2],
    );

    let roomId = existing?.id;
    if (!roomId) {
      const [result] = await query(
        "INSERT INTO dm_rooms (user1_id, user2_id) VALUES (?, ?)",
        [u1, u2],
      );
      roomId = result.insertId;
    }

    const roomStr = `dm_${roomId}`;
    const [[myInfo]] = await query(
      "SELECT nickname FROM users WHERE user_id = ?",
      [myId],
    );
    const content = JSON.stringify({
      kind: "share_post",
      postId,
      postTitle: postTitle || "게시글",
      sharerNickname: myInfo?.nickname || "알 수 없음",
    });

    const [result] = await query(
      "INSERT INTO messages (room_id, user_id, nickname, content, is_system) VALUES (?, ?, ?, ?, ?)",
      [roomStr, myId, myInfo?.nickname || "", content, 1],
    );

    const io = req.app.get("io");
    io?.to(roomStr)?.emit("receive_message", {
      id: result.insertId,
      roomId: roomStr,
      userId: myId,
      nickname: myInfo?.nickname || "",
      content,
      isSystem: true,
      parentId: null,
      created_at: new Date().toISOString(),
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Share failed:", err);
    res.status(500).json({ message: "게시글 공유에 실패했습니다." });
  }
});

export default router;
