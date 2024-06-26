import express from "express";
import "dotenv/config";
import cors from "cors";

import upload from "./src/config/multerConfig.js";
import usersRouter from "./src/routes/users.js";
import postsRouter from "./src/routes/posts.js";
import likesRouter from "./src/routes/likes.js";
import commentsRouter from "./src/routes/comments.js";
import authRouter from "./src/routes/auth.js";
import relationshipsRouter from "./src/routes/relationships.js";
import saveRouter from "./src/routes/save.js";
import groupsRouter from "./src/routes/groups.js";

const app = express();

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Credentials", true);
  next();
});

app.use(express.json());
app.use(
  cors({
    origin: "http://localhost:5173",
  })
);

app.post("/api/upload", upload.single("file"), (req, res) => {
  res.status(200).send(req.file.filename);
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

app.listen(process.env.PORT, () => {
  console.log("API WORKING!");
});
