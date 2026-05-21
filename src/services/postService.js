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

const todayString = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const nextYearTodayString = () => {
  const date = new Date();
  date.setFullYear(date.getFullYear() + 1);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const assertValidAppointmentDate = (date) => {
  if (!date) return;

  if (date < todayString()) {
    const error = new Error("오늘 이전 날짜는 선택할 수 없습니다.");
    error.status = 400;
    throw error;
  }

  if (date > nextYearTodayString()) {
    const error = new Error("약속 날짜는 최대 내년 오늘까지 선택할 수 있습니다.");
    error.status = 400;
    throw error;
  }
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

const normalizeStatus = (status) => {
  return String(status || "").trim() === "\ubaa8\uc9d1\uc644\ub8cc"
    ? "\ubaa8\uc9d1\uc644\ub8cc"
    : "\ubaa8\uc9d1\uc911";
};

const normalizePostData = (body) => {
  const date = normalizeDate(body.date);
  assertValidAppointmentDate(date);

  return {
    ...body,
    date,
    time: normalizeTime(body.time),
    capacity: normalizeCapacity(body.capacity),
    latitude: normalizeFloatOrNull(body.latitude),
    longitude: normalizeFloatOrNull(body.longitude),
    categories: normalizeCategories(body.categories),
    status: normalizeStatus(body.status),
  };
};

export const getPosts = (viewerId) => repo.getPosts(viewerId);
export const getMyChatRooms = (userId) => repo.getMyChatRooms(userId);
export const getPost = (id, viewerId) => repo.getPostWithDetails(id, viewerId);

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

export const getComments = (postId, viewerId) =>
  repo.getComments(postId, viewerId);

export const createComment = (req) => {
  const { body, file, params } = req;
  const image = file ? file.path : null;

  return repo.createComment({
    postId: params.id,
    userId: req.userId,
    content: body.content,
    parent_id: body.parent_id,
    image,
  });
};

export const updateComment = (req) => {
  return repo.updateComment(req.params.id, req.userId, req.body.content);
};

export const deleteComment = (id, userId) => repo.deleteComment(id, userId);

export const getKickedPosts = (userId) => repo.getKickedPostsForUser(userId);

export const deletePostBan = (userId, postId) => repo.deletePostBan(userId, postId);
