import cron from "node-cron";
import pool from "../db.js";
import { cloudinary } from "../middleware/cloudinary.js";

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
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second}`;
};

const getSeoulIsoString = () => `${getSeoulDateTimeString().replace(" ", "T")}+09:00`;

const toSeoulIsoString = (value) => `${String(value).replace(" ", "T")}+09:00`;

const parseMessageAttachments = (content) => {
  if (!content || typeof content !== "string") return [];

  try {
    const parsed = JSON.parse(content);
    if (parsed?.kind === "chat_payload" && Array.isArray(parsed.attachments)) {
      return parsed.attachments;
    }
    if (parsed?.kind === "chat_attachment") {
      return [parsed];
    }
  } catch {
    return [];
  }

  return [];
};

const addCloudinaryAsset = (assets, publicId, resourceType = "image") => {
  if (!publicId) return;
  const normalizedType = ["image", "video", "raw"].includes(resourceType)
    ? resourceType
    : "image";
  assets.set(`${normalizedType}:${publicId}`, {
    publicId,
    resourceType: normalizedType,
  });
};

const getPublicIdFromCloudinaryUrl = (url) => {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "res.cloudinary.com") return null;

    const uploadIndex = parsed.pathname.indexOf("/upload/");
    if (uploadIndex === -1) return null;

    const pathAfterUpload = parsed.pathname.slice(uploadIndex + "/upload/".length);
    const withoutVersion = pathAfterUpload.replace(/^v\d+\//, "");
    return withoutVersion.replace(/\.[^/.]+$/, "");
  } catch {
    return null;
  }
};

const collectCloudinaryAssets = async (connection, postIds) => {
  if (postIds.length === 0) return [];

  const assets = new Map();
  const [posts] = await connection.query(
    "SELECT image FROM posts WHERE post_id IN (?)",
    [postIds],
  );
  posts.forEach((post) => {
    addCloudinaryAsset(assets, getPublicIdFromCloudinaryUrl(post.image), "image");
  });

  const roomIds = postIds.map(String);
  const [messages] = await connection.query(
    "SELECT content FROM messages WHERE room_id IN (?)",
    [roomIds],
  );
  messages.forEach((message) => {
    parseMessageAttachments(message.content).forEach((attachment) => {
      addCloudinaryAsset(
        assets,
        attachment.publicId || getPublicIdFromCloudinaryUrl(attachment.url),
        attachment.resourceType,
      );
    });
  });

  return [...assets.values()];
};

const deleteCloudinaryAssets = async (assets) => {
  if (assets.length === 0) return;

  await Promise.allSettled(
    assets.map((asset) =>
      cloudinary.uploader.destroy(asset.publicId, {
        resource_type: asset.resourceType,
      }),
    ),
  );
};

const getPostMemberIds = async (connection, postId) => {
  const [rows] = await connection.query(
    `SELECT user_id FROM posts WHERE post_id = ?
     UNION
     SELECT user_id FROM post_participants WHERE post_id = ?`,
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
       SELECT post_id, user_id FROM posts
       UNION
       SELECT post_id, user_id FROM post_participants
     ) member ON member.post_id = p.post_id
     WHERE p.post_id IN (?)
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
         SELECT post_id, user_id FROM posts
         UNION
         SELECT post_id, user_id FROM post_participants
       ) member ON member.post_id = p.post_id
       WHERE p.date IS NOT NULL
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
  `'${title}' 게시글의 약속 날짜가 지났습니다. 30분 뒤 채팅방과 채팅 기록, 파일이 삭제됩니다.`;

const sendDeletionWarnings = async (io) => {
  const warningStart = getSeoulDateTimeString(30);
  const warningEnd = getSeoulDateTimeString(31);

  try {
    const [posts] = await pool.query(
      `SELECT post_id, title, ${expirationDeadlineSql} AS deletes_at
       FROM posts
       WHERE date IS NOT NULL
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
        await emitToPostMembers(connection, io, post, "chat_room_deletion_warning", {
          roomId,
          title,
          deletesAt,
          message: content,
        });
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
  let cloudinaryAssets = [];
  let deletedPosts = [];

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [expiredPosts] = await connection.query(
      `SELECT post_id, title
       FROM posts
       WHERE date IS NOT NULL
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

    await connection.query("DELETE FROM messages WHERE room_id IN (?)", [roomIds]);
    await connection.query("DELETE FROM posts WHERE post_id IN (?)", [postIds]);

    await connection.commit();

    deletedPosts.forEach(({ memberIds, ...post }) => {
      io.to(post.roomId).emit("chat_room_deleted", post);
      memberIds.forEach((memberId) => {
        io.to(`user_${memberId}`).emit("chat_room_deleted", post);
      });
      io.in(post.roomId).socketsLeave(post.roomId);
    });

    await deleteCloudinaryAssets(cloudinaryAssets);

    console.log(`Deleted ${expiredPosts.length} expired post(s) before ${now}.`);
  } catch (error) {
    if (connection) await connection.rollback();
    console.error("Error deleting expired posts:", error);
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
