import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pool from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const initializeDatabase = async () => {
  try {
    console.log("Initializing database...");

    const schemaPath = path.join(__dirname, "../schema.sql");
    const schema = fs.readFileSync(schemaPath, "utf8");

    // Split schema into individual statements
    const statements = schema
      .split(/;\s*$/m)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const statement of statements) {
      if (statement.startsWith("--")) continue; // Skip comments

      // We use IF NOT EXISTS where possible in manual SQL, 
      // but schema.sql might not have them. 
      // For simplicity, we wrap each statement in a try-catch 
      // or handle table creation check.
      try {
        await pool.query(statement);
      } catch (err) {
        // Ignore "table already exists" errors
        if (err.code === "ER_TABLE_EXISTS_ERROR") {
          continue;
        }
        // Also ignore "duplicate column name" if we manually added columns
        if (err.code === "ER_DUP_FIELDNAME") {
          continue;
        }
        console.warn(`Warning executing statement: ${statement.slice(0, 50)}...`);
        console.warn(err.message);
      }
    }

    // Special check for 'comments' table 'image' column which was added later
    try {
      await pool.query("ALTER TABLE comments ADD COLUMN image VARCHAR(500) DEFAULT NULL");
      console.log("Added image column to comments table.");
    } catch (err) {
      if (err.code !== "ER_DUP_FIELDNAME") {
        console.error("Error adding image column to comments:", err.message);
      }
    }

    console.log("Database initialization completed successfully.");
    process.exit(0);
  } catch (err) {
    console.error("Database initialization failed:", err);
    process.exit(1);
  }
};

initializeDatabase();
