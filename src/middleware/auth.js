import jwt from "jsonwebtoken";
import "dotenv/config";

const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "인증 필요" });

  try {
    const decoded = jwt.verify(token, process.env.SECRET_KEY);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    res.status(401).json({ message: "유효하지 않은 토큰" });
  }
};

export default authMiddleware;
