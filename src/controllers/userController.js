import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import pool from "../db.js";
import asyncHandler from "../utils/asyncHandler.js";

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

export const registerUser = asyncHandler(async (req, res) => {
  const { nickname, email, password, birthday, gender, phone_number } = req.body;

  const existingUser = await findUserByEmail(email);
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
  await createUser(
    nickname,
    email,
    hashedPassword,
    birthday,
    processedGender,
    phone_number,
  );

  res.status(201).json({ message: "회원가입이 완료되었습니다." });
});

export const loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await findUserByEmail(email);
  if (!user) {
    return res.status(401).json({ message: "이메일 또는 비밀번호가 잘못되었습니다." });
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    return res.status(401).json({ message: "이메일 또는 비밀번호가 잘못되었습니다." });
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
});

export const getProfile = asyncHandler(async (req, res) => {
  const user = await findUserById(req.userId);
  if (!user) {
    return res.status(404).json({ message: "사용자를 찾을 수 없습니다." });
  }
  res.json(user);
});

export const getUserPublicProfile = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const user = await findUserById(id);
  if (!user) {
    return res.status(404).json({ message: "사용자를 찾을 수 없습니다." });
  }
  res.json({
    user_id: user.user_id,
    nickname: user.nickname,
    bio: user.bio,
    profile_img: user.profile_img,
  });
});

export const updateProfile = asyncHandler(async (req, res) => {
  const { nickname, bio, currentPassword, newPassword } = req.body;
  const userId = req.userId;
  const profileImgPath = req.file ? req.file.path : null;

  const user = await findUserByIdWithPassword(userId);
  if (!user) {
    return res.status(404).json({ message: "사용자를 찾을 수 없습니다." });
  }

  if (nickname && nickname !== user.nickname) {
    const duplicateNickname = await findUserByNickname(nickname, userId);
    if (duplicateNickname) {
      return res.status(400).json({ message: "이미 사용 중인 닉네임입니다." });
    }
  }

  let hashedPassword = user.password;
  if (currentPassword && newPassword) {
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "현재 비밀번호가 일치하지 않습니다." });
    }
    hashedPassword = await bcrypt.hash(newPassword, 10);
  }

  const finalNickname = nickname || user.nickname;
  const finalBio = bio !== undefined ? bio : user.bio;
  const finalProfileImg = profileImgPath || user.profile_img;

  await updateUserProfile(userId, finalNickname, finalBio, hashedPassword, finalProfileImg);

  res.json({
    message: "프로필이 업데이트되었습니다.",
    nickname: finalNickname,
    bio: finalBio,
    profile_img: finalProfileImg,
  });
});

export const searchUsersController = asyncHandler(async (req, res) => {
  const { q } = req.query;
  const myId = req.userId;
  if (!q) return res.json([]);

  const users = await searchUsers(q, myId);
  res.json(users);
});

export const deleteUserController = asyncHandler(async (req, res) => {
  const connection = await pool.getConnection();
  await connection.beginTransaction();

  try {
    const userId = req.userId;
    const currentUser = await findUserById(userId);

    if (!currentUser) {
      await connection.rollback();
      return res.status(404).json({ message: "사용자를 찾을 수 없습니다." });
    }

    const joinedPosts = await getJoinedPostsForUser(userId, connection);
    const affectedRows = await deleteUserById(userId, connection);

    if (affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ message: "사용자를 찾을 수 없습니다." });
    }

    for (const post of joinedPosts) {
      const postId = post.post_id;
      const postRow = await getPostCapacity(postId, connection);
      if (!postRow) continue;

      const count = await countPostParticipants(postId, connection);
      const currentParticipants = 1 + count;
      const status =
        currentParticipants >= postRow.capacity
          ? "모집완료"
          : "모집중";

      await updatePostParticipantsAndStatus(
        postId,
        currentParticipants,
        status,
        connection,
      );
    }

    await connection.commit();
    res.json({ message: "사용자 계정이 삭제되었습니다." });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});
