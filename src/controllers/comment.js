import {
  createCommentQuery,
  deleteCommentQuery,
  getCommentsQuery,
  notifyCommentQuery,
} from "../queries.js";
import pool from "../../db.js";
import { cleanString, commentError } from "../utils/validate.js";
import { ensurePostAccess } from "../utils/access.js";
import { notify } from "../utils/notify.js";

// Group posts: members only (403).
export async function getComments(req, res) {
  const { postId } = req.params;

  try {
    if (!(await ensurePostAccess(res, postId, req.userInfo.id))) return;

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
    if (!(await ensurePostAccess(res, postId, userInfo.id))) return;

    const result = await pool.query(createCommentQuery, [
      description,
      postId,
      userInfo.id,
    ]);
    const comment = result.rows[0];
    await notify(notifyCommentQuery, [postId, userInfo.id, comment.commentId]);
    res.status(201).json(comment);
  } catch (error) {
    console.error("createComment:", error);
    res.status(500).send("Server error");
  }
}

// DELETE /api/comments/:commentId -> 204. Allowed for the comment's author
// and the post's author. Its notification goes with it (FK cascade).
export async function deleteComment(req, res) {
  const { commentId } = req.params;

  try {
    const result = await pool.query(deleteCommentQuery, [
      commentId,
      req.userInfo.id,
    ]);
    if (result.rowCount === 0) {
      return res.status(404).send("Not found or not yours");
    }
    res.status(204).send();
  } catch (error) {
    console.error("deleteComment:", error);
    res.status(500).send("Server error");
  }
}
