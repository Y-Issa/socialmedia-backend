import express from "express";
import {
  createComment,
  deleteComment,
  getComments,
} from "../controllers/comment.js";
import { verifyToken } from "../middleware/jwtMiddleware.js";
import { validateIdParam } from "../utils/validate.js";

const router = express.Router();

router.param("postId", validateIdParam);
router.param("commentId", validateIdParam);

router.get("/:postId", verifyToken, getComments);
router.post("/:postId", verifyToken, createComment);
router.delete("/:commentId", verifyToken, deleteComment);

export default router;
