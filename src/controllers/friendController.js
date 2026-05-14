import pool from "../db.js";

// 친구 목록 조회
export const getFriends = async (req, res) => {
  const myId = req.userId;
  try {
    const [rows] = await pool.query(
      `
      SELECT 
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
      JOIN users u ON (u.user_id = r.target_id AND r.requester_id = ?) OR (u.user_id = r.requester_id AND r.target_id = ?)
      WHERE r.status = 'accepted' AND u.is_deleted = FALSE
    `,
      [myId, myId, myId],
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "조회 실패" });
  }
};

// 친구 메모 저장
export const saveMemo = async (req, res) => {
  const { targetId, memo } = req.body;
  const myId = req.userId;

  try {
    const [relations] = await pool.query(
      "SELECT * FROM user_relations WHERE (requester_id = ? AND target_id = ?) OR (requester_id = ? AND target_id = ?)",
      [myId, targetId, targetId, myId],
    );

    if (relations.length === 0)
      return res.status(404).json({ message: "관계를 찾을 수 없습니다." });

    const relation = relations[0];
    if (relation.requester_id == myId) {
      await pool.query(
        "UPDATE user_relations SET requester_memo = ? WHERE id = ?",
        [memo, relation.id],
      );
    } else {
      await pool.query(
        "UPDATE user_relations SET target_memo = ? WHERE id = ?",
        [memo, relation.id],
      );
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: "메모 저장 실패" });
  }
};

// 받은 친구 요청 목록
export const getRequests = async (req, res) => {
  const myId = req.userId;
  try {
    const [rows] = await pool.query(
      `
      SELECT u.user_id as id, u.nickname as name, u.profile_img 
      FROM user_relations r
      JOIN users u ON u.user_id = r.requester_id 
      WHERE r.target_id = ? AND r.status = 'pending' AND u.is_deleted = FALSE
    `,
      [myId],
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "요청 조회 실패" });
  }
};

// 친구 요청 보내기
export const addFriend = async (req, res) => {
  const { targetNickname } = req.body;
  const myId = req.userId;

  try {
    const [users] = await pool.query(
      "SELECT user_id FROM users WHERE nickname = ? AND is_deleted = FALSE",
      [targetNickname],
    );
    if (users.length === 0)
      return res.status(404).json({ message: "유저를 찾을 수 없습니다." });

    const targetId = users[0].user_id;
    if (myId == targetId)
      return res
        .status(400)
        .json({ message: "본인에게는 요청할 수 없습니다." });

    const [existing] = await pool.query(
      "SELECT * FROM user_relations WHERE (requester_id = ? AND target_id = ?) OR (requester_id = ? AND target_id = ?)",
      [myId, targetId, targetId, myId],
    );

    if (existing.length > 0) {
      const relation = existing[0];
      if (relation.status === "accepted")
        return res.status(400).json({ message: "이미 친구입니다." });
      if (relation.status === "blocked")
        return res.status(400).json({ message: "차단된 사용자입니다." });
      if (relation.status === "pending" && relation.requester_id == targetId) {
        await pool.query(
          "UPDATE user_relations SET status = 'accepted' WHERE id = ?",
          [relation.id],
        );
        return res.json({
          success: true,
          message: "상대방의 요청을 수락하여 친구가 되었습니다.",
        });
      }
      if (relation.status === "pending" && relation.requester_id == myId) {
        return res
          .status(400)
          .json({ message: "이미 친구 요청을 보냈습니다." });
      }
    }

    await pool.query(
      "INSERT INTO user_relations (requester_id, target_id, status) VALUES (?, ?, 'pending')",
      [myId, targetId],
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: "요청 실패: " + err.message });
  }
};

// 친구 요청 수락
export const acceptFriend = async (req, res) => {
  const { targetId } = req.body;
  const myId = req.userId;

  try {
    const [result] = await pool.query(
      "UPDATE user_relations SET status = 'accepted' WHERE requester_id = ? AND target_id = ? AND status = 'pending'",
      [targetId, myId],
    );
    if (result.affectedRows === 0)
      return res
        .status(400)
        .json({ message: "수락할 수 있는 요청이 없습니다." });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: "수락 실패" });
  }
};

// 친구 요청 거절/삭제
export const rejectFriend = async (req, res) => {
  const { targetId } = req.body;
  const myId = req.userId;

  try {
    await pool.query(
      "DELETE FROM user_relations WHERE (requester_id = ? AND target_id = ?) OR (requester_id = ? AND target_id = ?)",
      [targetId, myId, myId, targetId],
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: "삭제 실패" });
  }
};

// 차단하기
export const blockFriend = async (req, res) => {
  const { targetId } = req.body;
  const myId = req.userId;
  const u1 = Math.min(myId, targetId);
  const u2 = Math.max(myId, targetId);

  try {
    const [existing] = await pool.query(
      "SELECT * FROM user_relations WHERE (requester_id = ? AND target_id = ?) OR (requester_id = ? AND target_id = ?)",
      [myId, targetId, targetId, myId],
    );

    if (existing.length > 0) {
      await pool.query(
        "UPDATE user_relations SET requester_id = ?, target_id = ?, status = 'blocked' WHERE id = ?",
        [myId, targetId, existing[0].id],
      );
    } else {
      await pool.query(
        "INSERT INTO user_relations (requester_id, target_id, status) VALUES (?, ?, 'blocked')",
        [myId, targetId],
      );
    }

    const [[dmRoom]] = await pool.query(
      "SELECT id FROM dm_rooms WHERE user1_id = ? AND user2_id = ?",
      [u1, u2],
    );

    if (dmRoom) {
      await pool.query(
        `DELETE mr FROM message_reactions mr
         JOIN messages m ON mr.message_id = m.id
         WHERE m.room_id = ?`,
        [`dm_${dmRoom.id}`],
      );
      await pool.query(
        `DELETE mrd FROM message_reads mrd
         JOIN messages m ON mrd.message_id = m.id
         WHERE m.room_id = ?`,
        [`dm_${dmRoom.id}`],
      );
      await pool.query("DELETE FROM messages WHERE room_id = ?", [
        `dm_${dmRoom.id}`,
      ]);
      await pool.query("DELETE FROM dm_rooms WHERE id = ?", [dmRoom.id]);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: "차단 실패" });
  }
};

// 차단 해제하기 (관계 삭제)
export const unblockFriend = async (req, res) => {
  const { targetId } = req.body;
  const myId = req.userId;

  try {
    const [result] = await pool.query(
      "DELETE FROM user_relations WHERE requester_id = ? AND target_id = ? AND status = 'blocked'",
      [myId, targetId],
    );

    if (result.affectedRows === 0) {
      return res.status(400).json({ message: "차단 내역을 찾을 수 없습니다." });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: "차단 해제 실패" });
  }
};

// 차단 목록 조회
export const getBlockedList = async (req, res) => {
  const myId = req.userId;
  try {
    const [rows] = await pool.query(
      `
      SELECT u.user_id as id, u.nickname, u.profile_img 
      FROM users u 
      JOIN user_relations r ON u.user_id = r.target_id 
      WHERE r.requester_id = ? AND r.status = 'blocked'
    `,
      [myId],
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "차단 목록 조회 실패" });
  }
};
