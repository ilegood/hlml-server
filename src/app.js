import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import pool from "./db.js";
import path from "path";
import { fileURLToPath } from "url";
import userRouter from "./routes/user.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors());
app.use(express.json());
// uploads 폴더를 정적 파일로 서빙
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// 라우터 연결
app.use("/users", userRouter);

// DB 연결 테스트
app.get("/test", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT 1");
    res.json({ message: "Database connected successfully", rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(4000, () => {
  console.log("Server is running on port 4000");
});
