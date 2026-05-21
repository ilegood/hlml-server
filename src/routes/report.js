import express from "express";
import pool from "../db.js";
import auth from "../middleware/auth.js";

const router = express.Router();

const mapReportRow = (row) => ({
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

router.get("/my", auth, async (req, res) => {
  const reporterId = req.userId;
  const connection = await pool.getConnection();

  try {
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
    res.json(rows.map(mapReportRow));
  } catch (err) {
    console.error("Report list failed:", err);
    res.status(500).json({ message: "report list failed" });
  } finally {
    connection.release();
  }
});

router.post("/", auth, async (req, res) => {
  const reporterId = req.userId;
  const {
    targetUserId,
    targetPostId,
    targetCommentId,
    targetTitle,
    targetContent,
    reason,
    content,
  } = req.body;
  const connection = await pool.getConnection();

  try {
    if (
      (!targetUserId && !targetPostId && !targetCommentId) ||
      !reason ||
      !String(content || "").trim()
    ) {
      return res.status(400).json({ message: "missing report fields" });
    }

    await connection.beginTransaction();
    const reportType = targetCommentId
      ? "comment"
      : targetPostId
        ? "post"
        : "user";
    let finalTargetUserId = targetUserId || null;
    let targetName = "";
    let targetProfileImg = "";
    let normalizedTargetTitle =
      String(targetTitle || "")
        .trim()
        .slice(0, 255) || null;
    let normalizedTargetExcerpt =
      String(targetContent || "")
        .trim()
        .slice(0, 500) || null;
    let reportCount = 0;

    if (targetCommentId) {
      const [[comment]] = await connection.query(
        "SELECT c.user_id, c.content, u.nickname, u.profile_img FROM comments c JOIN users u ON c.user_id = u.user_id WHERE c.id = ? AND u.is_deleted = FALSE",
        [targetCommentId],
      );

      if (!comment) {
        await connection.rollback();
        return res.status(404).json({ message: "target comment not found" });
      }

      finalTargetUserId = comment.user_id;
      targetName = comment.nickname;
      targetProfileImg = comment.profile_img;
      normalizedTargetExcerpt =
        normalizedTargetExcerpt || String(comment.content || "").trim().slice(0, 500) || null;

      if (Number(finalTargetUserId) === Number(reporterId)) {
        await connection.rollback();
        return res
          .status(400)
          .json({ message: "cannot report your own comment" });
      }

      await connection.query(
        "UPDATE users SET report_count = COALESCE(report_count, 0) + 1 WHERE user_id = ?",
        [finalTargetUserId],
      );

      const [[updatedTarget]] = await connection.query(
        "SELECT report_count FROM users WHERE user_id = ?",
        [finalTargetUserId],
      );
      reportCount = updatedTarget.report_count;
    } else if (targetPostId) {
      const [[post]] = await connection.query(
        "SELECT p.user_id, p.title, p.content, u.nickname, u.profile_img, p.report_count FROM posts p JOIN users u ON p.user_id = u.user_id WHERE p.post_id = ? AND u.is_deleted = FALSE",
        [targetPostId],
      );

      if (!post) {
        await connection.rollback();
        return res.status(404).json({ message: "target post not found" });
      }

      finalTargetUserId = post.user_id;
      targetName = post.nickname;
      targetProfileImg = post.profile_img;
      normalizedTargetTitle =
        normalizedTargetTitle || String(post.title || "").trim().slice(0, 255) || null;
      normalizedTargetExcerpt =
        normalizedTargetExcerpt || String(post.content || "").trim().slice(0, 500) || null;

      if (Number(finalTargetUserId) === Number(reporterId)) {
        await connection.rollback();
        return res.status(400).json({ message: "cannot report your own post" });
      }

      await connection.query(
        "UPDATE posts SET report_count = COALESCE(report_count, 0) + 1 WHERE post_id = ?",
        [targetPostId],
      );

      const [[updatedPost]] = await connection.query(
        "SELECT report_count FROM posts WHERE post_id = ?",
        [targetPostId],
      );
      reportCount = updatedPost.report_count;
    } else {
      if (Number(targetUserId) === Number(reporterId)) {
        await connection.rollback();
        return res.status(400).json({ message: "cannot report yourself" });
      }

      const [[target]] = await connection.query(
        "SELECT user_id, nickname, profile_img, report_count FROM users WHERE user_id = ? AND is_deleted = FALSE",
        [targetUserId],
      );

      if (!target) {
        await connection.rollback();
        return res.status(404).json({ message: "target user not found" });
      }

      finalTargetUserId = target.user_id;
      targetName = target.nickname;
      targetProfileImg = target.profile_img;

      await connection.query(
        "UPDATE users SET report_count = COALESCE(report_count, 0) + 1 WHERE user_id = ?",
        [finalTargetUserId],
      );

      const [[updatedTarget]] = await connection.query(
        "SELECT report_count FROM users WHERE user_id = ?",
        [finalTargetUserId],
      );
      reportCount = updatedTarget.report_count;
    }

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
        reporterId,
        finalTargetUserId,
        targetPostId || null,
        targetCommentId || null,
        reportType,
        targetPostId || null,
        targetCommentId || null,
        normalizedTargetTitle,
        normalizedTargetExcerpt,
        reason,
        String(content).trim(),
      ],
    );

    await connection.commit();

    res.status(201).json({
      id: result.insertId,
      reportType,
      targetUserId: finalTargetUserId,
      targetName,
      targetProfileImg,
      targetPostId: targetPostId || null,
      targetCommentId: targetCommentId || null,
      targetTitle: normalizedTargetTitle,
      targetExcerpt: normalizedTargetExcerpt,
      reason,
      content: String(content).trim(),
      status: "pending",
      reportCount,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    await connection.rollback();
    console.error("Report create failed:", err);
    res.status(500).json({ message: "report create failed" });
  } finally {
    connection.release();
  }
});

export default router;
