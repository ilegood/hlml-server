import * as repo from "../repositories/postRepository.js";

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

const normalizeFloatOrNull = (value) => {
  if (value === undefined || value === null || value === "") return null;

  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const normalizePostData = (body) => ({
  ...body,
  date: normalizeDate(body.date),
  time: normalizeTime(body.time),
  capacity: normalizeCapacity(body.capacity),
  latitude: normalizeFloatOrNull(body.latitude),
  longitude: normalizeFloatOrNull(body.longitude),
  categories: normalizeCategories(body.categories),
});

export const getPosts = () => repo.getPosts();
export const getPost = (id) => repo.getPostWithDetails(id);

export const createPost = async (req) => {
  const { body, file } = req;
  const resolvedUserId = req.userId ?? body.user_id;

  if (!resolvedUserId) {
    const error = new Error("missing user id");
    error.status = 400;
    throw error;
  }

  const image = file ? file.path : null;

  return repo.createPost({
    ...normalizePostData(body),
    user_id: resolvedUserId,
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

  return repo.updatePost(params.id, req.userId, {
    ...normalizePostData(body),
    image,
  });
};

export const deletePost = (id, userId) => repo.deletePost(id, userId);

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

export const getKickedPosts = (userId) => repo.getKickedPostsForUser(userId);

export const deletePostBan = (userId, postId) => repo.deletePostBan(userId, postId);
