import {
  createRelationshipQuery,
  deleteRelationshipQuery,
  getRelationshipsQuery,
} from "../queries.js";
import pool from "../../db.js";
import { isForeignKeyViolation } from "../utils/validate.js";

export async function getRelationships(req, res) {
  const { uid } = req.params;

  try {
    const result = await pool.query(getRelationshipsQuery, [uid]);
    res.status(200).json(result.rows.map((row) => row.followerUserId));
  } catch (error) {
    console.error("getRelationships:", error);
    res.status(500).send("Server error");
  }
}

export async function createRelationship(req, res) {
  const { uid } = req.params;
  const userInfo = req.userInfo;

  if (uid === userInfo.id) {
    return res.status(400).send("You can't follow yourself");
  }

  try {
    await pool.query(createRelationshipQuery, [userInfo.id, uid]);
    res.status(201).send("Relationship created");
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      return res.status(404).send("User not found");
    }
    console.error("createRelationship:", error);
    res.status(500).send("Server error");
  }
}

export async function deleteRelationship(req, res) {
  const { uid } = req.params;
  const userInfo = req.userInfo;

  try {
    await pool.query(deleteRelationshipQuery, [userInfo.id, uid]);
    res.status(200).send("Relationship deleted");
  } catch (error) {
    console.error("deleteRelationship:", error);
    res.status(500).send("Server error");
  }
}
