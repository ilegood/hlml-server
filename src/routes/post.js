import express from "express";
import { upload } from "../middleware/cloudinary.js";

import * as postController from "../controllers/postController.js";
import auth from "../middleware/auth.js";

const router = express.Router();

// routes
router.get("/", postController.getPosts);
router.get("/kicked", auth, postController.getKickedPosts);
router.get("/:id", postController.getPost);

router.post("/", auth, upload.single("image"), postController.createPost);
router.patch("/:id", auth, upload.single("image"), postController.updatePost);
router.delete("/:id", auth, postController.deletePost);

// like / join
router.post("/:id/like", auth, postController.likePost);
router.post("/:id/join", auth, postController.joinPost);
router.post("/:id/leave", auth, postController.leavePost);

// banned/kicked posts
router.delete("/:id/ban", auth, postController.deletePostBan);

// comments
router.get("/:id/comments", postController.getComments);
router.post("/:id/comments", auth, postController.createComment);
router.patch("/comments/:id", auth, postController.updateComment);
router.delete("/comments/:id", auth, postController.deleteComment);

export default router;
