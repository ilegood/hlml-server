import express from "express";
import path from "path";
import { fileURLToPath } from 'url';
import usersRouter from "./routes/users.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "http://localhost:5173");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.header("Access-Control-Allow-Credentials", "true");

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});

app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

app.use("/users", usersRouter);

app.listen(4000, () => {
  console.log("4000번 포트에서 서버 열림");
});
