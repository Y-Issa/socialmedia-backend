import express from "express";
import { createComment, getComments } from "../controllers/comment.js";
import { verifyToken } from "../middleware/jwtMiddleware.js";

const router = express.Router();

router.get("/:postId", getComments);
router.post("/:postId", verifyToken, createComment);

export default router;
