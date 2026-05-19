import cors from "cors";
import express from "express";
import http from "http";
import { Server } from "socket.io";

import { env } from "./config/env.js";
import chatRoutes from "./routes/chat.js";
import friendsRoutes from "./routes/friends.js";
import postRoutes from "./routes/post.js";
import reportRoutes from "./routes/report.js";
import userRoutes from "./routes/user.js";
import { registerChatSocket } from "./socket/chat.socket.js";
import { startPostDeletionJob } from "./workers/deleteExpiredPosts.js";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: env.clientOrigins,
    methods: ["GET", "POST"],
  },
});

app.set("io", io);

app.use(cors({ origin: env.clientOrigins }));
app.use(express.json());

app.use("/friends", friendsRoutes);
app.use("/posts", postRoutes);
app.use("/reports", reportRoutes);
app.use("/users", userRoutes);
app.use("/chat", chatRoutes);

app.set("io", io);

registerChatSocket(io);

startPostDeletionJob(io);

server.listen(env.port, () => {
  console.log(`Server running on ${env.port}`);
});
