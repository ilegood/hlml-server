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
  waitForConnections: true,
  connectionLimit: 10,
  maxIdle: 10,
  idleTimeout: 60000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
});

const RETRYABLE_DB_ERRORS = new Set([
  "ECONNRESET",
  "PROTOCOL_CONNECTION_LOST",
  "ETIMEDOUT",
  "EPIPE",
]);

const rawQuery = pool.query.bind(pool);

export const query = async (sql, params) => {
  try {
    return await rawQuery(sql, params);
  } catch (error) {
    if (!RETRYABLE_DB_ERRORS.has(error.code)) throw error;
    console.warn(`Retrying DB query after ${error.code}`);
    return rawQuery(sql, params);
  }
};

pool.query = query;

export default pool;
