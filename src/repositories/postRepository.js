import pool from "../db.js";

const STATUS_OPEN = "\ubaa8\uc9d1\uc911";
const STATUS_CLOSED = "\ubaa8\uc9d1\uc644\ub8cc";

const parseJsonArray = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);

  try {
    const parsed = JSON.parse(
      Buffer.isBuffer(value) ? value.toString() : value,
    );
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
};

const toTimestamp = (value) => {
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
};



const getUserNickname = async (userId) => {
  const [[user]] = await pool.query(
    "SELECT nickname FROM users WHERE user_id = ?",
    [userId],
  );
  return user?.nickname || null;
};

const getBlockedUserIds = async (viewerId) => {
  if (!viewerId) return new Set();

  const [rows] = await pool.query(
    "SELECT target_id FROM user_relations WHERE requester_id = ? AND status = 'blocked'",
    [viewerId],
  );
  return new Set(rows.map((row) => Number(row.target_id)));
};

const getParticipantCount = async (postId) => {
  const [[{ count }]] = await pool.query(
    "SELECT COUNT(*) AS count FROM post_participants WHERE post_id=?",
    [postId],
  );
  return Number(count) || 0;
};

const syncPostParticipantState = async (
  postId,
  capacity,
  currentStatus = null,
  wasFull = false,
) => {
  const count = await getParticipantCount(postId);
  const participants = 1 + count;
  const status =
    (currentStatus === STATUS_CLOSED && !wasFull) ||
    participants >= (capacity || 2)
      ? STATUS_CLOSED
      : STATUS_OPEN;

  await pool.query(
    "UPDATE posts SET participants=?, status=? WHERE post_id=?",
    [participants, status, postId],
  );

  return { participants, status };
};

const mapPostRow = (
  post,
  likes = [],
  participants = [],
  comments = [],
  authorDetails = null,
  blockedUserIds = new Set(),
) => {
  const joinedBy = participants.map((row) => row.user_id);
  const joinedByNicknames = participants.map((row) => row.nickname);
  const joinedUserIds = participants.map((row) => row.user_id);
  const topLevel = [];
  const byId = new Map();

  const sortedComments = [...comments].sort((a, b) => {
    const dateDiff = toTimestamp(a.created_at) - toTimestamp(b.created_at);
    return dateDiff || Number(a.id) - Number(b.id);
  });

  sortedComments.forEach((row) => {
    const isBlockedComment = blockedUserIds.has(Number(row.user_id));
    const authorNickname = isBlockedComment
      ? "\ucc28\ub2e8\ud55c \uc0ac\uc6a9\uc790"
      : row.nickname || "Anonymous";
    const item = {
      id: row.id,
      userId: row.user_id,
      text: isBlockedComment
        ? "\ucc28\ub2e8\ud55c \uc0ac\ub78c\uc758 \uba54\uc2dc\uc9c0\uc785\ub2c8\ub2e4"
        : row.content,
      authorNickname,
      createdAt: row.created_at,
      edited: Boolean(row.edited),
      replies: [],
    };

    byId.set(row.id, item);

    if (row.parent_id) {
      const parent = byId.get(row.parent_id);
      if (parent) parent.replies.push(item);
    } else {
      topLevel.push(item);
    }
  });

  const participantCount = 1 + joinedBy.length;
  const capacity = Number(post.capacity) || 2;
  const status =
    post.status === STATUS_OPEN && participantCount >= capacity
      ? STATUS_CLOSED
      : post.status;

  return {
    ...post,
    status,
    authorDetails,
    participantDetails: participants,
    likes: likes.length,
    likedBy: likes.map((row) => row.user_id),
    joinedBy,
    joinedByNicknames,
    joinedUserIds,
    participants: participantCount,
    comments: topLevel,
  };
};

export const getPostWithDetails = async (id, viewerId = null) => {
  const post = await getPost(id);
  if (!post) return null;
  const blockedUserIds = await getBlockedUserIds(viewerId);
  if (blockedUserIds.has(Number(post.user_id))) return null;

  const [likes] = await pool.query(
    `SELECT u.user_id, u.nickname
     FROM post_likes pl
     JOIN users u ON pl.user_id = u.user_id
     WHERE pl.post_id = ?`,
    [id],
  );

  const [participants] = await pool.query(
    `SELECT u.user_id, u.nickname, u.profile_img
     FROM post_participants pp
     JOIN users u ON pp.user_id = u.user_id
     WHERE pp.post_id = ?`,
    [id],
  );

  const [[authorDetails]] = await pool.query(
    `SELECT user_id, nickname, profile_img FROM users WHERE user_id = ?`,
    [post.user_id],
  );

  const [comments] = await pool.query(
    `SELECT c.*, u.nickname
     FROM comments c
     LEFT JOIN users u ON c.user_id = u.user_id
     WHERE c.post_id = ?
     ORDER BY c.created_at ASC, c.id ASC`,
    [id],
  );

  return mapPostRow(
    post,
    likes,
    participants,
    comments,
    authorDetails,
    blockedUserIds,
  );
};

export const getPosts = async (viewerId = null) => {
  const blockedUserIds = await getBlockedUserIds(viewerId);
  const authorJoin = "JOIN users u ON p.user_id = u.user_id";
  const postSelect = "p.*";

  const [rows] = await pool.query(
    `SELECT
       ${postSelect},
       u.nickname AS author,
       u.nickname AS authorNickname,
       COALESCE(la.likes, JSON_ARRAY()) AS likes_json,
       COALESCE(pa.participants, JSON_ARRAY()) AS participants_json,
       COALESCE(ca.comments, JSON_ARRAY()) AS comments_json
     FROM posts p
     ${authorJoin}
     LEFT JOIN (
        SELECT
          pl.post_id,
          JSON_ARRAYAGG(
            JSON_OBJECT('user_id', u.user_id, 'nickname', u.nickname)
          ) AS likes
        FROM post_likes pl
        JOIN users u ON pl.user_id = u.user_id
        GROUP BY pl.post_id
      ) la ON p.post_id = la.post_id
     LEFT JOIN (
        SELECT
          pp.post_id,
          JSON_ARRAYAGG(
            JSON_OBJECT('user_id', u.user_id, 'nickname', u.nickname)
          ) AS participants
        FROM post_participants pp
        JOIN users u ON pp.user_id = u.user_id
        GROUP BY pp.post_id
      ) pa ON p.post_id = pa.post_id
     LEFT JOIN (
        SELECT
          c.post_id,
          JSON_ARRAYAGG(
            JSON_OBJECT(
              'id', c.id,
              'post_id', c.post_id,
              'user_id', c.user_id,
              'content', c.content,
              'parent_id', c.parent_id,
              'created_at', c.created_at,
              'edited', c.edited,
              'nickname', u.nickname
            )
          ) AS comments
        FROM comments c
        LEFT JOIN users u ON c.user_id = u.user_id
        GROUP BY c.post_id
      ) ca ON p.post_id = ca.post_id
     ORDER BY p.created_at DESC`,
  );

  return rows
    .filter((row) => !blockedUserIds.has(Number(row.user_id)))
    .map((row) => {
      const {
        likes_json: likesJson,
        participants_json: participantsJson,
        comments_json: commentsJson,
        ...post
      } = row;

      return mapPostRow(
        post,
        parseJsonArray(likesJson),
        parseJsonArray(participantsJson),
        parseJsonArray(commentsJson),
        null,
        blockedUserIds,
      );
    });
};

export const getPost = async (id) => {
  const authorJoin = "JOIN users u ON p.user_id = u.user_id";
  const postSelect = "p.*";

  const [[row]] = await pool.query(
    `SELECT ${postSelect}, u.nickname AS author, u.nickname AS authorNickname
     FROM posts p
     ${authorJoin}
     WHERE p.post_id = ?`,
    [id],
  );
  return row;
};

export const createPost = async (data) => {


  const [result] = await pool.query(
    `INSERT INTO posts
    (title, content, date, time, place, latitude, longitude, capacity, status, user_id, categories, image)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.title,
      data.content,
      data.date,
      data.time,
      data.place,
      data.latitude,
      data.longitude,
      data.capacity,
      data.status,
      data.user_id,
      data.categories,
      data.image,
    ],
  );

  return { id: result.insertId };
};

export const updatePost = async (id, userId, data) => {
  const currentParticipants = await getParticipantCount(id) + 1;
  const nextCapacity = Number.parseInt(data.capacity, 10) || 2;

  if (nextCapacity < currentParticipants) {
    const error = new Error("capacity cannot be lower than current participants");
    error.status = 400;
    throw error;
  }

  const nextStatus =
    currentParticipants >= nextCapacity ? STATUS_CLOSED : data.status;

  const [result] = await pool.query(
    `UPDATE posts SET
     title=?, content=?, date=?, time=?, place=?, latitude=?, longitude=?,
     capacity=?, participants=?, status=?, categories=?, image=?, edited=1
     WHERE post_id=? AND user_id=?`,
    [
      data.title,
      data.content,
      data.date,
      data.time,
      data.place,
      data.latitude,
      data.longitude,
      nextCapacity,
      currentParticipants,
      nextStatus,
      data.categories,
      data.image,
      id,
      userId,
    ],
  );
  return result.affectedRows;
};

export const deletePost = async (id, userId) => {
  const [result] = await pool.query(
    "DELETE FROM posts WHERE post_id=? AND user_id=?",
    [id, userId],
  );
  return result.affectedRows;
};

export const getJoinedPostsForUser = async (userId, connection) => {
  const [joinedPosts] = await connection.query(
    `SELECT pp.post_id
     FROM post_participants pp
     JOIN posts p ON pp.post_id = p.post_id
     WHERE pp.user_id = ? AND p.user_id != ?`,
    [userId, userId],
  );
  return joinedPosts;
};

export const getPostCapacity = async (postId, connection) => {
  const [[postRow]] = await connection.query(
    "SELECT capacity FROM posts WHERE post_id = ?",
    [postId],
  );
  return postRow;
};

export const countPostParticipants = async (postId, connection) => {
  const [[participantCount]] = await connection.query(
    "SELECT COUNT(*) AS count FROM post_participants WHERE post_id = ?",
    [postId],
  );
  return participantCount.count;
};

export const updatePostParticipantsAndStatus = async (
  postId,
  currentParticipants,
  status,
  connection,
) => {
  await connection.query(
    "UPDATE posts SET participants = ?, status = ? WHERE post_id = ?",
    [currentParticipants, status, postId],
  );
};

export const toggleLikePost = async (userId, postId) => {
  const post = await getPost(postId);
  if (!post) return null;
  if (String(post.user_id) === String(userId)) {
    const error = new Error("cannot like own post");
    error.status = 400;
    throw error;
  }

  const [[existing]] = await pool.query(
    "SELECT id FROM post_likes WHERE user_id=? AND post_id=?",
    [userId, postId],
  );

  if (existing) {
    await pool.query("DELETE FROM post_likes WHERE id=?", [existing.id]);
  } else {
    await pool.query(
      "INSERT INTO post_likes (user_id, post_id) VALUES (?, ?)",
      [userId, postId],
    );
  }

  return getPostWithDetails(postId);
};

export const toggleJoinPost = async (userId, postId) => {
  const post = await getPost(postId);
  if (!post) return null;
  if (String(post.user_id) === String(userId)) {
    return getPostWithDetails(postId, userId);
  }

  const [[existing]] = await pool.query(
    "SELECT id FROM post_participants WHERE user_id=? AND post_id=?",
    [userId, postId],
  );

  if (existing) {
    const wasFull = (post.participants || 1) >= (post.capacity || 2);
    await pool.query("DELETE FROM post_participants WHERE id=?", [existing.id]);
    await syncPostParticipantState(postId, post.capacity, post.status, wasFull);
  } else {
    if (post.status === STATUS_CLOSED) {
      const error = new Error("recruitment is closed");
      error.status = 400;
      throw error;
    }

    // Blocked users cannot rejoin a post room.
    const [banRows] = await pool.query(
      "SELECT id FROM post_bans WHERE post_id = ? AND user_id = ?",
      [postId, userId],
    );

    if (banRows.length > 0) {
      const error = new Error("You cannot rejoin this room.");
      error.status = 403;
      throw error;
    }

    const [[{ count }]] = await pool.query(
      "SELECT COUNT(*) AS count FROM post_participants WHERE post_id=?",
      [postId],
    );

    if (1 + count >= (post.capacity || 2)) {
      const error = new Error("capacity exceeded");
      error.status = 400;
      throw error;
    }

    await pool.query(
      "INSERT INTO post_participants (user_id, post_id) VALUES (?, ?)",
      [userId, postId],
    );
    await syncPostParticipantState(postId, post.capacity, post.status, false);
  }

  return getPostWithDetails(postId);
};

export const leavePost = async (userId, postId) => {
  const post = await getPost(postId);
  if (!post) return null;

  // Load the user nickname for ownership and system messages.
  const [[user]] = await pool.query(
    "SELECT nickname FROM users WHERE user_id = ?",
    [userId],
  );
  if (!user) return null;

  const isAuthor = post.author === user.nickname;

  if (isAuthor) {
    // If the owner leaves, transfer ownership to the first participant.
    const [[nextParticipant]] = await pool.query(
      `SELECT pp.user_id, u.nickname 
       FROM post_participants pp
       JOIN users u ON pp.user_id = u.user_id
       WHERE pp.post_id = ? 
       ORDER BY pp.id ASC LIMIT 1`,
      [postId],
    );

    if (nextParticipant) {
      await pool.query("UPDATE posts SET user_id = ? WHERE post_id = ?", [
        nextParticipant.user_id,
        postId,
      ]);
      await pool.query(
        "DELETE FROM post_participants WHERE post_id = ? AND user_id = ?",
        [postId, nextParticipant.user_id],
      );
    } else {
      // No participant is available to receive ownership.
    }
  } else {
    await pool.query(
      "DELETE FROM post_participants WHERE post_id = ? AND user_id = ?",
      [postId, userId],
    );
  }

  const wasFull = (post.participants || 1) >= (post.capacity || 2);
  await syncPostParticipantState(postId, post.capacity, post.status, wasFull);

  const leaveMsgContent = `${user.nickname}\ub2d8\uc774 \ud1f4\uc7a5\ud558\uc168\uc2b5\ub2c8\ub2e4.`;
  await pool.query(
    "INSERT INTO messages (room_id, user_id, nickname, content, is_system) VALUES (?, ?, ?, ?, ?)",
    [postId, userId, "System", leaveMsgContent, 1],
  );

  return getPostWithDetails(postId);
};

// comments
export const getComments = async (postId, viewerId = null) => {
  const blockedUserIds = await getBlockedUserIds(viewerId);
  const [rows] = await pool.query(
    `SELECT c.*, u.nickname
     FROM comments c
     JOIN users u ON c.user_id = u.user_id
     WHERE post_id = ?`,
    [postId],
  );
  return rows.map((row) =>
    blockedUserIds.has(Number(row.user_id))
      ? {
          ...row,
          nickname: "\ucc28\ub2e8\ud55c \uc0ac\uc6a9\uc790",
          content:
            "\ucc28\ub2e8\ud55c \uc0ac\ub78c\uc758 \uba54\uc2dc\uc9c0\uc785\ub2c8\ub2e4",
        }
      : row,
  );
};

export const createComment = async (data) => {
  const parentId = data.parent_id || null;

  if (parentId) {
    const [[parent]] = await pool.query(
      "SELECT id FROM comments WHERE id = ? AND post_id = ?",
      [parentId, data.postId],
    );

    if (!parent) {
      const error = new Error("invalid parent comment");
      error.status = 400;
      throw error;
    }
  }

  return pool.query(
    "INSERT INTO comments (post_id, user_id, content, parent_id) VALUES (?, ?, ?, ?)",
    [data.postId, data.userId, data.content, parentId],
  );
};

export const updateComment = (id, userId, content) =>
  pool.query(
    "UPDATE comments SET content=?, edited=1 WHERE id=? AND user_id=?",
    [content, id, userId],
  );

export const deleteComment = (id, userId) =>
  pool.query("DELETE FROM comments WHERE (id=? OR parent_id=?) AND user_id=?", [
    id,
    id,
    userId,
  ]);

// bans
export const getKickedPostsForUser = async (userId) => {
  const [rows] = await pool.query(
    `SELECT p.* 
     FROM post_bans pb
     JOIN posts p ON pb.post_id = p.post_id
     WHERE pb.user_id = ? AND pb.is_hidden = 0`,
    [userId],
  );
  return Promise.all(rows.map((row) => getPostWithDetails(row.post_id)));
};

export const deletePostBan = async (userId, postId) => {
  return pool.query(
    "UPDATE post_bans SET is_hidden = 1 WHERE user_id = ? AND post_id = ?",
    [userId, postId],
  );
};
