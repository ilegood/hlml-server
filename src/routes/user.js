import express from "express";
import { upload } from "../middleware/cloudinary.js";
import auth from "../middleware/auth.js";
import {
  registerUser,
  checkRegistrationAvailability,
  loginUser,
  requestPasswordReset,
  resetPassword,
  getProfile,
  getMyStats,
  getUserPublicProfile,
  getUserActivity,
  updateProfile,
  searchUsersController,
  deleteUserController,
  getUserStats,
  verifyEmail,
  resendVerificationEmail,
} from "../controllers/userController.js";

const router = express.Router();

router.post("/register", registerUser);
router.post("/login", loginUser);
router.post("/password/forgot", requestPasswordReset);
router.post("/password/reset", resetPassword);
router.post("/verify-email", verifyEmail);
router.post("/resend-verification-email", resendVerificationEmail);
router.get("/register/check", checkRegistrationAvailability);
router.get("/profile", auth, getProfile);
router.get("/me/stats", auth, getMyStats);
router.get("/me/stats", auth, getUserStats);
router.get("/search", auth, searchUsersController);
router.patch("/profile", auth, upload.single("profile_img"), updateProfile);
router.delete("/", auth, deleteUserController);
router.get("/:id/activity", auth, getUserActivity);
router.get("/:id", auth, getUserPublicProfile);

export default router;
