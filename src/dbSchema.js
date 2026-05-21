import pool from "./db.js";

const columnExists = async (connection, table, column) => {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS count
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = ?
       AND column_name = ?`,
    [table, column],
  );
  return Number(rows[0]?.count || 0) > 0;
};

const indexExists = async (connection, table, indexName) => {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS count
     FROM information_schema.statistics
     WHERE table_schema = DATABASE()
       AND table_name = ?
       AND index_name = ?`,
    [table, indexName],
  );
  return Number(rows[0]?.count || 0) > 0;
};

const foreignKeyExists = async (connection, table, column) => {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS count
     FROM information_schema.key_column_usage
     WHERE table_schema = DATABASE()
       AND table_name = ?
       AND column_name = ?
       AND referenced_table_name IS NOT NULL`,
    [table, column],
  );
  return Number(rows[0]?.count || 0) > 0;
};

const addColumnIfMissing = async (connection, table, column, definition) => {
  if (await columnExists(connection, table, column)) return;
  await connection.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
};

const addIndexIfMissing = async (connection, table, indexName, columns) => {
  if (await indexExists(connection, table, indexName)) return;
  await connection.query(`ALTER TABLE ${table} ADD INDEX ${indexName} (${columns})`);
};

const addForeignKeyIfMissing = async (
  connection,
  table,
  column,
  constraintName,
  definition,
) => {
  if (await foreignKeyExists(connection, table, column)) return;
  await connection.query(
    `ALTER TABLE ${table} ADD CONSTRAINT ${constraintName} ${definition}`,
  );
};

export const ensureRuntimeSchema = async () => {
  const connection = await pool.getConnection();

  try {
    await connection.query(
      `CREATE TABLE IF NOT EXISTS appointment_completions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        post_id INT NOT NULL,
        completed_at DATETIME NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_appointment_completion (user_id, post_id),
        INDEX idx_appointment_completions_user_id (user_id),
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
      )`,
    );

    await connection.query(
      `CREATE TABLE IF NOT EXISTS dm_rooms (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user1_id INT NOT NULL,
        user2_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_dm (user1_id, user2_id),
        FOREIGN KEY (user1_id) REFERENCES users(user_id) ON DELETE CASCADE,
        FOREIGN KEY (user2_id) REFERENCES users(user_id) ON DELETE CASCADE
      )`,
    );

    await addColumnIfMissing(connection, "users", "report_count", "INT DEFAULT 0");
    await addColumnIfMissing(connection, "posts", "report_count", "INT DEFAULT 0");
    await addColumnIfMissing(
      connection,
      "comments",
      "image",
      "VARCHAR(500) DEFAULT NULL",
    );

    await connection.query(
      `CREATE TABLE IF NOT EXISTS reports (
        id INT AUTO_INCREMENT PRIMARY KEY,
        reporter_id INT NOT NULL,
        target_id INT NOT NULL,
        post_id INT DEFAULT NULL,
        comment_id INT DEFAULT NULL,
        report_type VARCHAR(20) NOT NULL DEFAULT 'user',
        target_post_id INT NULL,
        target_comment_id INT NULL,
        target_title VARCHAR(255) NULL,
        target_excerpt TEXT NULL,
        reason VARCHAR(100) NOT NULL,
        content TEXT NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (reporter_id) REFERENCES users(user_id) ON DELETE CASCADE,
        FOREIGN KEY (target_id) REFERENCES users(user_id) ON DELETE CASCADE,
        FOREIGN KEY (post_id) REFERENCES posts(post_id) ON DELETE CASCADE,
        FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE,
        INDEX idx_reports_reporter_id (reporter_id),
        INDEX idx_reports_target_id (target_id),
        INDEX idx_reports_post_id (post_id),
        INDEX idx_reports_comment_id (comment_id)
      )`,
    );

    await addColumnIfMissing(connection, "reports", "post_id", "INT DEFAULT NULL");
    await addColumnIfMissing(
      connection,
      "reports",
      "comment_id",
      "INT DEFAULT NULL",
    );
    await addColumnIfMissing(
      connection,
      "reports",
      "report_type",
      "VARCHAR(20) NOT NULL DEFAULT 'user'",
    );
    await addColumnIfMissing(
      connection,
      "reports",
      "target_post_id",
      "INT NULL",
    );
    await addColumnIfMissing(
      connection,
      "reports",
      "target_comment_id",
      "INT NULL",
    );
    await addColumnIfMissing(
      connection,
      "reports",
      "target_title",
      "VARCHAR(255) NULL",
    );
    await addColumnIfMissing(
      connection,
      "reports",
      "target_excerpt",
      "TEXT NULL",
    );
    await addIndexIfMissing(connection, "reports", "idx_reports_post_id", "post_id");
    await addIndexIfMissing(
      connection,
      "reports",
      "idx_reports_comment_id",
      "comment_id",
    );
    await addForeignKeyIfMissing(
      connection,
      "reports",
      "post_id",
      "fk_reports_post_id",
      "FOREIGN KEY (post_id) REFERENCES posts(post_id) ON DELETE CASCADE",
    );
    await addForeignKeyIfMissing(
      connection,
      "reports",
      "comment_id",
      "fk_reports_comment_id",
      "FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE",
    );
  } finally {
    connection.release();
  }
};
