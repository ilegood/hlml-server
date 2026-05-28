import pool from "../db.js";

export const findUserByEmail = async (email) => {
  const [rows] = await pool.query(
    "SELECT user_id, nickname, email, password, bio, profile_img, is_verified FROM users WHERE email = ? AND is_deleted = FALSE",
    [email],
  );
  return rows[0];
};

export const createUser = async (nickname, email, hashedPassword, birthday, gender, phoneNumber, isVerified = false) => {
  const [result] = await pool.query(
    `INSERT INTO users (nickname, email, password, birthday, gender, phone_number, is_verified)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [nickname, email, hashedPassword, birthday, gender, phoneNumber, isVerified]
  );
  return result;
};

export const findUserById = async (userId) => {
  const [rows] = await pool.query("SELECT user_id, nickname, email, bio, profile_img, is_verified FROM users WHERE user_id = ? AND is_deleted = FALSE", [userId]);
  return rows[0];
};

export const findUserByIdWithPassword = async (userId) => {
  const [rows] = await pool.query("SELECT user_id, nickname, email, bio, profile_img, password, is_verified FROM users WHERE user_id = ? AND is_deleted = FALSE", [userId]);
  return rows[0];
};

export const findUserByNickname = async (nickname, excludeUserId = null) => {
  const params = [nickname];
  let query = "SELECT user_id FROM users WHERE nickname = ? AND is_deleted = FALSE";
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

export const createVerificationToken = async (userId, tokenHash, expiresAt) => {
  await pool.query(
    "INSERT INTO email_verification_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)",
    [userId, tokenHash, expiresAt]
  );
};

export const findVerificationTokenByHash = async (tokenHash) => {
  const [rows] = await pool.query(
    `SELECT evt.user_id, u.email
     FROM email_verification_tokens evt
     JOIN users u ON evt.user_id = u.user_id
     WHERE evt.token_hash = ? AND evt.expires_at > NOW()`,
    [tokenHash]
  );
  return rows[0];
};

export const verifyUser = async (userId) => {
  await pool.query(
    "UPDATE users SET is_verified = TRUE WHERE user_id = ?",
    [userId]
  );
};

export const deleteVerificationToken = async (tokenHash) => {
  await pool.query(
    "DELETE FROM email_verification_tokens WHERE token_hash = ?",
    [tokenHash]
  );
};

export const searchUsers = async (query, myId) => {
  const [rows] = await pool.query(
    `SELECT user_id AS id, nickname, profile_img, COALESCE(report_count, 0) AS report_count
     FROM users
     WHERE nickname LIKE ?
     AND is_deleted = FALSE
     AND user_id != ?
     LIMIT 10`,
    [`%${query}%`, myId]
  );
  return rows;
};

export const findUserStats = async (userId) => {
  const [[rows]] = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM posts WHERE user_id = ? AND is_deleted = FALSE) AS posts,
       (SELECT COUNT(*) FROM post_participants WHERE user_id = ?) AS appointments,
       COALESCE((SELECT report_count FROM users WHERE user_id = ?), 0) AS reports`,
    [userId, userId, userId]
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
