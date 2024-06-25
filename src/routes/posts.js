import express from "express";
import { createPost, getPosts, deletePost } from "../controllers/post.js";
import { verifyToken } from "../middleware/jwtMiddleware.js";

const router = express.Router();

router.get("/", verifyToken, getPosts);
router.post("/", verifyToken, createPost);
router.delete("/:postId", verifyToken, deletePost);

export default router;
