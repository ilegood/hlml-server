import mysql from "mysql2/promise";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// .env 파일이 프로젝트 루트(src 밖)에 있는 경우 아래 설정이 맞습니다.
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const dbConfig = {
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_DATABASE || "hlml",
  port: process.env.DB_PORT || 3306,
};

const pool = mysql.createPool(dbConfig);
export default pool;
