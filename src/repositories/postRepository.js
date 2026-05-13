import pool from "../db.js";

const parseJsonArray = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);

  try {
    const parsed = JSON.parse(Buffer.isBuffer(value) ? value.toString() : value);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
};

const toTimestamp = (value) => {
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
};

let postsHasUserIdCache;

const postsHasUserId = async () => {
  if (postsHasUserIdCache !== undefined) return postsHasUserIdCache;

  try {
    await pool.query("SELECT user_id FROM posts LIMIT 0");
    postsHasUserIdCache = true;
  } catch {
    postsHasUserIdCache = false;
  }

  return postsHasUserIdCache;
};

const getUserNickname = async (userId) => {
  const [[user]] = await pool.query(
    "SELECT nickname FROM users WHERE user_id = ?",
    [userId],
  );
  return user?.nickname || null;
};

const mapPostRow = (post, likes = [], participants = [], comments = []) => {
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
    const authorNickname = row.nickname || "Anonymous";
    const item = {
      id: row.id,
      userId: row.user_id,
      text: row.content,
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

  return {
    ...post,
    likes: likes.length,
    likedBy: likes.map((row) => row.user_id),
    joinedBy,
    joinedByNicknames,
    joinedUserIds,
    participants: 1 + joinedBy.length,
    comments: topLevel,
  };
};

export const getPostWithDetails = async (id) => {
  const post = await getPost(id);
  if (!post) return null;

  const [likes] = await pool.query(
    `SELECT u.user_id, u.nickname
     FROM post_likes pl
     JOIN users u ON pl.user_id = u.user_id
     WHERE pl.post_id = ?`,
    [id],
  );

  const [participants] = await pool.query(
    `SELECT u.user_id, u.nickname
     FROM post_participants pp
     JOIN users u ON pp.user_id = u.user_id
     WHERE pp.post_id = ?`,
    [id],
  );

  const [comments] = await pool.query(
    `SELECT c.*, u.nickname
     FROM comments c
     LEFT JOIN users u ON c.user_id = u.user_id
     WHERE c.post_id = ?
     ORDER BY c.created_at ASC, c.id ASC`,
    [id],
  );

  return mapPostRow(post, likes, participants, comments);
};

export const getPosts = async () => {
  const hasUserId = await postsHasUserId();
  const authorJoin = hasUserId
    ? "JOIN users u ON p.user_id = u.user_id"
    : "JOIN users u ON p.author = u.nickname";
  const postSelect = hasUserId
    ? "p.*"
    : "p.*, u.user_id AS user_id";

  const [rows] = await pool.query(
    `SELECT
       ${postSelect},
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

  return rows.map((row) => {
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
    );
  });
};

export const getPost = async (id) => {
  const hasUserId = await postsHasUserId();
  const authorJoin = hasUserId
    ? "JOIN users u ON p.user_id = u.user_id"
    : "JOIN users u ON p.author = u.nickname";
  const postSelect = hasUserId
    ? "p.*"
    : "p.*, u.user_id AS user_id";

  const [[row]] = await pool.query(
    `SELECT ${postSelect}, u.nickname as authorNickname
     FROM posts p
     ${authorJoin}
     WHERE p.post_id = ?`,
    [id],
  );
  return row;
};

export const createPost = async (data) => {
  if (!(await postsHasUserId())) {
    const nickname = await getUserNickname(data.user_id);
    if (!nickname) {
      const error = new Error("invalid user");
      error.status = 400;
      throw error;
    }

    const [result] = await pool.query(
      `INSERT INTO posts
      (title, content, date, time, place, latitude, longitude, capacity, status, author, categories, image)
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
        nickname,
        data.categories,
        data.image,
      ],
    );

    return { id: result.insertId };
  }

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
  if (!(await postsHasUserId())) {
    const post = await getPost(id);
    if (!post || String(post.user_id) !== String(userId)) return 0;

    const [result] = await pool.query(
      `UPDATE posts SET
       title=?, content=?, date=?, time=?, place=?, latitude=?, longitude=?,
       capacity=?, status=?, categories=?, image=?, edited=1
       WHERE post_id=?`,
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
        data.categories,
        data.image,
        id,
      ],
    );
    return result.affectedRows;
  }

  const [result] = await pool.query(
    `UPDATE posts SET
     title=?, content=?, date=?, time=?, place=?, latitude=?, longitude=?,
     capacity=?, status=?, categories=?, image=?, edited=1
     WHERE post_id=? AND user_id=?`,
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
      data.categories,
      data.image,
      id,
      userId,
    ],
  );
  return result.affectedRows;
};

export const deletePost = async (id, userId) => {
  if (!(await postsHasUserId())) {
    const post = await getPost(id);
    if (!post || String(post.user_id) !== String(userId)) return 0;

    const [result] = await pool.query("DELETE FROM posts WHERE post_id=?", [
      id,
    ]);
    return result.affectedRows;
  }

  const [result] = await pool.query(
    "DELETE FROM posts WHERE post_id=? AND user_id=?",
    [id, userId],
  );
  return result.affectedRows;
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
    await pool.query("INSERT INTO post_likes (user_id, post_id) VALUES (?, ?)", [
      userId,
      postId,
    ]);
  }

  return getPostWithDetails(postId);
};

export const toggleJoinPost = async (userId, postId) => {
  const post = await getPost(postId);
  if (!post) return null;
  if (String(post.user_id) === String(userId)) {
    const error = new Error("cannot join own post");
    error.status = 400;
    throw error;
  }

  const [[existing]] = await pool.query(
    "SELECT id FROM post_participants WHERE user_id=? AND post_id=?",
    [userId, postId],
  );

  if (existing) {
    await pool.query("DELETE FROM post_participants WHERE id=?", [existing.id]);
  } else {
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
  }

  const [[{ count }]] = await pool.query(
    "SELECT COUNT(*) AS count FROM post_participants WHERE post_id=?",
    [postId],
  );
  const nextParticipants = 1 + count;
  const nextStatus =
    nextParticipants >= (post.capacity || 2)
      ? "\ubaa8\uc9d1\uc644\ub8cc"
      : "\ubaa8\uc9d1\uc911";

  await pool.query(
    "UPDATE posts SET participants=?, status=? WHERE post_id=?",
    [nextParticipants, nextStatus, postId],
  );

  return getPostWithDetails(postId);
};

export const getComments = async (postId) => {
  const [rows] = await pool.query(
    `SELECT c.*, u.nickname
     FROM comments c
     JOIN users u ON c.user_id = u.user_id
     WHERE post_id = ?`,
    [postId],
  );
  return rows;
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
  pool.query("UPDATE comments SET content=?, edited=1 WHERE id=? AND user_id=?", [
    content,
    id,
    userId,
  ]);

export const deleteComment = (id, userId) =>
  pool.query("DELETE FROM comments WHERE id=? AND user_id=?", [id, userId]);
