import express from "express";
import { verifyToken } from "../middleware/jwtMiddleware.js";
import {
  createGroup,
  getJoinedGroups,
  getUnjoinedGroups,
  joinGroup,
} from "../controllers/group.js";

const router = express.Router();

router.post("/", verifyToken, createGroup);
router.get("/joined", verifyToken, getJoinedGroups);
router.get("/unjoined", verifyToken, getUnjoinedGroups);
router.post("/:groupId", verifyToken, joinGroup);

export default router;
