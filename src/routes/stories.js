import express from "express";
import { verifyToken } from "../middleware/jwtMiddleware.js";
import { validateIdParam } from "../utils/validate.js";
import {
  createStory,
  deleteStory,
  getStoryFeed,
  getStoryViewers,
  viewStory,
} from "../controllers/story.js";

const router = express.Router();

router.param("storyId", validateIdParam);

router.get("/feed", verifyToken, getStoryFeed);
router.post("/", verifyToken, createStory);
router.post("/:storyId/view", verifyToken, viewStory);
router.get("/:storyId/viewers", verifyToken, getStoryViewers);
router.delete("/:storyId", verifyToken, deleteStory);

export default router;
