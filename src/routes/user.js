import express from "express";
import { upload } from "../middleware/cloudinary.js";
import auth from "../middleware/auth.js";
import {
  registerUser,
  loginUser,
  getProfile,
  getUserPublicProfile,
  updateProfile,
  searchUsersController,
  deleteUserController,
} from "../controllers/userController.js";

const router = express.Router();

router.post("/register", registerUser);
router.post("/login", loginUser);
router.get("/profile", auth, getProfile);
router.get("/search", auth, searchUsersController);
router.patch("/profile", auth, upload.single("profile_img"), updateProfile);
router.delete("/", auth, deleteUserController);
router.get("/:id", auth, getUserPublicProfile);

export default router;
