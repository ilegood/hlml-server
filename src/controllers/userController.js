import bcrypt from "bcrypt";
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
} from "../repositories/userRepository.js";
import {
  getJoinedPostsForUser,
  getPostCapacity,
  countPostParticipants,
  updatePostParticipantsAndStatus,
} from "../repositories/postRepository.js";

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

export const registerUser = async (req, res) => {
  const { nickname, email, password, birthday, gender, phone_number } = req.body;

  try {
    const existingUser = await findUserByEmail(email);
    if (existingUser) {
      return res.status(409).json({ message: "Email already in use" });
    }

    let processedGender = gender;
    if (gender === "남") {
      processedGender = "male";
    } else if (gender === "여") {
      processedGender = "female";
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await createUser(
      nickname,
      email,
      hashedPassword,
      birthday,
      processedGender,
      phone_number,
    );

    res.status(201).json({ message: "Registered" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error", error: error.message });
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

    if (nickname && nickname !== user.nickname) {
      const duplicateNickname = await findUserByNickname(nickname, userId);
      if (duplicateNickname) {
        return res.status(400).json({ message: "Nickname already in use" });
      }
    }

    let hashedPassword = user.password;
    if (currentPassword && newPassword) {
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) {
        return res.status(400).json({ message: "Current password mismatch" });
      }
      hashedPassword = await bcrypt.hash(newPassword, 10);
    }

    const finalNickname = nickname || user.nickname;
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
