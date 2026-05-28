import pool from "./db.js";
import { ensureRuntimeSchema } from "./dbSchema.js";

try {
  await ensureRuntimeSchema();
  console.log("Runtime schema ready.");
  await pool.end();
  process.exit(0);
} catch (err) {
  console.error("Error preparing runtime schema:", err);
  await pool.end();
  process.exit(1);
}
