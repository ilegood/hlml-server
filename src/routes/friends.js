import express from "express";
import auth from "../middleware/auth.js";
import * as friendController from "../controllers/friendController.js";

const router = express.Router();

// 모든 친구 관련 라우트에 인증 미들웨어 적용
router.use(auth);

// 친구 목록 조회
router.get("/", friendController.getFriends);

// 친구 메모 저장
router.post("/memo", friendController.saveMemo);

// 받은 친구 요청 목록
router.get("/requests", friendController.getRequests);

// 친구 요청 보내기
router.post("/add", friendController.addFriend);

// 친구 요청 수락
router.post("/accept", friendController.acceptFriend);

// 친구 요청 거절/삭제
router.post("/reject", friendController.rejectFriend);

// 차단하기
router.post("/block", friendController.blockFriend);

// 차단 해제하기
router.post("/unblock", friendController.unblockFriend);

// 차단 목록 조회
router.get("/blocked", friendController.getBlockedList);

export default router;
