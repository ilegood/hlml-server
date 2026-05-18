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

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000; // 1 second

const rawQuery = pool.query.bind(pool);

export const query = async (sql, params) => {
  let retries = 0;
  while (retries < MAX_RETRIES) {
    try {
      return await rawQuery(sql, params);
    } catch (error) {
      if (!RETRYABLE_DB_ERRORS.has(error.code)) throw error;

      retries++;
      console.warn(
        `Retrying DB query after ${error.code}. Attempt ${retries}/${MAX_RETRIES}`
      );

      if (retries < MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      } else {
        throw error; // Re-throw if max retries reached
      }
    }
  }
};

pool.query = query;

export default pool;
