import express from "express";
import multer from "multer";
import path from "path";

import * as postController from "../controllers/postController.js";
import auth from "../middleware/auth.js";

const router = express.Router();

// multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "src/uploads/"),
  filename: (req, file, cb) =>
    cb(null, Date.now() + path.extname(file.originalname)),
});

const upload = multer({ storage });

// routes
router.get("/", postController.getPosts);
router.get("/:id", postController.getPost);

router.post("/", auth, upload.single("image"), postController.createPost);
router.patch("/:id", auth, upload.single("image"), postController.updatePost);
router.delete("/:id", auth, postController.deletePost);

// like / join
router.post("/:id/like", auth, postController.likePost);
router.post("/:id/join", auth, postController.joinPost);

// comments
router.get("/:id/comments", postController.getComments);
router.post("/:id/comments", auth, postController.createComment);
router.patch("/comments/:id", auth, postController.updateComment);
router.delete("/comments/:id", auth, postController.deleteComment);

export default router;
