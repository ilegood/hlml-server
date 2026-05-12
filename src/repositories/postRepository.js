import pool from "../db.js";

const mapPostRow = (post, likes = [], participants = [], comments = [], authorDetails = null) => {
  const joinedBy = participants.map((row) => row.nickname);
  const joinedUserIds = participants.map((row) => row.user_id);
  const topLevel = [];
  const byId = new Map();

  comments.forEach((row) => {
    const item = {
      id: row.id,
      userId: row.user_id,
      text: row.content,
      author: row.nickname || "익명",
      createdAt: row.created_at,
      edited: Boolean(row.edited),
      replies: [],
    };

    byId.set(row.id, item);

    if (row.parent_id) {
      const parent = byId.get(row.parent_id);
      if (parent) parent.replies.push(item);
    } else {
      topLevel.push(item);
    }
  });

  return {
    ...post,
    authorDetails,
    participantDetails: participants,
    likes: likes.length,
    likedBy: likes.map((row) => row.nickname),
    joinedBy,
    joinedUserIds,
    participants: 1 + joinedBy.length,
    comments: topLevel,
  };
};

export const getPostWithDetails = async (id) => {
  const post = await getPost(id);
  if (!post) return null;

  const [likes] = await pool.query(
    `SELECT u.nickname
     FROM post_likes pl
     JOIN users u ON pl.user_id = u.user_id
     WHERE pl.post_id = ?`,
    [id],
  );

  const [participants] = await pool.query(
    `SELECT u.user_id, u.nickname, u.profile_img
     FROM post_participants pp
     JOIN users u ON pp.user_id = u.user_id
     WHERE pp.post_id = ?`,
    [id],
  );

  const [[authorDetails]] = await pool.query(
    `SELECT user_id, nickname, profile_img FROM users WHERE nickname = ?`,
    [post.author],
  );

  const [comments] = await pool.query(
    `SELECT c.*, u.nickname
     FROM comments c
     LEFT JOIN users u ON c.user_id = u.user_id
     WHERE c.post_id = ?
     ORDER BY c.created_at ASC, c.id ASC`,
    [id],
  );

  return mapPostRow(post, likes, participants, comments, authorDetails);
};

// posts
export const getPosts = async () => {
  const [rows] = await pool.query(
    "SELECT * FROM posts ORDER BY created_at DESC",
  );
  return Promise.all(rows.map((row) => getPostWithDetails(row.post_id)));
};

export const getPost = async (id) => {
  const [[row]] = await pool.query("SELECT * FROM posts WHERE post_id=?", [id]);
  return row;
};

export const createPost = async (data) => {
  const [result] = await pool.query(
    `INSERT INTO posts 
    (title, content, date, time, place, capacity, status, author, categories, image)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.title,
      data.content,
      data.date,
      data.time,
      data.place,
      data.capacity,
      data.status,
      data.author,
      data.categories,
      data.image,
    ],
  );

  return { id: result.insertId };
};

export const updatePost = async (id, data) => {
  await pool.query(
    `UPDATE posts SET
     title=?, content=?, date=?, time=?, place=?,
     capacity=?, status=?, categories=?, image=?, edited=1
     WHERE post_id=?`,
    [
      data.title,
      data.content,
      data.date,
      data.time,
      data.place,
      data.capacity,
      data.status,
      data.categories,
      data.image,
      id,
    ],
  );
};

export const deletePost = (id) =>
  pool.query("DELETE FROM posts WHERE post_id=?", [id]);

// like
export const toggleLikePost = async (userId, postId) => {
  const [[existing]] = await pool.query(
    "SELECT id FROM post_likes WHERE user_id=? AND post_id=?",
    [userId, postId],
  );

  if (existing) {
    await pool.query("DELETE FROM post_likes WHERE id=?", [existing.id]);
  } else {
    await pool.query("INSERT INTO post_likes (user_id, post_id) VALUES (?, ?)", [
      userId,
      postId,
    ]);
  }

  return getPostWithDetails(postId);
};

// join
export const toggleJoinPost = async (userId, postId) => {
  const post = await getPost(postId);
  if (!post) return null;

  const [[existing]] = await pool.query(
    "SELECT id FROM post_participants WHERE user_id=? AND post_id=?",
    [userId, postId],
  );

  if (existing) {
    await pool.query("DELETE FROM post_participants WHERE id=?", [existing.id]);
  } else {
    // 강퇴 여부 확인 (post_bans 테이블 활용)
    const [banRows] = await pool.query(
      "SELECT id FROM post_bans WHERE post_id = ? AND user_id = ?",
      [postId, userId],
    );

    if (banRows.length > 0) {
      const error = new Error("이 방에서 강퇴당하여 다시 참여할 수 없습니다.");
      error.status = 403;
      throw error;
    }

    const [[{ count }]] = await pool.query(
      "SELECT COUNT(*) AS count FROM post_participants WHERE post_id=?",
      [postId],
    );

    if (1 + count >= (post.capacity || 2)) {
      const error = new Error("capacity exceeded");
      error.status = 400;
      throw error;
    }

    await pool.query(
      "INSERT INTO post_participants (user_id, post_id) VALUES (?, ?)",
      [userId, postId],
    );
  }

  const [[{ count }]] = await pool.query(
    "SELECT COUNT(*) AS count FROM post_participants WHERE post_id=?",
    [postId],
  );
  const nextParticipants = 1 + count;
  const nextStatus =
    nextParticipants >= (post.capacity || 2) ? "모집완료" : "모집중";

  await pool.query(
    "UPDATE posts SET participants=?, status=? WHERE post_id=?",
    [nextParticipants, nextStatus, postId],
  );

  return getPostWithDetails(postId);
};

export const leavePost = async (userId, postId) => {
  const post = await getPost(postId);
  if (!post) return null;

  // 유저 정보 가져오기 (닉네임 확인용)
  const [[user]] = await pool.query(
    "SELECT nickname FROM users WHERE user_id = ?",
    [userId],
  );
  if (!user) return null;

  const isAuthor = post.author === user.nickname;

  if (isAuthor) {
    // 방장이 나가는 경우: 다음 참여자에게 방장 위임
    const [[nextParticipant]] = await pool.query(
      `SELECT pp.user_id, u.nickname 
       FROM post_participants pp
       JOIN users u ON pp.user_id = u.user_id
       WHERE pp.post_id = ? 
       ORDER BY pp.id ASC LIMIT 1`,
      [postId],
    );

    if (nextParticipant) {
      // 다음 사람에게 방장 넘기기
      await pool.query(
        "UPDATE posts SET author = ? WHERE post_id = ?",
        [nextParticipant.nickname, postId],
      );
      // 참여자 목록에서 해당 유저 제거 (방장이 되었으므로)
      await pool.query(
        "DELETE FROM post_participants WHERE post_id = ? AND user_id = ?",
        [postId, nextParticipant.user_id],
      );
    } else {
      // 혼자 있었으면 그냥 방장 유지 (또는 방 삭제 로직을 넣을 수도 있음)
      // 여기서는 요구사항에 따라 인원 감소만 처리
    }
  } else {
    // 일반 참여자가 나가는 경우: 참여자 목록에서 삭제
    await pool.query(
      "DELETE FROM post_participants WHERE post_id = ? AND user_id = ?",
      [postId, userId],
    );
  }

  // 참여 인원 및 상태 업데이트
  const [[{ count }]] = await pool.query(
    "SELECT COUNT(*) AS count FROM post_participants WHERE post_id=?",
    [postId],
  );
  
  const nextParticipants = 1 + count; // 방장 1명 + 나머지 참여자
  const nextStatus = nextParticipants >= (post.capacity || 2) ? "모집완료" : "모집중";

  await pool.query(
    "UPDATE posts SET participants=?, status=? WHERE post_id=?",
    [nextParticipants, nextStatus, postId],
  );

  // 시스템 메시지: 유저 퇴장 알림 저장
  const leaveMsgContent = `${user.nickname}님이 퇴장하셨습니다.`;
  await pool.query(
    "INSERT INTO messages (room_id, user_id, nickname, content, is_system) VALUES (?, ?, ?, ?, ?)",
    [postId, userId, "System", leaveMsgContent, 1],
  );

  return getPostWithDetails(postId);
};

// comments
export const getComments = async (postId) => {
  const [rows] = await pool.query(
    `SELECT c.*, u.nickname
     FROM comments c
     JOIN users u ON c.user_id = u.user_id
     WHERE post_id = ?`,
    [postId],
  );
  return rows;
};

export const createComment = (data) =>
  pool.query(
    "INSERT INTO comments (post_id, user_id, content, parent_id) VALUES (?, ?, ?, ?)",
    [data.postId, data.userId, data.content, data.parent_id || null],
  );

export const updateComment = (id, userId, content) =>
  pool.query("UPDATE comments SET content=?, edited=1 WHERE id=? AND user_id=?", [
    content,
    id,
    userId,
  ]);

export const deleteComment = (id, userId) =>
  pool.query("DELETE FROM comments WHERE (id=? OR parent_id=?) AND user_id=?", [
    id,
    id,
    userId,
  ]);

// bans
export const getKickedPostsForUser = async (userId) => {
  const [rows] = await pool.query(
    `SELECT p.* 
     FROM post_bans pb
     JOIN posts p ON pb.post_id = p.post_id
     WHERE pb.user_id = ? AND pb.is_hidden = 0`,
    [userId],
  );
  return Promise.all(rows.map((row) => getPostWithDetails(row.post_id)));
};

export const deletePostBan = async (userId, postId) => {
  return pool.query(
    "UPDATE post_bans SET is_hidden = 1 WHERE user_id = ? AND post_id = ?",
    [userId, postId],
  );
};
