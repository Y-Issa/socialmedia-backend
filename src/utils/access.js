import pool from "../../db.js";
import { postAccessQuery } from "../queries.js";

export const NOT_MEMBER = "You are not a member of this group";

// Sends 404 (no such post) or 403 (group post, not a member) and returns
// false; returns true when userId may see and interact with the post.
export async function ensurePostAccess(res, postId, userId) {
  const { rows } = await pool.query(postAccessQuery, [postId, userId]);
  if (rows.length === 0) {
    res.status(404).send("Post not found");
    return false;
  }
  if (!rows[0].canAccess) {
    res.status(403).send(NOT_MEMBER);
    return false;
  }
  return true;
}
