import express from "express";
import {
  getRelationships,
  createRelationship,
  deleteRelationship,
} from "../controllers/relationship.js";
import { verifyToken } from "../middleware/jwtMiddleware.js";

const router = express.Router();

router.get("/:uid", getRelationships);
router.post("/:uid", verifyToken, createRelationship);
router.delete("/:uid", verifyToken, deleteRelationship);

export default router;
