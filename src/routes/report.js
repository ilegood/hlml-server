import express from "express";
import auth from "../middleware/auth.js";
import * as reportController from "../controllers/reportController.js";

const router = express.Router();

router.use(auth);

router.get("/my", reportController.getMyReports);
router.post("/", reportController.createReport);

export default router;
