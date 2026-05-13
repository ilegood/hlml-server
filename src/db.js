import mysql from "mysql2/promise";
import { env } from "./config/env.js";

const pool = mysql.createPool({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.database,
  dateStrings: true,
  ssl: env.db.ssl,
  ssl: { rejectUnauthorized: false },
});

export default pool;
