import express from "express";
import { getLikes, createLike, deleteLike } from "../controllers/like.js";

const router = express.Router();

router.get("/:postId", getLikes);
router.post("/:postId", createLike);
router.delete("/:postId", deleteLike);

export default router;
