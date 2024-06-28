import express from "express";
import { verifyToken } from "../middleware/jwtMiddleware.js";
import {
  createGroup,
  createGroupComment,
  createGroupPost,
  createGroupPostLike,
  deleteGroup,
  deleteGroupPost,
  deleteGroupPostLike,
  getGroupComments,
  getGroupMembers,
  getGroupPostLikes,
  getGroupPosts,
  getGroupSavedPostIds,
  getGroupSavedPosts,
  getJoinedGroups,
  getUnjoinedGroups,
  joinGroup,
  leaveGroup,
  saveGroupPost,
  unsaveGroupPost,
} from "../controllers/group.js";

const router = express.Router();

router.post("/", verifyToken, createGroup);
router.delete("/:groupId/delete", verifyToken, deleteGroup);
router.get("/joined", verifyToken, getJoinedGroups);
router.get("/unjoined", verifyToken, getUnjoinedGroups);
router.post("/:groupId", verifyToken, joinGroup);
router.delete("/:groupId", verifyToken, leaveGroup);

router.get("/:groupId/members", verifyToken, getGroupMembers);

router.get("/:groupId/posts", verifyToken, getGroupPosts);
router.post("/:groupId/posts", verifyToken, createGroupPost);
router.delete("/posts/:postId", verifyToken, deleteGroupPost);

router.get("/:postId/comments", verifyToken, getGroupComments);
router.post("/:postId/comments", verifyToken, createGroupComment);

router.get("/:postId/likes", verifyToken, getGroupPostLikes);
router.post("/:postId/likes", verifyToken, createGroupPostLike);
router.delete("/:postId/likes", verifyToken, deleteGroupPostLike);

router.post("/save/:postId", verifyToken, saveGroupPost);
router.get("/save", verifyToken, getGroupSavedPosts);
router.get("/save/ids", verifyToken, getGroupSavedPostIds);
router.delete("/save/:postId", verifyToken, unsaveGroupPost);

export default router;
