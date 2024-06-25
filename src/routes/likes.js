import express from "express";
import { getLikes, createLike, deleteLike } from "../controllers/like.js";
import { verifyToken } from "../middleware/jwtMiddleware.js";

const router = express.Router();

router.get("/:postId", getLikes);
router.post("/:postId", verifyToken, createLike);
router.delete("/:postId", verifyToken, deleteLike);

export default router;
