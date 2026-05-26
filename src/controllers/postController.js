import * as postService from "../services/postService.js";
import asyncHandler from "../utils/asyncHandler.js";

export const getPosts = asyncHandler(async (req, res) => {
  const data = await postService.getPosts(req.userId);
  res.json(data);
});

export const getPost = asyncHandler(async (req, res) => {
  const data = await postService.getPost(req.params.id, req.userId);
  if (!data) return res.status(404).json({ message: "not found" });
  res.json(data);
});

export const createPost = asyncHandler(async (req, res) => {
  const result = await postService.createPost(req);
  res.json(result);
});

export const updatePost = asyncHandler(async (req, res) => {
  const affectedRows = await postService.updatePost(req);
  if (!affectedRows) return res.status(403).json({ message: "forbidden" });
  res.json({ success: true });
});

export const deletePost = asyncHandler(async (req, res) => {
  const affectedRows = await postService.deletePost(
    req.params.id,
    req.userId,
  );
  if (!affectedRows) return res.status(403).json({ message: "forbidden" });
  res.json({ success: true });
});

export const likePost = asyncHandler(async (req, res) => {
  const data = await postService.likePost(req.userId, req.params.id);
  res.json(data);
});

export const joinPost = asyncHandler(async (req, res) => {
  const data = await postService.joinPost(req.userId, req.params.id);
  if (!data) return res.status(404).json({ message: "not found" });
  res.json(data);
});

export const leavePost = asyncHandler(async (req, res) => {
  const data = await postService.leavePost(req.userId, req.params.id);
  if (!data) return res.status(404).json({ message: "not found" });
  res.json(data);
});

export const getComments = asyncHandler(async (req, res) => {
  const data = await postService.getComments(req.params.id, req.userId);
  res.json(data);
});

export const createComment = asyncHandler(async (req, res) => {
  await postService.createComment(req);
  const data = await postService.getPost(req.params.id, req.userId);
  res.json(data);
});

export const updateComment = asyncHandler(async (req, res) => {
  await postService.updateComment(req);
  res.json({ success: true });
});

export const deleteComment = asyncHandler(async (req, res) => {
  await postService.deleteComment(req.params.id, req.userId);
  res.json({ success: true });
});

export const getKickedPosts = asyncHandler(async (req, res) => {
  const data = await postService.getKickedPosts(req.userId);
  res.json(data);
});

export const deletePostBan = asyncHandler(async (req, res) => {
  await postService.deletePostBan(req.userId, req.params.id);
  res.json({ success: true });
});
