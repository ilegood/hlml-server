export const mapReportRow = (row) => ({
  id: row.id,
  reportType: row.report_type,
  targetUserId: row.target_id,
  targetName: row.target_name,
  targetProfileImg: row.target_profile_img,
  targetPostId: row.target_post_id,
  targetCommentId: row.target_comment_id,
  targetTitle: row.target_title,
  targetExcerpt: row.target_excerpt,
  reason: row.reason,
  content: row.content,
  status: row.status,
  reportCount: row.report_count,
  createdAt: row.created_at,
});

export const findRecentReportsByReporter = async (connection, reporterId) => {
  const [rows] = await connection.query(
    `SELECT
       r.id,
       r.target_id,
       u.nickname AS target_name,
       u.profile_img AS target_profile_img,
       CASE
         WHEN COALESCE(r.target_comment_id, r.comment_id) IS NOT NULL THEN 'comment'
         WHEN COALESCE(r.target_post_id, r.post_id) IS NOT NULL THEN 'post'
         ELSE r.report_type
       END AS report_type,
       COALESCE(r.target_post_id, r.post_id) AS target_post_id,
       COALESCE(r.target_comment_id, r.comment_id) AS target_comment_id,
       COALESCE(r.target_title, p.title) AS target_title,
       r.target_excerpt,
       r.reason,
       r.content,
       r.status,
       CASE
         WHEN COALESCE(r.target_post_id, r.post_id) IS NOT NULL
           THEN COALESCE(p.report_count, 0)
         ELSE COALESCE(u.report_count, 0)
       END AS report_count,
       r.created_at
     FROM reports r
     JOIN users u ON u.user_id = r.target_id
     LEFT JOIN posts p ON p.post_id = COALESCE(r.target_post_id, r.post_id)
     WHERE r.reporter_id = ?
       AND r.created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
     ORDER BY r.created_at DESC`,
    [reporterId],
  );
  return rows.map(mapReportRow);
};

export const findCommentReportTarget = async (connection, commentId) => {
  const [[comment]] = await connection.query(
    "SELECT c.user_id, c.content, u.nickname, u.profile_img FROM comments c JOIN users u ON c.user_id = u.user_id WHERE c.id = ? AND u.is_deleted = FALSE",
    [commentId],
  );
  return comment;
};

export const findPostReportTarget = async (connection, postId) => {
  const [[post]] = await connection.query(
    "SELECT p.user_id, p.title, p.content, u.nickname, u.profile_img, p.report_count FROM posts p JOIN users u ON p.user_id = u.user_id WHERE p.post_id = ? AND u.is_deleted = FALSE",
    [postId],
  );
  return post;
};

export const findUserReportTarget = async (connection, userId) => {
  const [[target]] = await connection.query(
    "SELECT user_id, nickname, profile_img, report_count FROM users WHERE user_id = ? AND is_deleted = FALSE",
    [userId],
  );
  return target;
};

export const incrementUserReportCount = async (connection, userId) => {
  await connection.query(
    "UPDATE users SET report_count = COALESCE(report_count, 0) + 1 WHERE user_id = ?",
    [userId],
  );
  const [[updatedTarget]] = await connection.query(
    "SELECT report_count FROM users WHERE user_id = ?",
    [userId],
  );
  return Number(updatedTarget?.report_count) || 0;
};

export const incrementPostReportCount = async (connection, postId) => {
  await connection.query(
    "UPDATE posts SET report_count = COALESCE(report_count, 0) + 1 WHERE post_id = ?",
    [postId],
  );
  const [[updatedPost]] = await connection.query(
    "SELECT report_count FROM posts WHERE post_id = ?",
    [postId],
  );
  return Number(updatedPost?.report_count) || 0;
};

export const createReport = async (connection, report) => {
  const [result] = await connection.query(
    `INSERT INTO reports (
      reporter_id,
      target_id,
      post_id,
      comment_id,
      report_type,
      target_post_id,
      target_comment_id,
      target_title,
      target_excerpt,
      reason,
      content,
      status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
    [
      report.reporterId,
      report.targetUserId,
      report.targetPostId || null,
      report.targetCommentId || null,
      report.reportType,
      report.targetPostId || null,
      report.targetCommentId || null,
      report.targetTitle,
      report.targetExcerpt,
      report.reason,
      report.content,
    ],
  );
  return result.insertId;
};
