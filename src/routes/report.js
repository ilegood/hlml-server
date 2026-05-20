import express from "express";
import pool from "../db.js";
import auth from "../middleware/auth.js";

const router = express.Router();

const ensureReportColumns = async (connection) => {
  await connection.query(
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS report_count INT DEFAULT 0",
  );

  await connection.query(
    `CREATE TABLE IF NOT EXISTS reports (
      id INT AUTO_INCREMENT PRIMARY KEY,
      reporter_id INT NOT NULL,
      target_id INT NOT NULL,
      reason VARCHAR(100) NOT NULL,
      content TEXT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (reporter_id) REFERENCES users(user_id) ON DELETE CASCADE,
      FOREIGN KEY (target_id) REFERENCES users(user_id) ON DELETE CASCADE,
      INDEX idx_reports_reporter_id (reporter_id),
      INDEX idx_reports_target_id (target_id)
    )`,
  );

  await connection.query(
    "ALTER TABLE reports ADD COLUMN IF NOT EXISTS report_type VARCHAR(20) NOT NULL DEFAULT 'user'",
  );
  await connection.query(
    "ALTER TABLE reports ADD COLUMN IF NOT EXISTS target_post_id INT NULL",
  );
  await connection.query(
    "ALTER TABLE reports ADD COLUMN IF NOT EXISTS target_comment_id INT NULL",
  );
  await connection.query(
    "ALTER TABLE reports ADD COLUMN IF NOT EXISTS target_title VARCHAR(255) NULL",
  );
  await connection.query(
    "ALTER TABLE reports ADD COLUMN IF NOT EXISTS target_excerpt TEXT NULL",
  );
};

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
    await ensureReportColumns(connection);
    const [rows] = await connection.query(
      `SELECT
         r.id,
         r.target_id,
         u.nickname AS target_name,
         u.profile_img AS target_profile_img,
         r.report_type,
         r.target_post_id,
         r.target_comment_id,
         r.target_title,
         r.target_excerpt,
         r.reason,
         r.content,
         r.status,
         u.report_count,
         r.created_at
       FROM reports r
       JOIN users u ON u.user_id = r.target_id
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
    if (!targetUserId || !reason || !String(content || "").trim()) {
      return res.status(400).json({ message: "missing report fields" });
    }

    if (Number(targetUserId) === Number(reporterId)) {
      return res.status(400).json({ message: "cannot report yourself" });
    }

    await connection.beginTransaction();
    await ensureReportColumns(connection);

    const reportType = targetCommentId
      ? "comment"
      : targetPostId
        ? "post"
        : "user";
    const normalizedTargetTitle = String(targetTitle || "").trim().slice(0, 255) || null;
    const normalizedTargetExcerpt =
      String(targetContent || "").trim().slice(0, 500) || null;

    const [[target]] = await connection.query(
      "SELECT user_id, nickname, profile_img, report_count FROM users WHERE user_id = ? AND is_deleted = FALSE",
      [targetUserId],
    );

    if (!target) {
      await connection.rollback();
      return res.status(404).json({ message: "target user not found" });
    }

    const [result] = await connection.query(
      `INSERT INTO reports (
        reporter_id,
        target_id,
        report_type,
        target_post_id,
        target_comment_id,
        target_title,
        target_excerpt,
        reason,
        content,
        status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        reporterId,
        targetUserId,
        reportType,
        targetPostId || null,
        targetCommentId || null,
        normalizedTargetTitle,
        normalizedTargetExcerpt,
        reason,
        String(content).trim(),
      ],
    );

    await connection.query(
      "UPDATE users SET report_count = COALESCE(report_count, 0) + 1 WHERE user_id = ?",
      [targetUserId],
    );

    const [[updatedTarget]] = await connection.query(
      "SELECT report_count FROM users WHERE user_id = ?",
      [targetUserId],
    );

    await connection.commit();

    res.status(201).json({
      id: result.insertId,
      reportType,
      targetUserId: target.user_id,
      targetName: target.nickname,
      targetProfileImg: target.profile_img,
      targetPostId: targetPostId || null,
      targetCommentId: targetCommentId || null,
      targetTitle: normalizedTargetTitle,
      targetExcerpt: normalizedTargetExcerpt,
      reason,
      content: String(content).trim(),
      status: "pending",
      reportCount: updatedTarget.report_count,
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
