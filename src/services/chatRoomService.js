import pool, { query } from "../db.js";
import { getPost } from "../repositories/postRepository.js";
import { toUtcIsoString } from "../utils/time.js";

const httpError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

export const hasBlockedRelation = async (userA, userB) => {
  const [[relation]] = await query(
    `SELECT id FROM user_relations
     WHERE status = 'blocked'
       AND ((requester_id = ? AND target_id = ?) OR (requester_id = ? AND target_id = ?))
     LIMIT 1`,
    [userA, userB, userB, userA],
  );
  return Boolean(relation);
};

export const getRoomBlockWarning = async ({ userId, roomId }) => {
  const [blockedUsers] = await query(
    `SELECT u.user_id AS id, u.nickname
     FROM user_relations r
     JOIN users u ON u.user_id = r.target_id
     WHERE r.requester_id = ? AND r.status = 'blocked'
       AND u.is_deleted = FALSE`,
    [userId],
  );

  if (blockedUsers.length === 0) {
    return { shouldWarn: false, blockedUsers: [] };
  }

  const [postCreatorRows] = await query(
    "SELECT user_id AS id FROM posts WHERE post_id = ? AND is_deleted = 0",
    [roomId],
  );

  const [postParticipantsRows] = await query(
    `SELECT pp.user_id AS id
     FROM post_participants pp
     JOIN users u ON u.user_id = pp.user_id
     WHERE pp.post_id = ? AND u.is_deleted = FALSE`,
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

  return {
    shouldWarn: presentBlockedUsers.length > 0,
    blockedUsers: presentBlockedUsers,
  };
};

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
     JOIN users u ON u.user_id = p.user_id AND u.is_deleted = FALSE
     LEFT JOIN post_participants pp ON pp.post_id = p.post_id
     WHERE p.is_deleted = 0
       AND (p.user_id = ? OR pp.user_id = ?)`,
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
     WHERE (dr.user1_id = ? OR dr.user2_id = ?)
       AND u.is_deleted = FALSE`,
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
     JOIN users u ON u.user_id = p.user_id AND u.is_deleted = FALSE
     LEFT JOIN post_participants pp ON pp.post_id = p.post_id
     WHERE (p.user_id = ? OR pp.user_id = ?)
       AND p.is_deleted = 0
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
     JOIN users u ON u.user_id = p.user_id AND u.is_deleted = FALSE
     LEFT JOIN post_participants pp ON pp.post_id = p.post_id
     WHERE (p.user_id = ? OR pp.user_id = ?)
       AND p.is_deleted = 0
       AND p.date IS NOT NULL
       AND ${expirationDeadlineSql} BETWEEN ? AND ?`,
    [userId, userId, warningStart, warningEnd],
  );

  return rows.map((row) => ({
    ...row,
    deletesAt: `${String(row.deletesAt).replace(" ", "T")}+09:00`,
  }));
};

export const getUnreadSummary = async (userId) => {
  const [groupRooms, dmRooms] = await Promise.all([
    getMyGroupRooms(userId),
    getMyDmRooms(userId),
  ]);

  const groupRoomKeys = groupRooms.map((room) => room.roomKey);
  const dmRoomKeys = dmRooms.map((room) => room.roomKey);
  const unreadCounts = await getRoomUnreadCounts(userId, [
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

  return {
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
  };
};

export const getNotifications = async (userId) => {
  const [groupRooms, dmRooms, reminders, deletionWarnings] = await Promise.all([
    getMyGroupRooms(userId),
    getMyDmRooms(userId),
    getAppointmentReminders(userId),
    getDeletionWarnings(userId),
  ]);

  const allRoomKeys = [
    ...groupRooms.map((room) => room.roomKey),
    ...dmRooms.map((room) => room.roomKey),
  ];
  const unreadCounts = await getRoomUnreadCounts(userId, allRoomKeys);
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

  return {
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
      message: `'${row.title || "약속 게시글"}' 게시글의 약속 날짜가 지났습니다. 30분 후 채팅방과 채팅 기록, 파일이 삭제됩니다.`,
    })),
  };
};

export const getDmRooms = async (userId) => {
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
      AND u.is_deleted = FALSE
      AND NOT EXISTS (
        SELECT 1 FROM user_relations r
        WHERE r.status = 'blocked'
          AND ((r.requester_id = ? AND r.target_id = u.user_id) OR (r.requester_id = u.user_id AND r.target_id = ?))
      )
    ORDER BY lastMessageTime DESC`,
    [userId, userId, userId, userId, userId, userId, userId, userId],
  );

  return rows.map((row) => ({
    ...row,
    lastMessageTime: toUtcIsoString(row.lastMessageTime),
    unreadCount: Number(row.unreadCount || 0),
  }));
};

export const createDmRoom = async ({ userId, targetId }) => {
  if (!targetId) throw httpError(400, "target id is required");

  const [[targetUser]] = await query(
    "SELECT user_id FROM users WHERE user_id = ? AND is_deleted = FALSE",
    [targetId],
  );
  if (!targetUser) throw httpError(404, "user not found");
  if (await hasBlockedRelation(userId, targetId)) throw httpError(403, "blocked user");

  const u1 = Math.min(userId, targetId);
  const u2 = Math.max(userId, targetId);
  const [[existing]] = await query(
    "SELECT id FROM dm_rooms WHERE user1_id = ? AND user2_id = ?",
    [u1, u2],
  );

  if (existing) return { roomId: existing.id };

  const [result] = await query(
    "INSERT INTO dm_rooms (user1_id, user2_id) VALUES (?, ?)",
    [u1, u2],
  );
  return { roomId: result.insertId };
};

export const getDmRoom = async ({ userId, roomId }) => {
  const [[room]] = await query(
    `SELECT
      dr.id,
      u.user_id as targetId,
      u.nickname as targetNickname,
      u.profile_img as targetProfileImg
    FROM dm_rooms dr
    JOIN users u ON ((dr.user1_id = u.user_id AND dr.user2_id = ?) OR (dr.user2_id = u.user_id AND dr.user1_id = ?))
      AND u.is_deleted = FALSE
    WHERE dr.id = ? AND (dr.user1_id = ? OR dr.user2_id = ?)`,
    [userId, userId, roomId, userId, userId],
  );

  if (!room) throw httpError(404, "room not found");
  return room;
};

export const deleteDmRoom = async ({ userId, roomId }) => {
  const roomIdInt = Number(roomId);
  if (!roomIdInt) throw httpError(400, "invalid room id");

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [[room]] = await connection.query(
      "SELECT id FROM dm_rooms WHERE id = ? AND (user1_id = ? OR user2_id = ?)",
      [roomIdInt, userId, userId],
    );

    if (!room) throw httpError(404, "room not found");

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
    return { roomId: roomIdInt, roomKey };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export const sharePostToDm = async ({ userId, targetId, postId }) => {
  if (!targetId || !postId) {
    throw httpError(400, "target and post are required");
  }

  const [[targetUser]] = await query(
    "SELECT user_id FROM users WHERE user_id = ? AND is_deleted = FALSE",
    [targetId],
  );
  if (!targetUser) throw httpError(404, "user not found");
  if (await hasBlockedRelation(userId, targetId)) throw httpError(403, "blocked user");

  const post = await getPost(postId);
  if (!post) throw httpError(404, "Post not found");

  const { roomId } = await createDmRoom({ userId, targetId });
  const roomKey = `dm_${roomId}`;
  const [[myInfo]] = await query("SELECT nickname FROM users WHERE user_id = ?", [
    userId,
  ]);
  const content = JSON.stringify({
    kind: "share_post",
    postId,
    postTitle: post.title || "게시글",
    postImage: post.image || null,
    sharerNickname: myInfo?.nickname || "알 수 없음",
  });

  const [result] = await query(
    "INSERT INTO messages (room_id, user_id, nickname, content, is_system) VALUES (?, ?, ?, ?, ?)",
    [roomKey, userId, myInfo?.nickname || "", content, 1],
  );

  return {
    roomId,
    roomKey,
    message: {
      id: result.insertId,
      roomId: roomKey,
      userId,
      nickname: myInfo?.nickname || "",
      content,
      isSystem: true,
      parentId: null,
      created_at: new Date().toISOString(),
    },
  };
};
