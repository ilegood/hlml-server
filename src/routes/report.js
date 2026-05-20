import express from "express";
import pool from "../db.js";
import auth from "../middleware/auth.js";

const router = express.Router();

const ensureReportColumns = async (connection) => {
  await connection.query(
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS report_count INT DEFAULT 0",
  );

  await connection.query(
    "ALTER TABLE posts ADD COLUMN IF NOT EXISTS report_count INT DEFAULT 0",
  );

  await connection.query(
    `CREATE TABLE IF NOT EXISTS reports (
      id INT AUTO_INCREMENT PRIMARY KEY,
      reporter_id INT NOT NULL,
      target_id INT NOT NULL,
      post_id INT DEFAULT NULL,
      comment_id INT DEFAULT NULL,
      reason VARCHAR(100) NOT NULL,
      content TEXT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (reporter_id) REFERENCES users(user_id) ON DELETE CASCADE,
      FOREIGN KEY (target_id) REFERENCES users(user_id) ON DELETE CASCADE,
      FOREIGN KEY (post_id) REFERENCES posts(post_id) ON DELETE CASCADE,
      FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE,
      INDEX idx_reports_reporter_id (reporter_id),
      INDEX idx_reports_target_id (target_id),
      INDEX idx_reports_post_id (post_id),
      INDEX idx_reports_comment_id (comment_id)
    )`,
  );

  // Check and add columns if table already existed
  const [reportCols] = await connection.query("SHOW COLUMNS FROM reports");
  const colNames = reportCols.map(c => c.Field);
  
  if (!colNames.includes('post_id')) {
    await connection.query("ALTER TABLE reports ADD COLUMN post_id INT DEFAULT NULL");
    await connection.query("ALTER TABLE reports ADD FOREIGN KEY (post_id) REFERENCES posts(post_id) ON DELETE CASCADE");
    await connection.query("ALTER TABLE reports ADD INDEX idx_reports_post_id (post_id)");
  }

  if (!colNames.includes('comment_id')) {
    await connection.query("ALTER TABLE reports ADD COLUMN comment_id INT DEFAULT NULL");
    await connection.query("ALTER TABLE reports ADD FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE");
    await connection.query("ALTER TABLE reports ADD INDEX idx_reports_comment_id (comment_id)");
  }
};

router.post("/", auth, async (req, res) => {
  const reporterId = req.userId;
  const { targetUserId, targetPostId, targetCommentId, reason, content } = req.body;
  const connection = await pool.getConnection();

  try {
    if ((!targetUserId && !targetPostId && !targetCommentId) || !reason || !String(content || "").trim()) {
      return res.status(400).json({ message: "missing report fields" });
    }

    await connection.beginTransaction();
    await ensureReportColumns(connection);

    let finalTargetUserId = targetUserId;
    let targetName = "";
    let targetProfileImg = "";
    let reportCount = 0;

    if (targetCommentId) {
      const [[comment]] = await connection.query(
        "SELECT c.user_id, u.nickname, u.profile_img FROM comments c JOIN users u ON c.user_id = u.user_id WHERE c.id = ?",
        [targetCommentId]
      );

      if (!comment) {
        await connection.rollback();
        return res.status(404).json({ message: "target comment not found" });
      }

      finalTargetUserId = comment.user_id;
      targetName = comment.nickname;
      targetProfileImg = comment.profile_img;

      if (Number(finalTargetUserId) === Number(reporterId)) {
        await connection.rollback();
        return res.status(400).json({ message: "cannot report your own comment" });
      }

      const [result] = await connection.query(
        "INSERT INTO reports (reporter_id, target_id, comment_id, reason, content, status) VALUES (?, ?, ?, ?, ?, 'pending')",
        [reporterId, finalTargetUserId, targetCommentId, reason, String(content).trim()]
      );

      await connection.commit();

      return res.status(201).json({
        id: result.insertId,
        targetUserId: finalTargetUserId,
        targetCommentId,
        targetName,
        targetProfileImg,
        reason,
        content: String(content).trim(),
        status: "pending",
        createdAt: new Date().toISOString(),
      });
    } else if (targetPostId) {
      const [[post]] = await connection.query(
        "SELECT p.user_id, p.title, u.nickname, u.profile_img, p.report_count FROM posts p JOIN users u ON p.user_id = u.user_id WHERE p.post_id = ?",
        [targetPostId],
      );

      if (!post) {
        await connection.rollback();
        return res.status(404).json({ message: "target post not found" });
      }

      finalTargetUserId = post.user_id;
      targetName = post.nickname;
      targetProfileImg = post.profile_img;
      
      if (Number(finalTargetUserId) === Number(reporterId)) {
        await connection.rollback();
        return res.status(400).json({ message: "cannot report your own post" });
      }

      const [result] = await connection.query(
        "INSERT INTO reports (reporter_id, target_id, post_id, reason, content, status) VALUES (?, ?, ?, ?, ?, 'pending')",
        [reporterId, finalTargetUserId, targetPostId, reason, String(content).trim()],
      );

      await connection.query(
        "UPDATE posts SET report_count = COALESCE(report_count, 0) + 1 WHERE post_id = ?",
        [targetPostId],
      );

      const [[updatedPost]] = await connection.query(
        "SELECT report_count FROM posts WHERE post_id = ?",
        [targetPostId],
      );
      reportCount = updatedPost.report_count;

      await connection.commit();

      return res.status(201).json({
        id: result.insertId,
        targetUserId: finalTargetUserId,
        targetPostId,
        targetName,
        targetProfileImg,
        reason,
        content: String(content).trim(),
        status: "pending",
        reportCount,
        createdAt: new Date().toISOString(),
      });
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

      const [result] = await connection.query(
        "INSERT INTO reports (reporter_id, target_id, reason, content, status) VALUES (?, ?, ?, ?, 'pending')",
        [reporterId, targetUserId, reason, String(content).trim()],
      );

      await connection.query(
        "UPDATE users SET report_count = COALESCE(report_count, 0) + 1 WHERE user_id = ?",
        [targetUserId],
      );

      const [[updatedTarget]] = await connection.query(
        "SELECT report_count FROM users WHERE user_id = ?",
        [targetUserId],
      );
      reportCount = updatedTarget.report_count;

      await connection.commit();

      return res.status(201).json({
        id: result.insertId,
        targetUserId: target.user_id,
        targetName: target.nickname,
        targetProfileImg: target.profile_img,
        reason,
        content: String(content).trim(),
        status: "pending",
        reportCount,
        createdAt: new Date().toISOString(),
      });
    }
  } catch (err) {
    await connection.rollback();
    console.error("Report create failed:", err);
    res.status(500).json({ message: "report create failed" });
  } finally {
    connection.release();
  }
});

export default router;
