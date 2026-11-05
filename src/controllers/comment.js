import { createCommentQuery, getCommentsQuery } from "../queries.js";
import pool from "../../db.js";
import {
  cleanString,
  commentError,
  isForeignKeyViolation,
} from "../utils/validate.js";

export async function getComments(req, res) {
  const { postId } = req.params;

  try {
    const result = await pool.query(getCommentsQuery, [postId]);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("getComments:", error);
    res.status(500).send("Server error");
  }
}

export async function createComment(req, res) {
  const { postId } = req.params;
  const description = cleanString(req.body?.description);
  const userInfo = req.userInfo;

  const invalid = commentError(description);
  if (invalid) {
    return res.status(400).send(invalid);
  }

  try {
    const result = await pool.query(createCommentQuery, [
      description,
      postId,
      userInfo.id,
    ]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      return res.status(404).send("Post not found");
    }
    console.error("createComment:", error);
    res.status(500).send("Server error");
  }
}
