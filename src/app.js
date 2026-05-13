import cors from "cors";
import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { Server } from "socket.io";

import { env } from "./config/env.js";
import postRoutes from "./routes/post.js";
import userRoutes from "./routes/user.js";
import { registerChatSocket } from "./socket/chat.socket.js";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: env.clientOrigins,
    methods: ["GET", "POST"],
  },
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(
  cors({
    origin: env.clientOrigins,
  }),
);
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use("/posts", postRoutes);
app.use("/users", userRoutes);

registerChatSocket(io);

server.listen(env.port, () => {
  console.log(`Server running on ${env.port}`);
});
