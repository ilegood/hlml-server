import pool from "../db.js";

export const findUserByEmail = async (email) => {
  const [rows] = await pool.query(
    "SELECT user_id, nickname, email, password, bio, profile_img FROM users WHERE email = ?",
    [email],
  );
  return rows[0];
};

export const createUser = async (nickname, email, hashedPassword, birthday, gender, phoneNumber) => {
  const [result] = await pool.query(
    `INSERT INTO users (nickname, email, password, birthday, gender, phone_number)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [nickname, email, hashedPassword, birthday, gender, phoneNumber]
  );
  return result;
};

export const findUserById = async (userId) => {
  const [rows] = await pool.query("SELECT user_id, nickname, email, bio, profile_img FROM users WHERE user_id = ?", [userId]);
  return rows[0];
};

export const findUserByIdWithPassword = async (userId) => {
  const [rows] = await pool.query("SELECT user_id, nickname, email, bio, profile_img, password FROM users WHERE user_id = ?", [userId]);
  return rows[0];
};

export const findUserByNickname = async (nickname, excludeUserId = null) => {
  const params = [nickname];
  let query = "SELECT user_id FROM users WHERE nickname = ?";
  if (excludeUserId) {
    query += " AND user_id != ?";
    params.push(excludeUserId);
  }
  const [rows] = await pool.query(query, params);
  return rows[0];
};

export const updateUserProfile = async (userId, nickname, bio, hashedPassword, profileImg) => {
  const [result] = await pool.query(
    "UPDATE users SET nickname = ?, bio = ?, password = ?, profile_img = ? WHERE user_id = ?",
    [nickname, bio, hashedPassword, profileImg, userId]
  );
  return result.affectedRows;
};

export const searchUsers = async (query, myId) => {
  const [rows] = await pool.query(
    `SELECT user_id AS id, nickname, profile_img, COALESCE(report_count, 0) AS report_count
     FROM users
     WHERE nickname LIKE ?
     AND is_deleted = FALSE
     AND user_id != ?
     AND user_id NOT IN (
       SELECT target_id FROM user_relations
       WHERE requester_id = ? AND status = 'blocked'
     )
     AND user_id NOT IN (
       SELECT requester_id FROM user_relations
       WHERE target_id = ? AND status = 'blocked'
     )
     LIMIT 10`,
    [`%${query}%`, myId, myId, myId]
  );
  return rows;
};

export const deleteUserById = async (userId, connection) => {
  const [result] = await connection.query(
    "DELETE FROM users WHERE user_id = ?",
    [userId]
  );
  return result.affectedRows;
};

export const findUserNicknameById = async (userId, connection) => {
  const [[user]] = await connection.query(
    "SELECT nickname FROM users WHERE user_id = ?",
    [userId]
  );
  return user ? user.nickname : null;
};

export const getPostsUserIdExistence = async (connection) => {
  try {
    await connection.query("SELECT user_id FROM posts LIMIT 0");
    return true;
  } catch {
    return false;
  }
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

export const deletePostsByAuthor = async (userId, connection) => {
  await connection.query("DELETE FROM posts WHERE user_id = ?", [userId]);
};

export const getPostCapacity = async (postId, connection) => {
  const [[postRow]] = await connection.query(
    "SELECT capacity FROM posts WHERE post_id = ?",
    [postId]
  );
  return postRow;
};

export const countPostParticipants = async (postId, connection) => {
  const [[participantCount]] = await connection.query(
    "SELECT COUNT(*) AS count FROM post_participants WHERE post_id = ?",
    [postId]
  );
  return participantCount.count;
};

export const updatePostParticipantsAndStatus = async (postId, currentParticipants, status, connection) => {
  await connection.query(
    "UPDATE posts SET participants = ?, status = ? WHERE post_id = ?",
    [currentParticipants, status, postId]
  );
};
