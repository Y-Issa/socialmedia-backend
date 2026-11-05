import express from "express";
import "dotenv/config";
import cors from "cors";

import upload from "./src/config/multerConfig.js";
import { verifyToken } from "./src/middleware/jwtMiddleware.js";
import usersRouter from "./src/routes/users.js";
import postsRouter from "./src/routes/posts.js";
import likesRouter from "./src/routes/likes.js";
import commentsRouter from "./src/routes/comments.js";
import authRouter from "./src/routes/auth.js";
import relationshipsRouter from "./src/routes/relationships.js";
import saveRouter from "./src/routes/save.js";
import groupsRouter from "./src/routes/groups.js";

const app = express();
const PORT = process.env.PORT || 8001;
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";

app.use(express.json());
app.use(
  cors({
    origin: CLIENT_URL,
    credentials: true,
  })
);

app.post("/api/upload", verifyToken, (req, res) => {
  upload.single("file")(req, res, (err) => {
    if (err) {
      return res.status(400).send(err.message);
    }
    if (!req.file) {
      return res.status(400).send("No file uploaded");
    }
    res.status(200).send(req.file.filename);
  });
});

app.use("/public/upload", express.static("public/upload"));

app.use("/api/users", usersRouter);
app.use("/api/posts", postsRouter);
app.use("/api/likes", likesRouter);
app.use("/api/comments", commentsRouter);
app.use("/api/auth", authRouter);
app.use("/api/relationships", relationshipsRouter);
app.use("/api/save", saveRouter);
app.use("/api/groups", groupsRouter);

// Unknown API routes.
app.use("/api", (req, res) => {
  res.status(404).send("Not found");
});

// Final error handler: anything thrown or passed to next(error) ends up here.
// eslint-disable-next-line no-unused-vars
app.use((error, req, res, next) => {
  if (error.type === "entity.parse.failed") {
    return res.status(400).send("Invalid JSON body");
  }
  if (error.type === "entity.too.large") {
    return res.status(413).send("Request body is too large");
  }
  console.error(`${req.method} ${req.originalUrl}:`, error);
  if (res.headersSent) {
    return next(error);
  }
  res.status(500).send("Server error");
});

app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
