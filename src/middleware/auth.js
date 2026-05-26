import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export const auth = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ message: "인증 헤더가 없습니다." });
    }

    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : authHeader.trim();

    if (!token) {
      return res.status(401).json({ message: "인증 토큰이 없습니다." });
    }

    const decoded = jwt.verify(token, env.jwtSecret);
    req.userId = decoded.userId ?? decoded.user_id ?? decoded.sub;

    if (!req.userId) {
      return res.status(401).json({ message: "유효한 사용자 정보를 찾을 수 없습니다." });
    }

    next();
  } catch (error) {
    console.error("Auth failed:", error.name, error.message);
    return res.status(401).json({ message: "유효하지 않은 토큰입니다." });
  }
};

export const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return next();

  try {
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : authHeader.trim();
    if (token) {
      const decoded = jwt.verify(token, env.jwtSecret);
      req.userId = decoded.userId ?? decoded.user_id ?? decoded.sub;
    }
  } catch {
    req.userId = null;
  }
  next();
};

export default auth;
