import express from "express";
import {
  createPost,
  deletePost,
  editPost,
  getPosts,
} from "../controllers/post.js";
import { verifyToken } from "../middleware/jwtMiddleware.js";
import { validateIdParam } from "../utils/validate.js";

const router = express.Router();

router.param("postId", validateIdParam);

router.get("/", verifyToken, getPosts);
router.post("/", verifyToken, createPost);
router.patch("/:postId", verifyToken, editPost);
router.delete("/:postId", verifyToken, deletePost);

export default router;
