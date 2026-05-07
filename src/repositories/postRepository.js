import pool from "../db.js";

const mapPostRow = (post, likes = [], participants = [], comments = []) => {
  const joinedBy = participants.map((row) => row.nickname);
  const joinedUserIds = participants.map((row) => row.user_id);
  const topLevel = [];
  const byId = new Map();

  comments.forEach((row) => {
    const item = {
      id: row.id,
      userId: row.user_id,
      text: row.content,
      author: row.nickname || "익명",
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
    likedBy: likes.map((row) => row.nickname),
    joinedBy,
    joinedUserIds,
    participants: 1 + joinedBy.length,
    comments: topLevel,
  };
};

export const getPostWithDetails = async (id) => {
  const post = await getPost(id);
  if (!post) return null;

  const [likes] = await pool.query(
    `SELECT u.nickname
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

// posts
export const getPosts = async () => {
  const [rows] = await pool.query(
    "SELECT * FROM posts ORDER BY created_at DESC",
  );
  return Promise.all(rows.map((row) => getPostWithDetails(row.post_id)));
};

export const getPost = async (id) => {
  const [[row]] = await pool.query("SELECT * FROM posts WHERE post_id=?", [id]);
  return row;
};

export const createPost = async (data) => {
  const [result] = await pool.query(
    `INSERT INTO posts 
    (title, content, date, time, place, capacity, status, author, categories, image)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.title,
      data.content,
      data.date,
      data.time,
      data.place,
      data.capacity,
      data.status,
      data.author,
      data.categories,
      data.image,
    ],
  );

  return { id: result.insertId };
};

export const updatePost = async (id, data) => {
  await pool.query(
    `UPDATE posts SET
     title=?, content=?, date=?, time=?, place=?,
     capacity=?, status=?, categories=?, image=?, edited=1
     WHERE post_id=?`,
    [
      data.title,
      data.content,
      data.date,
      data.time,
      data.place,
      data.capacity,
      data.status,
      data.categories,
      data.image,
      id,
    ],
  );
};

export const deletePost = (id) =>
  pool.query("DELETE FROM posts WHERE post_id=?", [id]);

// like
export const toggleLikePost = async (userId, postId) => {
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

// join
export const toggleJoinPost = async (userId, postId) => {
  const post = await getPost(postId);
  if (!post) return null;

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
    nextParticipants >= (post.capacity || 2) ? "모집완료" : "모집중";

  await pool.query(
    "UPDATE posts SET participants=?, status=? WHERE post_id=?",
    [nextParticipants, nextStatus, postId],
  );

  return getPostWithDetails(postId);
};

// comments
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

export const createComment = (data) =>
  pool.query(
    "INSERT INTO comments (post_id, user_id, content, parent_id) VALUES (?, ?, ?, ?)",
    [data.postId, data.userId, data.content, data.parent_id || null],
  );

export const updateComment = (id, userId, content) =>
  pool.query("UPDATE comments SET content=?, edited=1 WHERE id=? AND user_id=?", [
    content,
    id,
    userId,
  ]);

export const deleteComment = (id, userId) =>
  pool.query("DELETE FROM comments WHERE (id=? OR parent_id=?) AND user_id=?", [
    id,
    id,
    userId,
  ]);
