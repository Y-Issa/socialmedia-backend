import express from "express";
import {
  getRelationships,
  createRelationship,
  deleteRelationship,
} from "../controllers/relationship.js";

const router = express.Router();

router.get("/:uid", getRelationships);
router.post("/:uid", createRelationship);
router.delete("/:uid", deleteRelationship);

export default router;
