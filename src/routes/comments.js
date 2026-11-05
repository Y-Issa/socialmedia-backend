import express from "express";
import { createComment, getComments } from "../controllers/comment.js";
import { verifyToken } from "../middleware/jwtMiddleware.js";
import { validateIdParam } from "../utils/validate.js";

const router = express.Router();

router.param("postId", validateIdParam);

router.get("/:postId", verifyToken, getComments);
router.post("/:postId", verifyToken, createComment);

export default router;
