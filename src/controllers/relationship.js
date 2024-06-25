import {
  createRelationshipQuery,
  deleteRelationshipQuery,
  getRelationshipsQuery,
} from "../queries.js";
import pool from "../../db.js";

export async function getRelationships(req, res) {
  const { uid } = req.params;

  try {
    const result = await pool.query(getRelationshipsQuery, [uid]);
    res.status(200).json(result.rows.map((row) => row.followerUserId));
  } catch (error) {
    res.status(500).send("Server error");
  }
}

export async function createRelationship(req, res) {
  const { uid } = req.params;
  const userInfo = req.userInfo;

  try {
    await pool.query(createRelationshipQuery, [userInfo.id, uid]);
    res.status(201).send("Relationship created");
  } catch (error) {
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
    res.status(500).send("Server error");
  }
}
