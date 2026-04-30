import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

import postRoutes from "./routes/post.js";
import userRoutes from "./routes/user.js";

dotenv.config();

const app = express();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(cors());
app.use(express.json());

// static
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// routes
app.use("/posts", postRoutes);
app.use("/users", userRoutes);

app.listen(4000, () => {
  console.log("Server running on 4000");
});
