import cors from "cors";
import express from "express";
import http from "http";
import multer from "multer";
import path from "path";
import { Server } from "socket.io";
import { fileURLToPath, pathToFileURL } from "url";

import { env } from "./config/env.js";
import { ensureRuntimeSchema } from "./dbSchema.js";
import chatRoutes from "./routes/chat.js";
import friendsRoutes from "./routes/friends.js";
import postRoutes from "./routes/post.js";
import reportRoutes from "./routes/report.js";
import userRoutes from "./routes/user.js";
import pool from "./db.js";
import { registerChatSocket } from "./socket/chat.socket.js";
import { startAppointmentReminderJob } from "./workers/appointmentReminders.js";
import { startPostDeletionJob } from "./workers/deleteExpiredPosts.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ensureMissingColumns = async () => {
  const tables = [
    { table: "posts", column: "is_deleted", type: "BOOLEAN DEFAULT FALSE" },
    { table: "messages", column: "is_deleted", type: "BOOLEAN DEFAULT FALSE" },
    { table: "messages", column: "is_edited", type: "BOOLEAN DEFAULT FALSE" },
  ];
  for (const { table, column, type } of tables) {
    try {
      await pool.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    } catch (err) {
      if (err.errno !== 1060)
        console.warn(`Failed to add ${table}.${column}:`, err.message);
    }
  }
  const extraTables = [
    `CREATE TABLE IF NOT EXISTS dm_rooms (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      user1_id    INT NOT NULL,
      user2_id    INT NOT NULL,
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_dm (user1_id, user2_id)
    )`,
    `CREATE TABLE IF NOT EXISTS message_reactions (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      message_id  INT NOT NULL,
      user_id     INT NOT NULL,
      emoji       VARCHAR(50) NOT NULL,
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_reaction (message_id, user_id, emoji),
      INDEX idx_message_reactions_user_id (user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS message_reads (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      message_id  INT NOT NULL,
      user_id     INT NOT NULL,
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_read (message_id, user_id),
      INDEX idx_message_reads_user_id (user_id)
    )`,
  ];
  for (const ddl of extraTables) {
    try {
      await pool.query(ddl);
    } catch (err) {
      console.warn("Failed to create table:", err.message);
    }
  }
};

export const createApp = () => {
  const app = express();

  app.use("/uploads", express.static(path.join(__dirname, "../../uploads")));
  app.use(cors({ origin: env.clientOrigins }));
  app.use(express.json());

  app.use("/friends", friendsRoutes);
  app.use("/posts", postRoutes);
  app.use("/reports", reportRoutes);
  app.use("/users", userRoutes);
  app.use("/chat", chatRoutes);

  app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
      const message =
        err.code === "LIMIT_FILE_SIZE"
          ? "Uploaded file exceeds the size limit."
          : "File upload failed.";
      return res.status(400).json({ message });
    }

    if (err?.message === "Only image files are allowed") {
      return res.status(400).json({ message: "Only image files are allowed." });
    }

    console.error("Unhandled request error:", err);
    return res.status(err?.status || 500).json({
      message: err?.status ? err.message : "Internal server error.",
    });
  });

  return app;
};

export const createServer = (app = createApp()) => {
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: env.clientOrigins,
      methods: ["GET", "POST"],
    },
  });

  app.set("io", io);
  return { app, server, io };
};

export const startServer = async () => {
  await ensureMissingColumns();
  await ensureRuntimeSchema();

  const { server, io } = createServer();

  registerChatSocket(io);
  startAppointmentReminderJob(io);
  startPostDeletionJob(io);

  server.listen(env.port, () => {
    console.log(`Server running on ${env.port}`);
  });

  return server;
};

const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  startServer().catch((error) => {
    console.error("Server startup failed:", error);
    process.exit(1);
  });
}
