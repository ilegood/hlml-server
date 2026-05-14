import express from "express";
import { upload } from "../middleware/cloudinary.js";
import auth from "../middleware/auth.js";
import {
  registerUser,
  loginUser,
  getProfile,
  updateProfile,
  searchUsersController,
  deleteUserController,
} from "../controllers/userController.js";

const router = express.Router();

router.post("/register", registerUser);
router.post("/login", loginUser);
router.get("/profile", auth, getProfile);
router.patch("/profile", auth, upload.single("profile_img"), updateProfile);
router.get("/search", auth, searchUsersController);
router.delete("/", auth, deleteUserController);

export default router;
