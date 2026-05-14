import pool from "./src/db.js";

try {
  const [rows] = await pool.query("SELECT 1 + 1 AS result");
  console.log("Database connection successful:", rows[0].result === 2);
  process.exit(0);
} catch (err) {
  console.error("Database connection failed:", err);
  process.exit(1);
}
