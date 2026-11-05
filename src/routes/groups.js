import express from "express";
import { verifyToken } from "../middleware/jwtMiddleware.js";
import {
  createGroup,
  createGroupPost,
  deleteGroup,
  getGroup,
  getGroupMembers,
  getGroupPosts,
  getJoinedGroups,
  getUnjoinedGroups,
  joinGroup,
  leaveGroup,
} from "../controllers/group.js";
import { validateIdParam } from "../utils/validate.js";

const router = express.Router();

// Every :groupId must be a UUID (400 "Invalid id" otherwise).
router.param("groupId", validateIdParam);

router.post("/", verifyToken, createGroup);
router.delete("/:groupId/delete", verifyToken, deleteGroup);
router.get("/joined", verifyToken, getJoinedGroups);
router.get("/unjoined", verifyToken, getUnjoinedGroups);
router.post("/:groupId", verifyToken, joinGroup);
router.delete("/:groupId", verifyToken, leaveGroup);

router.get("/:groupId/members", verifyToken, getGroupMembers);

router.get("/:groupId/posts", verifyToken, getGroupPosts);
router.post("/:groupId/posts", verifyToken, createGroupPost);

// Group posts are ordinary posts with a groupId: like, comment, save and
// delete them through /api/likes, /api/comments, /api/save and /api/posts.

// Registered last so the static GET routes above (/joined, /unjoined) are
// matched first.
router.get("/:groupId", verifyToken, getGroup);

export default router;
