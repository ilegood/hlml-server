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
} from "../repositories/userRepository.js";
import {
  getJoinedPostsForUser,
  getPostCapacity,
  countPostParticipants,
  updatePostParticipantsAndStatus,
} from "../repositories/postRepository.js";

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
