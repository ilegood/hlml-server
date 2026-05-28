import { query } from "../db.js";

const getExecutor = (connection) => connection || { query };

export const findAcceptedFriends = async (userId) => {
  const [rows] = await query(
    `SELECT
       u.user_id as id,
       u.nickname as name,
       u.profile_img,
        u.bio as statusMessage,
        'online' as status,
        CASE
         WHEN r.requester_id = ? THEN r.requester_memo
         ELSE r.target_memo
       END as memo
     FROM user_relations r
     JOIN users u
       ON (u.user_id = r.target_id AND r.requester_id = ?)
       OR (u.user_id = r.requester_id AND r.target_id = ?)
     WHERE r.status = 'accepted' AND u.is_deleted = FALSE`,
    [userId, userId, userId],
  );
  return rows;
};

export const findRelationBetweenUsers = async (userA, userB, connection) => {
  const executor = getExecutor(connection);
  const [rows] = await executor.query(
    `SELECT id, requester_id, target_id, status, requester_memo, target_memo
     FROM user_relations
     WHERE (requester_id = ? AND target_id = ?)
        OR (requester_id = ? AND target_id = ?)`,
    [userA, userB, userB, userA],
  );
  return rows[0] || null;
};

export const updateRelationRequesterMemo = (relationId, memo) =>
  query("UPDATE user_relations SET requester_memo = ? WHERE id = ?", [
    memo,
    relationId,
  ]);

export const updateRelationTargetMemo = (relationId, memo) =>
  query("UPDATE user_relations SET target_memo = ? WHERE id = ?", [
    memo,
    relationId,
  ]);

export const findPendingRequestsForUser = async (userId) => {
  const [rows] = await query(
    `SELECT u.user_id as id, u.nickname as name, u.profile_img
     FROM user_relations r
     JOIN users u ON u.user_id = r.requester_id
     WHERE r.target_id = ? AND r.status = 'pending' AND u.is_deleted = FALSE`,
    [userId],
  );
  return rows;
};

export const findActiveUserByNickname = async (nickname) => {
  const [rows] = await query(
    "SELECT user_id FROM users WHERE nickname = ? AND is_deleted = FALSE",
    [nickname],
  );
  return rows[0] || null;
};

export const acceptRelation = (relationId, connection) => {
  const executor = getExecutor(connection);
  return executor.query(
    "UPDATE user_relations SET status = 'accepted' WHERE id = ?",
    [relationId],
  );
};

export const createPendingRelation = (requesterId, targetId) =>
  query(
    "INSERT INTO user_relations (requester_id, target_id, status) VALUES (?, ?, 'pending')",
    [requesterId, targetId],
  );

export const acceptPendingRequest = async (requesterId, targetId) => {
  const [result] = await query(
    "UPDATE user_relations SET status = 'accepted' WHERE requester_id = ? AND target_id = ? AND status = 'pending'",
    [requesterId, targetId],
  );
  return result.affectedRows;
};

export const deleteRelationBetweenUsers = (userA, userB) =>
  query(
    `DELETE FROM user_relations
     WHERE (requester_id = ? AND target_id = ?)
        OR (requester_id = ? AND target_id = ?)`,
    [userA, userB, userB, userA],
  );

export const upsertBlockedRelation = async (
  requesterId,
  targetId,
  existingRelation,
  connection,
) => {
  const executor = getExecutor(connection);

  if (existingRelation) {
    await executor.query(
      "UPDATE user_relations SET requester_id = ?, target_id = ?, status = 'blocked' WHERE id = ?",
      [requesterId, targetId, existingRelation.id],
    );
    return;
  }

  await executor.query(
    "INSERT INTO user_relations (requester_id, target_id, status) VALUES (?, ?, 'blocked')",
    [requesterId, targetId],
  );
};

export const findDmRoomBetweenUsers = async (userA, userB, connection) => {
  const executor = getExecutor(connection);
  const lowerId = Math.min(userA, userB);
  const higherId = Math.max(userA, userB);
  const [[room]] = await executor.query(
    "SELECT id FROM dm_rooms WHERE user1_id = ? AND user2_id = ?",
    [lowerId, higherId],
  );
  return room || null;
};

export const deleteDmRoomMessages = async (roomKey, connection) => {
  await connection.query(
    `DELETE mr FROM message_reactions mr
     JOIN messages m ON mr.message_id = m.id
     WHERE m.room_id = ?`,
    [roomKey],
  );
  await connection.query(
    `DELETE mrd FROM message_reads mrd
     JOIN messages m ON mrd.message_id = m.id
     WHERE m.room_id = ?`,
    [roomKey],
  );
  await connection.query("DELETE FROM messages WHERE room_id = ?", [roomKey]);
};

export const deleteDmRoomById = (roomId, connection) =>
  connection.query("DELETE FROM dm_rooms WHERE id = ?", [roomId]);

export const deleteBlockedRelation = async (requesterId, targetId) => {
  const [result] = await query(
    "DELETE FROM user_relations WHERE requester_id = ? AND target_id = ? AND status = 'blocked'",
    [requesterId, targetId],
  );
  return result.affectedRows;
};

export const findBlockedUsers = async (userId) => {
  const [rows] = await query(
    `SELECT u.user_id as id, u.nickname, u.profile_img
     FROM users u
     JOIN user_relations r ON u.user_id = r.target_id
     WHERE r.requester_id = ? AND r.status = 'blocked'`,
    [userId],
  );
  return rows;
};
