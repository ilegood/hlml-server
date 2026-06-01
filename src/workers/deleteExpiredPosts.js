import cron from "node-cron";
import pool from "../db.js";

const TIMEZONE = "Asia/Seoul";
const LATE_NIGHT_GRACE_START = "22:00:00";
const DEFAULT_DELETE_TIME = "00:00:00";
const LATE_NIGHT_DELETE_TIME = "12:00:00";

const expirationDeadlineSql = `
  TIMESTAMP(
    DATE_ADD(date, INTERVAL 1 DAY),
    CASE
      WHEN time IS NOT NULL AND time >= '${LATE_NIGHT_GRACE_START}' THEN '${LATE_NIGHT_DELETE_TIME}'
      ELSE '${DEFAULT_DELETE_TIME}'
    END
  )
`;

const getSeoulDateTimeString = (offsetMinutes = 0) => {
  const date = new Date(Date.now() + offsetMinutes * 60 * 1000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second}`;
};

const getSeoulIsoString = () =>
  `${getSeoulDateTimeString().replace(" ", "T")}+09:00`;

const toSeoulIsoString = (value) => `${String(value).replace(" ", "T")}+09:00`;

const getPostMemberIds = async (connection, postId) => {
  const [rows] = await connection.query(
    `SELECT p.user_id
     FROM posts p
     JOIN users u ON u.user_id = p.user_id
     WHERE p.post_id = ? AND p.is_deleted = 0 AND u.is_deleted = FALSE
     UNION
     SELECT pp.user_id
     FROM post_participants pp
     JOIN users u ON u.user_id = pp.user_id
     WHERE pp.post_id = ? AND u.is_deleted = FALSE`,
    [postId, postId],
  );
  return rows.map((row) => Number(row.user_id)).filter(Boolean);
};

const recordCompletedAppointments = async (connection, postIds, now) => {
  if (postIds.length === 0) return;

  await connection.query(
    `INSERT IGNORE INTO appointment_completions (user_id, post_id, completed_at)
     SELECT member.user_id, p.post_id, TIMESTAMP(p.date, p.time)
     FROM posts p
     JOIN (
       SELECT p2.post_id, p2.user_id
       FROM posts p2
       JOIN users u ON u.user_id = p2.user_id AND u.is_deleted = FALSE
       UNION
       SELECT pp.post_id, pp.user_id
       FROM post_participants pp
       JOIN users u ON u.user_id = pp.user_id AND u.is_deleted = FALSE
     ) member ON member.post_id = p.post_id
     WHERE p.post_id IN (?)
       AND p.is_deleted = 0
       AND p.date IS NOT NULL
       AND p.time IS NOT NULL
       AND TIMESTAMP(p.date, p.time) <= ?`,
    [postIds, now],
  );
};

const recordDueCompletedAppointments = async () => {
  const now = getSeoulDateTimeString();
  let connection;

  try {
    connection = await pool.getConnection();
    await connection.query(
      `INSERT IGNORE INTO appointment_completions (user_id, post_id, completed_at)
       SELECT member.user_id, p.post_id, TIMESTAMP(p.date, p.time)
       FROM posts p
       JOIN (
         SELECT p2.post_id, p2.user_id
         FROM posts p2
         JOIN users u ON u.user_id = p2.user_id AND u.is_deleted = FALSE
         UNION
         SELECT pp.post_id, pp.user_id
         FROM post_participants pp
         JOIN users u ON u.user_id = pp.user_id AND u.is_deleted = FALSE
       ) member ON member.post_id = p.post_id
       WHERE p.date IS NOT NULL
         AND p.is_deleted = 0
         AND p.time IS NOT NULL
         AND TIMESTAMP(p.date, p.time) <= ?`,
      [now],
    );
  } catch (error) {
    console.error("Error recording completed appointments:", error);
  } finally {
    if (connection) connection.release();
  }
};

const emitToPostMembers = async (connection, io, post, eventName, payload) => {
  const memberIds = await getPostMemberIds(connection, post.post_id);
  memberIds.forEach((memberId) => {
    io.to(`user_${memberId}`).emit(eventName, payload);
  });
};

const buildWarningMessage = (title) =>
  `'${title}' 게시글의 약속 날짜가 지났습니다. 30분 뒤 게시판에서 만료 처리되지만, 참여 중인 채팅방은 계속 유지됩니다.`;

const sendDeletionWarnings = async (io) => {
  const warningStart = getSeoulDateTimeString(30);
  const warningEnd = getSeoulDateTimeString(31);

  try {
    const [posts] = await pool.query(
      `SELECT p.post_id, p.title, ${expirationDeadlineSql} AS deletes_at
       FROM posts p
       JOIN users u ON u.user_id = p.user_id AND u.is_deleted = FALSE
       WHERE p.date IS NOT NULL
         AND p.is_deleted = 0
         AND ${expirationDeadlineSql} >= ?
         AND ${expirationDeadlineSql} < ?`,
      [warningStart, warningEnd],
    );

    for (const post of posts) {
      const roomId = String(post.post_id);
      const title = post.title || "약속 게시글";
      const deletesAt = toSeoulIsoString(post.deletes_at);
      const content = buildWarningMessage(title);
      const message = {
        id: `delete-warning-${Date.now()}-${post.post_id}`,
        roomId,
        userId: 0,
        nickname: "System",
        content,
        isSystem: true,
        isDeletionWarning: true,
        time: getSeoulIsoString(),
      };

      io.to(roomId).emit("receive_message", message);

      const connection = await pool.getConnection();
      try {
        await emitToPostMembers(
          connection,
          io,
          post,
          "chat_room_deletion_warning",
          {
            roomId,
            title,
            deletesAt,
            message: content,
          },
        );
      } finally {
        connection.release();
      }
    }

    if (posts.length > 0) {
      console.log(`Sent deletion warnings for ${posts.length} post(s).`);
    }
  } catch (error) {
    console.error("Error sending deletion warnings:", error);
  }
};

const deleteExpiredPosts = async (io) => {
  const now = getSeoulDateTimeString();
  let connection;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [expiredPosts] = await connection.query(
      `SELECT p.post_id, p.title
       FROM posts p
       JOIN users u ON u.user_id = p.user_id AND u.is_deleted = FALSE
       WHERE p.date IS NOT NULL
         AND p.is_deleted = 0
         AND ${expirationDeadlineSql} <= ?`,
      [now],
    );

    if (expiredPosts.length === 0) {
      await connection.commit();
      return;
    }

    const postIds = expiredPosts.map((post) => post.post_id);
    const roomIds = postIds.map(String);
    cloudinaryAssets = await collectCloudinaryAssets(connection, postIds);
    await recordCompletedAppointments(connection, postIds, now);
    deletedPosts = await Promise.all(
      expiredPosts.map(async (post) => ({
        roomId: String(post.post_id),
        title: post.title || "약속 게시글",
        memberIds: await getPostMemberIds(connection, post.post_id),
      })),
    );

    // Update is_deleted = 1 instead of physical deletion
    await connection.query(
      "UPDATE posts SET is_deleted = 1 WHERE post_id IN (?)",
      [postIds],
    );

    await connection.commit();

    for (const post of expiredPosts) {
      const roomId = String(post.post_id);
      const memberIds = await getPostMemberIds(connection, post.post_id);

      const expiredPayload = {
        roomId,
        title: post.title || "약속 게시글",
        message:
          "약속 시간이 지나 게시판에서 만료되었습니다. 채팅방은 유지됩니다.",
      };

      io.to(roomId).emit("chat_room_expired", expiredPayload);
      memberIds.forEach((memberId) => {
        io.to(`user_${memberId}`).emit("chat_room_expired", expiredPayload);
      });
    }

    console.log(`Expired ${expiredPosts.length} post(s) before ${now}.`);
  } catch (error) {
    if (connection) await connection.rollback();
    console.error("Error expiring posts:", error);
  } finally {
    if (connection) connection.release();
  }
};

export const startPostDeletionJob = (io) => {
  cron.schedule("* * * * *", recordDueCompletedAppointments, {
    scheduled: true,
    timezone: TIMEZONE,
  });

  cron.schedule("* * * * *", () => sendDeletionWarnings(io), {
    scheduled: true,
    timezone: TIMEZONE,
  });

  cron.schedule("* * * * *", () => deleteExpiredPosts(io), {
    scheduled: true,
    timezone: TIMEZONE,
  });

  console.log("Post expiration warning and deletion jobs started.");
};
