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

const deleteByIds = async (connection, sql, ids) => {
  if (!ids.length) return;
  await connection.query(sql, [ids]);
};

const purgeDeletedUsers = async (connection) => {
  const [deletedUsers] = await connection.query(
    "SELECT user_id FROM users WHERE is_deleted = TRUE",
  );
  const deletedUserIds = deletedUsers.map((user) => user.user_id);
  if (deletedUserIds.length === 0) return;

  const [authoredPosts] = await connection.query(
    "SELECT post_id FROM posts WHERE user_id IN (?)",
    [deletedUserIds],
  );
  const [dmRooms] = await connection.query(
    "SELECT id FROM dm_rooms WHERE user1_id IN (?) OR user2_id IN (?)",
    [deletedUserIds, deletedUserIds],
  );
  const [joinedPosts] = await connection.query(
    `SELECT DISTINCT pp.post_id
     FROM post_participants pp
     JOIN posts p ON p.post_id = pp.post_id
     WHERE pp.user_id IN (?) AND p.user_id NOT IN (?)`,
    [deletedUserIds, deletedUserIds],
  );
  const roomKeysToDelete = [
    ...authoredPosts.map((post) => String(post.post_id)),
    ...dmRooms.map((room) => `dm_${room.id}`),
  ];

  await deleteByIds(
    connection,
    `DELETE mr FROM message_reactions mr
     JOIN messages m ON mr.message_id = m.id
     WHERE m.room_id IN (?)`,
    roomKeysToDelete,
  );
  await deleteByIds(
    connection,
    `DELETE mrd FROM message_reads mrd
     JOIN messages m ON mrd.message_id = m.id
     WHERE m.room_id IN (?)`,
    roomKeysToDelete,
  );
  await deleteByIds(
    connection,
    "DELETE FROM messages WHERE room_id IN (?)",
    roomKeysToDelete,
  );

  await connection.query(
    `DELETE mr FROM message_reactions mr
     JOIN messages m ON mr.message_id = m.id
     WHERE m.user_id IN (?) OR mr.user_id IN (?)`,
    [deletedUserIds, deletedUserIds],
  );
  await connection.query(
    `DELETE mrd FROM message_reads mrd
     JOIN messages m ON mrd.message_id = m.id
     WHERE m.user_id IN (?) OR mrd.user_id IN (?)`,
    [deletedUserIds, deletedUserIds],
  );
  await connection.query("DELETE FROM messages WHERE user_id IN (?)", [
    deletedUserIds,
  ]);
  await connection.query(
    "DELETE FROM dm_rooms WHERE user1_id IN (?) OR user2_id IN (?)",
    [deletedUserIds, deletedUserIds],
  );
  await connection.query("DELETE FROM password_reset_tokens WHERE user_id IN (?)", [
    deletedUserIds,
  ]);
  await connection.query("DELETE FROM appointment_completions WHERE user_id IN (?)", [
    deletedUserIds,
  ]);
  await connection.query(
    "DELETE FROM reports WHERE reporter_id IN (?) OR target_id IN (?)",
    [deletedUserIds, deletedUserIds],
  );
  await connection.query("DELETE FROM post_bans WHERE user_id IN (?)", [
    deletedUserIds,
  ]);
  await connection.query("DELETE FROM post_likes WHERE user_id IN (?)", [
    deletedUserIds,
  ]);
  await connection.query("DELETE FROM comments WHERE user_id IN (?)", [
    deletedUserIds,
  ]);
  await connection.query("DELETE FROM post_participants WHERE user_id IN (?)", [
    deletedUserIds,
  ]);
  for (const post of joinedPosts) {
    const [[participantCount]] = await connection.query(
      "SELECT COUNT(*) AS count FROM post_participants WHERE post_id = ?",
      [post.post_id],
    );
    const [[postRow]] = await connection.query(
      "SELECT capacity FROM posts WHERE post_id = ?",
      [post.post_id],
    );
    if (!postRow) continue;
    const participants = 1 + Number(participantCount.count || 0);
    const status =
      participants >= (postRow.capacity || 2) ? "\ubaa8\uc9d1\uc644\ub8cc" : "\ubaa8\uc9d1\uc911";
    await connection.query(
      "UPDATE posts SET participants = ?, status = ? WHERE post_id = ?",
      [participants, status, post.post_id],
    );
  }
  await connection.query(
    "DELETE FROM user_relations WHERE requester_id IN (?) OR target_id IN (?)",
    [deletedUserIds, deletedUserIds],
  );
  await connection.query("DELETE FROM posts WHERE user_id IN (?)", [deletedUserIds]);
  await connection.query("DELETE FROM users WHERE user_id IN (?)", [deletedUserIds]);
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

    await addColumnIfMissing(connection, "posts", "is_deleted", "BOOLEAN DEFAULT FALSE");
    await addColumnIfMissing(
      connection,
      "messages",
      "is_deleted",
      "BOOLEAN DEFAULT FALSE",
    );
    await addColumnIfMissing(
      connection,
      "messages",
      "is_edited",
      "BOOLEAN DEFAULT FALSE",
    );

    await connection.query(
      `CREATE TABLE IF NOT EXISTS message_reactions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        message_id INT NOT NULL,
        user_id INT NOT NULL,
        emoji VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_reaction (message_id, user_id, emoji),
        INDEX idx_message_reactions_user_id (user_id)
      )`,
    );

    await connection.query(
      `CREATE TABLE IF NOT EXISTS message_reads (
        id INT AUTO_INCREMENT PRIMARY KEY,
        message_id INT NOT NULL,
        user_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_read (message_id, user_id),
        INDEX idx_message_reads_user_id (user_id)
      )`,
    );

    await connection.query(
      `CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        token_hash VARCHAR(255) NOT NULL,
        expires_at DATETIME NOT NULL,
        used_at DATETIME NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_password_reset_tokens_token_hash (token_hash),
        INDEX idx_password_reset_tokens_user_id (user_id),
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
      )`,
    );

    await connection.query(
      `CREATE TABLE IF NOT EXISTS post_bans (
        id INT AUTO_INCREMENT PRIMARY KEY,
        post_id INT NOT NULL,
        user_id INT NOT NULL,
        is_hidden BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_ban (post_id, user_id),
        FOREIGN KEY (post_id) REFERENCES posts(post_id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
      )`,
    );

    await addColumnIfMissing(connection, "users", "report_count", "INT DEFAULT 0");
    await addColumnIfMissing(connection, "users", "is_verified", "BOOLEAN DEFAULT TRUE");
    await addColumnIfMissing(connection, "posts", "report_count", "INT DEFAULT 0");
    await addColumnIfMissing(connection, "posts", "is_author_hidden", "BOOLEAN DEFAULT FALSE");
    await addColumnIfMissing(connection, "post_participants", "is_hidden", "BOOLEAN DEFAULT FALSE");
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

    await purgeDeletedUsers(connection);
  } finally {
    connection.release();
  }
};
