import express from "express";
import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: "",
  port: 3306,
  user: "",
  password: "",
  database: "",
});

const app = express();

app.use(express.json());

app.listen(4000, () => {
  console.log("Server is running on port 4000");
});
