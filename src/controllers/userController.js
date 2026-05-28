import bcrypt from "bcrypt";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import pool from "../db.js";

import { env } from "../config/env.js";
import {
  findUserByEmail,
  createUser,
  findUserById,
  findUserByIdWithPassword,
  findUserByNickname,
  updateUserProfile,
  searchUsers,
  deleteUserById,
  findUserStats,
  createVerificationToken,
  findVerificationTokenByHash,
  verifyUser as verifyUserInDb, // Renamed to avoid conflict with controller function
  deleteVerificationToken,
} from "../repositories/userRepository.js";
import {
  getJoinedPostsForUser,
  getPostCapacity,
  countPostParticipants,
  updatePostParticipantsAndStatus,
} from "../repositories/postRepository.js";
import { sendPasswordResetEmail, sendVerificationEmail } from "../utils/mail.js";

const getSeoulDateTimeString = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second}`;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const NICKNAME_PATTERN = /^[0-9A-Za-z가-힣]{2,12}$/;
const PHONE_NUMBER_PATTERN = /^\d{3}-\d{4}-\d{4}$/;
const BANNED_NICKNAME_WORDS = [
  "시발",
  "씨발",
  "씨팔",
  "ㅅㅂ",
  "병신",
  "븅신",
  "ㅂㅅ",
  "개새",
  "새끼",
  "지랄",
  "좆",
  "존나",
  "엿먹",
  "꺼져",
  "미친놈",
  "미친년",
  "fuck",
  "shit",
  "bitch",
  "asshole",
];

const normalizeNicknameForFilter = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^0-9a-z가-힣ㄱ-ㅎㅏ-ㅣ]/g, "");

const getNicknameValidationMessage = (nickname) => {
  const value = String(nickname || "").trim();
  if (!value) return "닉네임을 입력해주세요.";
  if (!NICKNAME_PATTERN.test(value)) {
    return "닉네임은 2~12자의 한글, 영문, 숫자만 사용할 수 있습니다.";
  }

  const normalized = normalizeNicknameForFilter(value);
  if (BANNED_NICKNAME_WORDS.some((word) => normalized.includes(word))) {
    return "사용할 수 없는 닉네임입니다.";
  }

  return "";
};

const getPasswordIssues = (password, { nickname = "", email = "" } = {}) => {
  const value = String(password || "");
  const lowered = value.toLowerCase();
  const emailName = String(email || "").split("@")[0]?.toLowerCase() || "";
  const nicknameValue = String(nickname || "").toLowerCase();
  const issues = [];

  if (value.length < 8) issues.push("8자 이상");
  if (!/[A-Za-z]/.test(value)) issues.push("영문 포함");
  if (!/[0-9]/.test(value)) issues.push("숫자 포함");
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(value)) {
    issues.push("특수문자 포함");
  }
  if (/\s/.test(value)) issues.push("공백 제외");
  if (emailName && lowered.includes(emailName)) {
    issues.push("이메일과 다르게 설정");
  }
  if (nicknameValue && lowered.includes(nicknameValue)) {
    issues.push("닉네임과 다르게 설정");
  }

  return issues;
};

const getPasswordValidationMessage = (password, context) => {
  if (!password) return "비밀번호를 입력해주세요.";
  const issues = getPasswordIssues(password, context);
  return issues.length
    ? `비밀번호 조건을 확인해주세요: ${issues.join(", ")}`
    : "";
};

const validatePhoneNumber = (phoneNumber) => {
  const value = String(phoneNumber || "").trim();
  if (!value) return "휴대전화 번호를 입력해주세요.";
  if (!PHONE_NUMBER_PATTERN.test(value)) {
    return "'000-0000-0000' 형식으로 입력해주세요.";
  }
  return "";
};

const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

const createPasswordResetUrl = (token) =>
  `${env.clientBaseUrl.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(token)}`;

const createVerificationUrl = (token) =>
  `${env.clientBaseUrl.replace(/\/$/, "")}/verify-email?token=${encodeURIComponent(token)}`;

const syncCompletedAppointments = async (connection, userId) => {
  await connection.query(
    `INSERT IGNORE INTO appointment_completions (user_id, post_id, completed_at)
     SELECT ?, p.post_id, TIMESTAMP(p.date, p.time)
     FROM posts p
     LEFT JOIN post_participants pp
       ON pp.post_id = p.post_id AND pp.user_id = ?
     WHERE (p.user_id = ? OR pp.user_id = ?)
       AND p.date IS NOT NULL
       AND p.time IS NOT NULL
       AND TIMESTAMP(p.date, p.time) <= ?`,
    [userId, userId, userId, userId, getSeoulDateTimeString()],
  );
};

const deleteByIds = async (connection, sql, ids) => {
  if (!ids.length) return;
  await connection.query(sql, [ids]);
};

const purgeUserRecords = async (connection, userId) => {
  const [authoredPosts] = await connection.query(
    "SELECT post_id FROM posts WHERE user_id = ?",
    [userId],
  );
  const [dmRooms] = await connection.query(
    "SELECT id FROM dm_rooms WHERE user1_id = ? OR user2_id = ?",
    [userId, userId],
  );

  const roomKeysToDelete = [
    ...authoredPosts.map((post) => String(post.post_id)),
    ...dmRooms.map((room) => `dm_${room.id}`),
  ];

  await deleteByIds(
    connection,
    `DELETE mr FROM message_reactions mr
     JOIN messages m ON mr.message_id = m.id
     WHERE m.room_id IN (?)`,
    roomKeysToDelete,
  );
  await deleteByIds(
    connection,
    `DELETE mrd FROM message_reads mrd
     JOIN messages m ON mrd.message_id = m.id
     WHERE m.room_id IN (?)`,
    roomKeysToDelete,
  );
  await deleteByIds(
    connection,
    "DELETE FROM messages WHERE room_id IN (?)",
    roomKeysToDelete,
  );

  await connection.query(
    `DELETE mr FROM message_reactions mr
     JOIN messages m ON mr.message_id = m.id
     WHERE m.user_id = ? OR mr.user_id = ?`,
    [userId, userId],
  );
  await connection.query(
    `DELETE mrd FROM message_reads mrd
     JOIN messages m ON mrd.message_id = m.id
     WHERE m.user_id = ? OR mrd.user_id = ?`,
    [userId, userId],
  );
  await connection.query("DELETE FROM messages WHERE user_id = ?", [userId]);
  await connection.query(
    "DELETE FROM dm_rooms WHERE user1_id = ? OR user2_id = ?",
    [userId, userId],
  );

  await connection.query("DELETE FROM password_reset_tokens WHERE user_id = ?", [
    userId,
  ]);
  await connection.query("DELETE FROM appointment_completions WHERE user_id = ?", [
    userId,
  ]);
  await connection.query(
    "DELETE FROM reports WHERE reporter_id = ? OR target_id = ?",
    [userId, userId],
  );
  await connection.query("DELETE FROM post_bans WHERE user_id = ?", [userId]);
  await connection.query("DELETE FROM post_likes WHERE user_id = ?", [userId]);
  await connection.query("DELETE FROM comments WHERE user_id = ?", [userId]);
  await connection.query("DELETE FROM post_participants WHERE user_id = ?", [userId]);
  await connection.query(
    "DELETE FROM user_relations WHERE requester_id = ? OR target_id = ?",
    [userId, userId],
  );
  await connection.query("DELETE FROM posts WHERE user_id = ?", [userId]);
};

export const registerUser = async (req, res) => {
  const { nickname, email, password, birthday, gender, phone_number } = req.body;
  const normalizedNickname = String(nickname || "").trim();
  const normalizedEmail = String(email || "").trim().toLowerCase();

  try {
    const nicknameValidationMessage =
      getNicknameValidationMessage(normalizedNickname);
    if (nicknameValidationMessage) {
      return res.status(400).json({ message: nicknameValidationMessage });
    }

    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      return res.status(400).json({ message: "올바른 이메일 주소를 입력해주세요." });
    }

    const passwordValidationMessage = getPasswordValidationMessage(password, {
      nickname: normalizedNickname,
      email: normalizedEmail,
    });
    if (passwordValidationMessage) {
      return res.status(400).json({ message: passwordValidationMessage });
    }

    const phoneNumberValidationMessage = validatePhoneNumber(phone_number);
    if (phoneNumberValidationMessage) {
      return res.status(400).json({ message: phoneNumberValidationMessage });
    }

    const existingNickname = await findUserByNickname(normalizedNickname);
    if (existingNickname) {
      return res.status(409).json({ message: "이미 사용 중인 닉네임입니다." });
    }

    const existingUser = await findUserByEmail(normalizedEmail);
    if (existingUser) {
      return res.status(409).json({ message: "이미 사용 중인 이메일입니다." });
    }

    let processedGender = gender;
    if (gender === "남") {
      processedGender = "male";
    } else if (gender === "여") {
      processedGender = "female";
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await createUser(
      normalizedNickname,
      normalizedEmail,
      hashedPassword,
      birthday,
      processedGender,
      phone_number,
      false // is_verified is false by default
    );
    const userId = result.insertId;

    const verificationToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(verificationToken);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await createVerificationToken(userId, tokenHash, expiresAt);

    const verificationUrl = createVerificationUrl(verificationToken);
    await sendVerificationEmail({ to: normalizedEmail, verificationUrl });

    res.status(201).json({ message: "회원가입이 완료되었습니다. 이메일을 확인하여 계정을 인증해주세요." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
};

export const checkRegistrationAvailability = async (req, res) => {
  const nickname = String(req.query.nickname || "").trim();
  const email = String(req.query.email || "").trim().toLowerCase();

  try {
    const result = {};

    if (nickname) {
      const nicknameValidationMessage = getNicknameValidationMessage(nickname);
      if (nicknameValidationMessage) {
        result.nickname = {
          available: false,
          message: nicknameValidationMessage,
        };
      } else {
        const existingNickname = await findUserByNickname(nickname);
        result.nickname = existingNickname
          ? { available: false, message: "이미 사용 중인 닉네임입니다." }
          : { available: true, message: "사용 가능한 닉네임입니다." };
      }
    }

    if (email) {
      if (!EMAIL_PATTERN.test(email)) {
        result.email = {
          available: false,
          message: "올바른 이메일 주소를 입력해주세요.",
        };
      } else {
        const existingEmail = await findUserByEmail(email);
        result.email = existingEmail
          ? { available: false, message: "이미 사용 중인 이메일입니다." }
          : { available: true, message: "사용 가능한 이메일입니다." };
      }
    }

    res.json(result);
  } catch (error) {
    console.error("Registration availability check failed:", error);
    res.status(500).json({ message: "중복 확인에 실패했습니다." });
  }
};

export const loginUser = async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await findUserByEmail(email);
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }



    const token = jwt.sign(
      { userId: user.user_id, email: user.email },
      env.jwtSecret,
      { expiresIn: "7d" },
    );

    res.json({
      token,
      user_id: user.user_id,
      nickname: user.nickname,
      email: user.email,
      bio: user.bio,
      profile_img: user.profile_img,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const requestPasswordReset = async (req, res) => {
  const normalizedEmail = String(req.body.email || "").trim().toLowerCase();
  const response = {
    message: "가입된 이메일이라면 비밀번호 재설정 링크를 보냈습니다.",
  };

  if (!EMAIL_PATTERN.test(normalizedEmail)) {
    return res.json(response);
  }

  try {
    const user = await findUserByEmail(normalizedEmail);
    if (!user) {
      return res.json(response);
    }

    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashResetToken(token);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    await pool.query(
      `UPDATE password_reset_tokens
       SET used_at = NOW()
       WHERE user_id = ? AND used_at IS NULL`,
      [user.user_id],
    );

    await pool.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES (?, ?, ?)`,
      [user.user_id, tokenHash, expiresAt],
    );

    await sendPasswordResetEmail({
      to: user.email,
      resetUrl: createPasswordResetUrl(token),
    });

    res.json(response);
  } catch (error) {
    console.error("Password reset request failed:", error);
    res.status(500).json({ message: "비밀번호 재설정 요청에 실패했습니다." });
  }
};

export const resetPassword = async (req, res) => {
  const token = String(req.body.token || "").trim();
  const password = String(req.body.password || "");

  if (!token) {
    return res.status(400).json({ message: "재설정 링크가 올바르지 않습니다." });
  }

  const connection = await pool.getConnection();

  try {
    const tokenHash = hashResetToken(token);
    const [rows] = await connection.query(
      `SELECT
         prt.id,
         prt.user_id,
         u.email,
         u.nickname
       FROM password_reset_tokens prt
       JOIN users u ON u.user_id = prt.user_id
       WHERE prt.token_hash = ?
         AND prt.used_at IS NULL
         AND prt.expires_at > NOW()
       LIMIT 1`,
      [tokenHash],
    );

    const resetToken = rows[0];
    if (!resetToken) {
      return res.status(400).json({ message: "재설정 링크가 만료되었거나 올바르지 않습니다." });
    }

    const passwordValidationMessage = getPasswordValidationMessage(password, {
      nickname: resetToken.nickname,
      email: resetToken.email,
    });
    if (passwordValidationMessage) {
      return res.status(400).json({ message: passwordValidationMessage });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await connection.beginTransaction();
    await connection.query("UPDATE users SET password = ? WHERE user_id = ?", [
      hashedPassword,
      resetToken.user_id,
    ]);
    await connection.query(
      "UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL",
      [resetToken.user_id],
    );
    await connection.commit();

    res.json({ message: "비밀번호가 변경되었습니다." });
  } catch (error) {
    await connection.rollback();
    console.error("Password reset failed:", error);
    res.status(500).json({ message: "비밀번호 변경에 실패했습니다." });
  } finally {
    connection.release();
  }
};

export const getProfile = async (req, res) => {
  try {
    const user = await findUserById(req.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getMyStats = async (req, res) => {
  const userId = req.userId;
  const connection = await pool.getConnection();

  try {
    await syncCompletedAppointments(connection, userId);
    const [[postStats]] = await connection.query(
      "SELECT COUNT(*) AS posts FROM posts WHERE user_id = ?",
      [userId],
    );
    const [[appointmentStats]] = await connection.query(
      "SELECT COUNT(*) AS appointments FROM appointment_completions WHERE user_id = ?",
      [userId],
    );
    const [[reportStats]] = await connection.query(
      `SELECT COUNT(*) AS reports
       FROM reports
       WHERE target_id = ?
         AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`,
      [userId],
    );

    res.json({
      posts: Number(postStats.posts) || 0,
      appointments: Number(appointmentStats.appointments) || 0,
      reports: Number(reportStats.reports) || 0,
    });
  } catch (error) {
    console.error("User stats lookup failed:", error);
    res.status(500).json({ message: "user stats lookup failed" });
  } finally {
    connection.release();
  }
};

export const getUserPublicProfile = async (req, res) => {
  const { id } = req.params;
  try {
    const user = await findUserById(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    // Only return public information
    res.json({
      user_id: user.user_id,
      nickname: user.nickname,
      bio: user.bio,
      profile_img: user.profile_img,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const updateProfile = async (req, res) => {
  const { nickname, bio, currentPassword, newPassword } = req.body;
  const userId = req.userId;
  const profileImgPath = req.file ? req.file.path : null;

  try {
    const user = await findUserByIdWithPassword(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const normalizedNickname = nickname ? String(nickname).trim() : "";
    if (normalizedNickname && normalizedNickname !== user.nickname) {
      const nicknameValidationMessage =
        getNicknameValidationMessage(normalizedNickname);
      if (nicknameValidationMessage) {
        return res.status(400).json({ message: nicknameValidationMessage });
      }

      const duplicateNickname = await findUserByNickname(normalizedNickname, userId);
      if (duplicateNickname) {
        return res.status(400).json({ message: "이미 사용 중인 닉네임입니다." });
      }
    }

    const finalNickname = normalizedNickname || user.nickname;
    let hashedPassword = user.password;
    if (currentPassword && newPassword) {
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) {
        return res.status(400).json({ message: "Current password mismatch" });
      }
      const passwordValidationMessage = getPasswordValidationMessage(newPassword, {
        nickname: finalNickname,
        email: user.email,
      });
      if (passwordValidationMessage) {
        return res.status(400).json({ message: passwordValidationMessage });
      }
      hashedPassword = await bcrypt.hash(newPassword, 10);
    }

    const finalBio = bio !== undefined ? bio : user.bio;
    const finalProfileImg = profileImgPath || user.profile_img;

    await updateUserProfile(userId, finalNickname, finalBio, hashedPassword, finalProfileImg);

    res.json({
      message: "Profile updated",
      nickname: finalNickname,
      bio: finalBio,
      profile_img: finalProfileImg,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const searchUsersController = async (req, res) => {
  const { q } = req.query;
  const myId = req.userId;
  if (!q) return res.json([]);

  try {
    const users = await searchUsers(q, myId);
    res.json(users);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getUserStats = async (req, res) => {
  try {
    const stats = await findUserStats(req.userId);
    res.json(stats || { posts: 0, appointments: 0, reports: 0 });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getUserActivity = async (req, res) => {
  const targetUserId = Number(req.params.id);

  if (!Number.isFinite(targetUserId)) {
    return res.status(400).json({ message: "Invalid user id" });
  }

  try {
    const [userRows] = await pool.query(
      "SELECT user_id, nickname, bio, profile_img FROM users WHERE user_id = ? AND is_deleted = FALSE",
      [targetUserId],
    );

    const user = userRows[0];
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const [[postStats]] = await pool.query(
      "SELECT COUNT(*) AS posts FROM posts WHERE user_id = ? AND is_deleted = 0",
      [targetUserId],
    );

    const [[appointmentStats]] = await pool.query(
      "SELECT COUNT(*) AS appointments FROM appointment_completions WHERE user_id = ?",
      [targetUserId],
    );

    const [[reportStats]] = await pool.query(
      `SELECT COUNT(*) AS reports
       FROM reports
       WHERE target_id = ?
         AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`,
      [targetUserId],
    );

    const [postRows] = await pool.query(
      `SELECT
         p.post_id,
         p.title,
         p.content,
         p.date,
         p.time,
         p.place,
         p.capacity,
         p.participants,
         p.status,
         p.image,
         p.created_at,
         p.categories
       FROM posts p
       WHERE p.user_id = ? AND p.is_deleted = 0
       ORDER BY p.created_at DESC
       LIMIT 20`,
      [targetUserId],
    );

    const [appointmentRows] = await pool.query(
      `SELECT
         ac.id,
         ac.post_id,
         ac.completed_at,
         p.title,
         p.date,
         p.time,
         p.place,
         p.image,
         p.status
       FROM appointment_completions ac
       JOIN posts p ON p.post_id = ac.post_id
       WHERE ac.user_id = ?
       ORDER BY ac.completed_at DESC
       LIMIT 20`,
      [targetUserId],
    );

    const [reportRows] = await pool.query(
      `SELECT
         r.id,
         r.report_type,
         r.target_post_id,
         r.target_comment_id,
         r.target_title,
         r.target_excerpt,
         r.reason,
         r.content,
         r.status,
         r.created_at,
         u.nickname AS reporter_nickname,
         u.profile_img AS reporter_profile_img
       FROM reports r
       JOIN users u ON u.user_id = r.reporter_id
       WHERE r.target_id = ?
         AND r.created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
       ORDER BY r.created_at DESC
       LIMIT 20`,
      [targetUserId],
    );

    res.json({
      profile: user,
      stats: {
        posts: Number(postStats.posts) || 0,
        appointments: Number(appointmentStats.appointments) || 0,
        reports: Number(reportStats.reports) || 0,
      },
      posts: postRows,
      appointments: appointmentRows,
      reports: reportRows,
    });
  } catch (error) {
    console.error("User activity lookup failed:", error);
    res.status(500).json({ message: "user activity lookup failed" });
  }
};

export const deleteUserController = async (req, res) => {
  const connection = await pool.getConnection();
  await connection.beginTransaction();

  try {
    const userId = req.userId;
    const currentUser = await findUserById(userId);

    if (!currentUser) {
      await connection.rollback();
      return res.status(404).json({ message: "User not found" });
    }

    const joinedPosts = await getJoinedPostsForUser(userId, connection);

    await purgeUserRecords(connection, userId);

    const affectedRows = await deleteUserById(userId, connection);

    if (affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ message: "User not found" });
    }

    // Authored posts are deleted by CASCADE in DB, but if not, we handle it here.
    // Given schema.sql has ON DELETE CASCADE, this might be redundant but safe.

    for (const post of joinedPosts) {
      const postId = post.post_id;
      const postRow = await getPostCapacity(postId, connection);
      if (!postRow) continue;

      const count = await countPostParticipants(postId, connection);
      const currentParticipants = 1 + count;
      const status =
        currentParticipants >= postRow.capacity
          ? "\ubaa8\uc9d1\uc644\ub8cc"
          : "\ubaa8\uc9d1\uc911";

      await updatePostParticipantsAndStatus(
        postId,
        currentParticipants,
        status,
        connection,
      );
    }

    await connection.commit();
    res.json({ message: "User deleted" });
  } catch (error) {
    await connection.rollback();
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  } finally {
    connection.release();
  }
};

export const verifyEmail = async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ message: "Verification token is missing." });
  }

  try {
    const tokenHash = hashToken(token);
    const verificationRecord = await findVerificationTokenByHash(tokenHash);

    if (!verificationRecord) {
      return res.status(400).json({ message: "Invalid or expired verification link." });
    }

    await verifyUserInDb(verificationRecord.user_id);
    await deleteVerificationToken(tokenHash);

    res.json({ message: "이메일이 성공적으로 인증되었습니다." });
  } catch (error) {
    console.error("Email verification failed:", error);
    res.status(500).json({ message: "이메일 인증에 실패했습니다." });
  }
};

export const resendVerificationEmail = async (req, res) => {
  const { email } = req.body;
  const normalizedEmail = String(email || "").trim().toLowerCase();

  if (!EMAIL_PATTERN.test(normalizedEmail)) {
    return res.status(400).json({ message: "유효하지 않은 이메일 주소입니다." });
  }

  try {
    const user = await findUserByEmail(normalizedEmail);

    if (!user) {
      return res.status(404).json({ message: "해당 이메일로 등록된 사용자를 찾을 수 없습니다." });
    }
    if (user.is_verified) {
      return res.status(400).json({ message: "이메일이 이미 인증되었습니다." });
    }

    // Invalidate any existing tokens for this user
    await pool.query(
      "DELETE FROM email_verification_tokens WHERE user_id = ?",
      [user.user_id],
    );

    const verificationToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(verificationToken);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await createVerificationToken(user.user_id, tokenHash, expiresAt);

    const verificationUrl = createVerificationUrl(verificationToken);
    await sendVerificationEmail({ to: normalizedEmail, verificationUrl });

    res.json({ message: "인증 이메일을 다시 보냈습니다. 받은 편지함을 확인해주세요." });
  } catch (error) {
    console.error("Resend verification email failed:", error);
    res.status(500).json({ message: "인증 이메일 재전송에 실패했습니다." });
  }
};
