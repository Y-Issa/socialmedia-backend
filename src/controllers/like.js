import { createLikeQuery, deleteLikeQuery, getLikesQuery } from "../queries.js";
import pool from "../../db.js";
import { isForeignKeyViolation } from "../utils/validate.js";

export async function getLikes(req, res) {
  const { postId } = req.params;

  try {
    const result = await pool.query(getLikesQuery, [postId]);
    res.status(200).json(result.rows.map((like) => like.userId));
  } catch (error) {
    console.error("getLikes:", error);
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
    if (isForeignKeyViolation(error)) {
      return res.status(404).send("Post not found");
    }
    console.error("createLike:", error);
    res.status(500).send("Server error");
  }
}

export async function deleteLike(req, res) {
  const { postId } = req.params;
  const userInfo = req.userInfo;

  try {
    await pool.query(deleteLikeQuery, [postId, userInfo.id]);
    res.status(204).send();
  } catch (error) {
    console.error("deleteLike:", error);
    res.status(500).send("Server error");
  }
}
