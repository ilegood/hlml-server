import * as postService from "../services/postService.js";

export const getPosts = async (req, res) => {
  try {
    const data = await postService.getPosts();
    res.json(data);
  } catch (e) {
    res.status(500).json({ message: "server error" });
  }
};

export const getPost = async (req, res) => {
  try {
    const data = await postService.getPost(req.params.id);
    if (!data) {
      return res.status(404).json({ message: "not found" });
    }
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "error" });
  }
};

export const createPost = async (req, res) => {
  try {
    const result = await postService.createPost(req);
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "create error" });
  }
};

export const updatePost = async (req, res) => {
  try {
    await postService.updatePost(req);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "update error" });
  }
};

export const deletePost = async (req, res) => {
  await postService.deletePost(req.params.id);
  res.json({ success: true });
};

// like
export const likePost = async (req, res) => {
  try {
    const data = await postService.likePost(req.userId, req.params.id);
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(e.status || 500).json({ message: "like error" });
  }
};

// join
export const joinPost = async (req, res) => {
  try {
    const data = await postService.joinPost(req.userId, req.params.id);
    if (!data) {
      return res.status(404).json({ message: "not found" });
    }
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(e.status || 500).json({ message: "join error" });
  }
};

// comments
export const getComments = async (req, res) => {
  const data = await postService.getComments(req.params.id);
  res.json(data);
};

export const createComment = async (req, res) => {
  try {
    await postService.createComment(req);
    const data = await postService.getPost(req.params.id);
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "comment create error" });
  }
};

export const updateComment = async (req, res) => {
  try {
    await postService.updateComment(req);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "comment update error" });
  }
};

export const deleteComment = async (req, res) => {
  try {
    await postService.deleteComment(req.params.id, req.userId);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "comment delete error" });
  }
};
