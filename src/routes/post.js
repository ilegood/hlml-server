import express from "express";
import jwt from "jsonwebtoken";
import { upload } from "../middleware/cloudinary.js";

import * as postController from "../controllers/postController.js";
import auth from "../middleware/auth.js";
import { env } from "../config/env.js";

const router = express.Router();

const optionalAuth = (req, _res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return next();

  try {
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : authHeader.trim();
    if (token) {
      const decoded = jwt.verify(token, env.jwtSecret);
      req.userId = decoded.userId ?? decoded.user_id ?? decoded.sub;
    }
  } catch {
    req.userId = null;
  }
  next();
};

// routes
router.get("/", optionalAuth, postController.getPosts);
router.get("/my-rooms", auth, postController.getMyChatRooms);
router.get("/kicked", auth, postController.getKickedPosts);
router.get("/:id", optionalAuth, postController.getPost);

router.post("/", auth, upload.single("image"), postController.createPost);
router.patch("/:id", auth, upload.single("image"), postController.updatePost);
router.delete("/:id", auth, postController.deletePost);
router.post("/:id/hide", auth, postController.hidePost);

// like / join
router.post("/:id/like", auth, postController.likePost);
router.post("/:id/join", auth, postController.joinPost);
router.post("/:id/leave", auth, postController.leavePost);

// banned/kicked posts
router.delete("/:id/ban", auth, postController.deletePostBan);

// comments
router.get("/:id/comments", optionalAuth, postController.getComments);
router.post("/:id/comments", auth, postController.createComment);
router.patch("/comments/:id", auth, postController.updateComment);
router.delete("/comments/:id", auth, postController.deleteComment);

export default router;
