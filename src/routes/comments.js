import express from "express";
import { createComment, getComments } from "../controllers/comment.js";

const router = express.Router();

router.get("/:postId", getComments);
router.post("/:postId", createComment);

export default router;
