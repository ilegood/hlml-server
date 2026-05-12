import pool from "./db.js";

const createTable = async () => {
  try {
    console.log("Checking and creating dm_rooms table...");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS dm_rooms (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        user1_id    INT NOT NULL,
        user2_id    INT NOT NULL,
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_dm (user1_id, user2_id),
        FOREIGN KEY (user1_id) REFERENCES users(user_id) ON DELETE CASCADE,
        FOREIGN KEY (user2_id) REFERENCES users(user_id) ON DELETE CASCADE
      )
    `);
    console.log("dm_rooms table ready.");
    process.exit(0);
  } catch (err) {
    console.error("Error creating table:", err);
    process.exit(1);
  }
};

createTable();
