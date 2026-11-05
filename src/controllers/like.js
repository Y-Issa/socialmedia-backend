import { createLikeQuery, deleteLikeQuery, getLikesQuery } from "../queries.js";
import pool from "../../db.js";
import { ensurePostAccess } from "../utils/access.js";

// Ids of the users who liked the post. Group posts: members only.
export async function getLikes(req, res) {
  const { postId } = req.params;

  try {
    if (!(await ensurePostAccess(res, postId, req.userInfo.id))) return;

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
    if (!(await ensurePostAccess(res, postId, userInfo.id))) return;

    const result = await pool.query(createLikeQuery, [postId, userInfo.id]);
    res.status(201).json(result.rows[0] ?? null);
  } catch (error) {
    console.error("createLike:", error);
    res.status(500).send("Server error");
  }
}

// No membership check: removing your own like is always allowed.
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
