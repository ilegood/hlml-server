import pool from "../db.js";
import * as repo from "../repositories/reportRepository.js";

const toRequiredContent = (value) => String(value || "").trim();
const toNullableSnippet = (value, maxLength) =>
  String(value || "").trim().slice(0, maxLength) || null;

const httpError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const assertNotSelfReport = (reporterId, targetUserId, message) => {
  if (Number(reporterId) === Number(targetUserId)) {
    throw httpError(400, message);
  }
};

export const getMyReports = async (reporterId) => {
  const connection = await pool.getConnection();
  try {
    return await repo.findRecentReportsByReporter(connection, reporterId);
  } finally {
    connection.release();
  }
};

export const createReport = async ({ reporterId, body }) => {
  const {
    targetUserId,
    targetPostId,
    targetCommentId,
    targetTitle,
    targetContent,
    reason,
  } = body;
  const content = toRequiredContent(body.content);

  if ((!targetUserId && !targetPostId && !targetCommentId) || !reason || !content) {
    throw httpError(400, "missing report fields");
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const reportType = targetCommentId
      ? "comment"
      : targetPostId
        ? "post"
        : "user";
    let finalTargetUserId = targetUserId || null;
    let targetName = "";
    let targetProfileImg = "";
    let normalizedTargetTitle = toNullableSnippet(targetTitle, 255);
    let normalizedTargetExcerpt = toNullableSnippet(targetContent, 500);
    let reportCount = 0;

    if (targetCommentId) {
      const comment = await repo.findCommentReportTarget(connection, targetCommentId);
      if (!comment) throw httpError(404, "target comment not found");

      finalTargetUserId = comment.user_id;
      targetName = comment.nickname;
      targetProfileImg = comment.profile_img;
      normalizedTargetExcerpt =
        normalizedTargetExcerpt || toNullableSnippet(comment.content, 500);

      assertNotSelfReport(
        reporterId,
        finalTargetUserId,
        "cannot report your own comment",
      );

      reportCount = await repo.incrementUserReportCount(
        connection,
        finalTargetUserId,
      );
    } else if (targetPostId) {
      const post = await repo.findPostReportTarget(connection, targetPostId);
      if (!post) throw httpError(404, "target post not found");

      finalTargetUserId = post.user_id;
      targetName = post.nickname;
      targetProfileImg = post.profile_img;
      normalizedTargetTitle =
        normalizedTargetTitle || toNullableSnippet(post.title, 255);
      normalizedTargetExcerpt =
        normalizedTargetExcerpt || toNullableSnippet(post.content, 500);

      assertNotSelfReport(reporterId, finalTargetUserId, "cannot report your own post");

      reportCount = await repo.incrementPostReportCount(connection, targetPostId);
    } else {
      assertNotSelfReport(reporterId, targetUserId, "cannot report yourself");

      const target = await repo.findUserReportTarget(connection, targetUserId);
      if (!target) throw httpError(404, "target user not found");

      finalTargetUserId = target.user_id;
      targetName = target.nickname;
      targetProfileImg = target.profile_img;
      reportCount = await repo.incrementUserReportCount(
        connection,
        finalTargetUserId,
      );
    }

    const id = await repo.createReport(connection, {
      reporterId,
      targetUserId: finalTargetUserId,
      targetPostId,
      targetCommentId,
      reportType,
      targetTitle: normalizedTargetTitle,
      targetExcerpt: normalizedTargetExcerpt,
      reason,
      content,
    });

    await connection.commit();

    return {
      id,
      reportType,
      targetUserId: finalTargetUserId,
      targetName,
      targetProfileImg,
      targetPostId: targetPostId || null,
      targetCommentId: targetCommentId || null,
      targetTitle: normalizedTargetTitle,
      targetExcerpt: normalizedTargetExcerpt,
      reason,
      content,
      status: "pending",
      reportCount,
      createdAt: new Date().toISOString(),
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};
