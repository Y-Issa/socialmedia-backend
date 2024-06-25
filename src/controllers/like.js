import { createLikeQuery, deleteLikeQuery, getLikesQuery } from "../queries.js";
import pool from "../../db.js";

export async function getLikes(req, res) {
  const { postId } = req.params;

  try {
    const result = await pool.query(getLikesQuery, [postId]);
    res.status(200).json(result.rows.map((like) => like.userId));
  } catch (error) {
    res.status(500).send("Server error");
  }
}

export async function createLike(req, res) {
  const { postId } = req.params;
  const userInfo = req.userInfo;

  try {
    const result = await pool.query(createLikeQuery, [postId, userInfo.id]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).send("Server error");
  }
}

export async function deleteLike(req, res) {
  const { postId } = req.params;
  const userInfo = req.userInfo;

  try {
    await pool.query(deleteLikeQuery, [postId, userInfo.id]);
    res.status(204).send("Like deleted");
  } catch (error) {
    res.status(500).send("Server error");
  }
}
