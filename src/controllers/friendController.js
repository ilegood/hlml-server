import * as friendService from "../services/friendService.js";

const sendError = (res, error, fallbackMessage) => {
  res.status(error.status || 500).json({
    message: error.status ? error.message : fallbackMessage,
  });
};

export const getFriends = async (req, res) => {
  try {
    res.json(await friendService.getFriends(req.userId));
  } catch (error) {
    sendError(res, error, "친구 목록 조회 실패");
  }
};

export const saveMemo = async (req, res) => {
  try {
    res.json(
      await friendService.saveMemo({
        userId: req.userId,
        targetId: req.body.targetId,
        memo: req.body.memo,
      }),
    );
  } catch (error) {
    sendError(res, error, "메모 저장 실패");
  }
};

export const getRequests = async (req, res) => {
  try {
    res.json(await friendService.getRequests(req.userId));
  } catch (error) {
    sendError(res, error, "요청 조회 실패");
  }
};

export const addFriend = async (req, res) => {
  try {
    res.json(
      await friendService.addFriend({
        userId: req.userId,
        targetNickname: req.body.targetNickname,
      }),
    );
  } catch (error) {
    sendError(res, error, `요청 실패: ${error.message}`);
  }
};

export const acceptFriend = async (req, res) => {
  try {
    res.json(
      await friendService.acceptFriend({
        userId: req.userId,
        targetId: req.body.targetId,
      }),
    );
  } catch (error) {
    sendError(res, error, "수락 실패");
  }
};

export const rejectFriend = async (req, res) => {
  try {
    res.json(
      await friendService.rejectFriend({
        userId: req.userId,
        targetId: req.body.targetId,
      }),
    );
  } catch (error) {
    sendError(res, error, "삭제 실패");
  }
};

export const blockFriend = async (req, res) => {
  try {
    const result = await friendService.blockFriend({
      userId: req.userId,
      targetId: req.body.targetId,
    });

    const io = req.app.get("io");
    if (result.deletedDmRoomId) {
      io?.to(`dm_${result.deletedDmRoomId}`)?.emit("dm_room_deleted", {
        roomId: result.deletedDmRoomId,
        deletedBy: req.userId,
      });
    }

    res.json({ success: true });
  } catch (error) {
    sendError(res, error, "차단 실패");
  }
};

export const unblockFriend = async (req, res) => {
  try {
    res.json(
      await friendService.unblockFriend({
        userId: req.userId,
        targetId: req.body.targetId,
      }),
    );
  } catch (error) {
    sendError(res, error, "차단 해제 실패");
  }
};

export const getBlockedList = async (req, res) => {
  try {
    res.json(await friendService.getBlockedList(req.userId));
  } catch (error) {
    sendError(res, error, "차단 목록 조회 실패");
  }
};
