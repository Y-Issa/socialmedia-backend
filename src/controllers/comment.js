import { createCommentQuery, getCommentsQuery } from "../queries.js";
import pool from "../../db.js";

export async function getComments(req, res) {
  const { postId } = req.params;

  try {
    const result = await pool.query(getCommentsQuery, [postId]);
    res.status(200).json(result.rows);
  } catch (error) {
    res.status(500).send("Server error");
  }
}

export async function createComment(req, res) {
  const { postId } = req.params;
  const { description } = req.body;
  const userInfo = req.userInfo;

  try {
    const result = await pool.query(createCommentQuery, [
      description,
      postId,
      userInfo.id,
    ]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).send("Server error");
  }
}
