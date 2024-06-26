import express from "express";
import { verifyToken } from "../middleware/jwtMiddleware.js";
import {
  getSavedPostIds,
  getSavedPosts,
  savePost,
  unsavePost,
} from "../controllers/save.js";

const router = express.Router();

router.get("/", verifyToken, getSavedPosts);
router.get("/ids", verifyToken, getSavedPostIds);
router.post("/:postId", verifyToken, savePost);
router.delete("/:postId", verifyToken, unsavePost);

export default router;
