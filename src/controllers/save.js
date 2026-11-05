import pool from "../../db.js";
import {
  getSavedPostIdsQuery,
  getSavedPostsQuery,
  savePostQuery,
  unsavePostQuery,
} from "../queries.js";
import { ensurePostAccess } from "../utils/access.js";
import { pageParams, parsePage, toPage } from "../utils/pagination.js";

// Group posts can only be saved by members of the group.
export async function savePost(req, res) {
  const { userInfo } = req;
  const { postId } = req.params;

  try {
    if (!(await ensurePostAccess(res, postId, userInfo.id))) return;

    const savePostResult = await pool.query(savePostQuery, [
      postId,
      userInfo.id,
    ]);
    res.status(201).json(savePostResult.rows[0] ?? null);
  } catch (error) {
    console.error("savePost:", error);
    res.status(500).send("Server error");
  }
}

// GET /api/save?limit=&cursor= -> { items, nextCursor }
// Ordered by when the post was saved (newest first); the cursor encodes
// savedAt + postId. Posts from groups the user has left are hidden.
export async function getSavedPosts(req, res) {
  const { userInfo } = req;
  const page = parsePage(req.query);
  if (page.error) {
    return res.status(400).send(page.error);
  }

  try {
    const result = await pool.query(
      getSavedPostsQuery,
      pageParams(userInfo.id, page)
    );
    res.status(200).json(toPage(result.rows, page.limit));
  } catch (error) {
    console.error("getSavedPosts:", error);
    res.status(500).send("Server error");
  }
}

export async function getSavedPostIds(req, res) {
  const { userInfo } = req;

  try {
    const savedPostsResult = await pool.query(getSavedPostIdsQuery, [
      userInfo.id,
    ]);
    res.status(200).json(savedPostsResult.rows.map((post) => post.postId));
  } catch (error) {
    console.error("getSavedPostIds:", error);
    res.status(500).send("Server error");
  }
}

// No membership check: unsaving is always allowed.
export async function unsavePost(req, res) {
  const { userInfo } = req;
  const { postId } = req.params;

  try {
    await pool.query(unsavePostQuery, [postId, userInfo.id]);
    res.status(204).send();
  } catch (error) {
    console.error("unsavePost:", error);
    res.status(500).send("Server error");
  }
}
