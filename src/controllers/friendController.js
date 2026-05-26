import * as friendService from "../services/friendService.js";
import asyncHandler from "../utils/asyncHandler.js";

export const getFriends = asyncHandler(async (req, res) => {
  res.json(await friendService.getFriends(req.userId));
});

export const saveMemo = asyncHandler(async (req, res) => {
  res.json(
    await friendService.saveMemo({
      userId: req.userId,
      targetId: req.body.targetId,
      memo: req.body.memo,
    }),
  );
});

export const getRequests = asyncHandler(async (req, res) => {
  res.json(await friendService.getRequests(req.userId));
});

export const addFriend = asyncHandler(async (req, res) => {
  res.json(
    await friendService.addFriend({
      userId: req.userId,
      targetNickname: req.body.targetNickname,
    }),
  );
});

export const acceptFriend = asyncHandler(async (req, res) => {
  res.json(
    await friendService.acceptFriend({
      userId: req.userId,
      targetId: req.body.targetId,
    }),
  );
});

export const rejectFriend = asyncHandler(async (req, res) => {
  res.json(
    await friendService.rejectFriend({
      userId: req.userId,
      targetId: req.body.targetId,
    }),
  );
});

export const blockFriend = asyncHandler(async (req, res) => {
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
});

export const unblockFriend = asyncHandler(async (req, res) => {
  res.json(
    await friendService.unblockFriend({
      userId: req.userId,
      targetId: req.body.targetId,
    }),
  );
});

export const getBlockedList = asyncHandler(async (req, res) => {
  res.json(await friendService.getBlockedList(req.userId));
});
