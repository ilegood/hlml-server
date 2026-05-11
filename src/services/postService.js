import * as repo from "../repositories/postRepository.js";

const BASE_URL = "http://localhost:4000";

const normalizeCategories = (categories) => {
  if (categories === undefined || categories === null || categories === "") {
    return JSON.stringify({});
  }

  return typeof categories === "string"
    ? categories
    : JSON.stringify(categories);
};

const normalizeImagePath = (image) => {
  if (!image) return "";
  return image;
};

const normalizeDate = (date) => {
  if (!date) return null;
  return String(date).slice(0, 10);
};

const normalizeTime = (time) => {
  if (!time) return null;
  return String(time).slice(0, 8);
};

const normalizeCapacity = (capacity) => {
  const parsed = Number.parseInt(capacity, 10);
  return Number.isNaN(parsed) ? 2 : parsed;
};

const normalizePostData = (body) => ({
  ...body,
  date: normalizeDate(body.date),
  time: normalizeTime(body.time),
  capacity: normalizeCapacity(body.capacity),
  categories: normalizeCategories(body.categories),
});

export const getPosts = () => repo.getPosts();
export const getPost = (id) => repo.getPostWithDetails(id);

export const createPost = async (req) => {
  const { body, file } = req;

  const image = file ? file.path : null;

  return repo.createPost({
    ...normalizePostData(body),
    image,
  });
};

export const updatePost = async (req) => {
  const { body, file, params } = req;

  const image = file
    ? file.path
    : body.existingImage !== undefined
      ? normalizeImagePath(body.existingImage)
      : null;

  return repo.updatePost(params.id, {
    ...normalizePostData(body),
    image,
  });
};

export const deletePost = (id) => repo.deletePost(id);

export const likePost = (userId, postId) => repo.toggleLikePost(userId, postId);

export const joinPost = (userId, postId) => repo.toggleJoinPost(userId, postId);

export const leavePost = (userId, postId) => repo.leavePost(userId, postId);

export const getComments = (postId) => repo.getComments(postId);

export const createComment = (req) => {
  return repo.createComment({
    postId: req.params.id,
    userId: req.userId,
    content: req.body.content,
    parent_id: req.body.parent_id,
  });
};

export const updateComment = (req) => {
  return repo.updateComment(req.params.id, req.userId, req.body.content);
};

export const deleteComment = (id, userId) => repo.deleteComment(id, userId);
