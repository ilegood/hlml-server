import jwt from "jsonwebtoken";
import "dotenv/config";

const authMiddleware = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ message: "인증 헤더가 없습니다." });
    }

    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(token, process.env.SECRET_KEY);
    req.userId = decoded.userId;

    next();
  } catch (error) {
    return res.status(401).json({ message: "유효하지 않은 토큰입니다" });
  }
};

export default authMiddleware;
