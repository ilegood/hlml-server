import express from "express";

import usersRouter from "./routes/users.js";

const app = express();

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "http://localhost:5173");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  next();
});

app.use(express.json());

app.use("/users", usersRouter);

app.listen(4000, () => {
  console.log("4000번 포트에서 서버 열림");
});
