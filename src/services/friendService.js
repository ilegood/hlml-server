import pool from "../db.js";
import * as repo from "../repositories/friendRepository.js";

export const getFriends = (userId) => repo.findAcceptedFriends(userId);

export const saveMemo = async ({ userId, targetId, memo }) => {
  const relation = await repo.findRelationBetweenUsers(userId, targetId);
  if (!relation) {
    const error = new Error("관계를 찾을 수 없습니다.");
    error.status = 404;
    throw error;
  }

  if (Number(relation.requester_id) === Number(userId)) {
    await repo.updateRelationRequesterMemo(relation.id, memo);
  } else {
    await repo.updateRelationTargetMemo(relation.id, memo);
  }

  return { success: true };
};

export const getRequests = (userId) => repo.findPendingRequestsForUser(userId);

export const addFriend = async ({ userId, targetNickname }) => {
  const target = await repo.findActiveUserByNickname(targetNickname);
  if (!target) {
    const error = new Error("유저를 찾을 수 없습니다.");
    error.status = 404;
    throw error;
  }

  const targetId = target.user_id;
  if (Number(userId) === Number(targetId)) {
    const error = new Error("본인에게는 요청할 수 없습니다.");
    error.status = 400;
    throw error;
  }

  const relation = await repo.findRelationBetweenUsers(userId, targetId);
  if (relation) {
    if (relation.status === "accepted") {
      const error = new Error("이미 친구입니다.");
      error.status = 400;
      throw error;
    }

    if (relation.status === "blocked") {
      const error = new Error("차단된 사용자입니다.");
      error.status = 400;
      throw error;
    }

    if (
      relation.status === "pending" &&
      Number(relation.requester_id) === Number(targetId)
    ) {
      await repo.acceptRelation(relation.id);
      return {
        success: true,
        targetId,
        message: "상대방의 요청을 수락하여 친구가 되었습니다.",
      };
    }

    if (
      relation.status === "pending" &&
      Number(relation.requester_id) === Number(userId)
    ) {
      const error = new Error("이미 친구 요청을 보냈습니다.");
      error.status = 400;
      throw error;
    }
  }

  await repo.createPendingRelation(userId, targetId);
  return { success: true, targetId };
};

export const acceptFriend = async ({ userId, targetId }) => {
  const affectedRows = await repo.acceptPendingRequest(targetId, userId);
  if (affectedRows === 0) {
    const error = new Error("수락할 수 있는 요청이 없습니다.");
    error.status = 400;
    throw error;
  }

  return { success: true };
};

export const rejectFriend = async ({ userId, targetId }) => {
  await repo.deleteRelationBetweenUsers(targetId, userId);
  return { success: true };
};

export const blockFriend = async ({ userId, targetId }) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const relation = await repo.findRelationBetweenUsers(
      userId,
      targetId,
      connection,
    );
    await repo.upsertBlockedRelation(userId, targetId, relation, connection);

    const dmRoom = await repo.findDmRoomBetweenUsers(userId, targetId, connection);
    if (dmRoom) {
      const roomKey = `dm_${dmRoom.id}`;
      await repo.deleteDmRoomMessages(roomKey, connection);
      await repo.deleteDmRoomById(dmRoom.id, connection);
    }

    await connection.commit();
    return { success: true, deletedDmRoomId: dmRoom?.id || null };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export const unblockFriend = async ({ userId, targetId }) => {
  const affectedRows = await repo.deleteBlockedRelation(userId, targetId);
  if (affectedRows === 0) {
    const error = new Error("차단 내역을 찾을 수 없습니다.");
    error.status = 400;
    throw error;
  }

  return { success: true };
};

export const getBlockedList = (userId) => repo.findBlockedUsers(userId);
