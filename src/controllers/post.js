import pool from "../../db.js";
import {
  createPostQuery,
  deletePostQuery,
  editPostQuery,
  getFeedQuery,
  getOwnPostQuery,
  getPostRowQuery,
  getUserPostsQuery,
} from "../queries.js";
import {
  cleanString,
  isUuid,
  optionalString,
  postError,
} from "../utils/validate.js";
import { ensurePostAccess } from "../utils/access.js";
import { pageParams, parsePage, toPage } from "../utils/pagination.js";

// GET /api/posts?limit=&cursor=           -> the current user's feed
// GET /api/posts?userId=...&limit=&cursor= -> that user's posts (profile)
// Neither includes group posts. Response: { items, nextCursor }.
export async function getPosts(req, res) {
  const { userId } = req.query;
  const { id } = req.userInfo;

  const hasUserId = userId && userId !== "undefined";
  if (hasUserId && !isUuid(userId)) {
    return res.status(400).send("Invalid id");
  }
  const page = parsePage(req.query);
  if (page.error) {
    return res.status(400).send(page.error);
  }

  try {
    const params = pageParams(id, page);
    const result = hasUserId
      ? await pool.query(getUserPostsQuery, [...params, userId])
      : await pool.query(getFeedQuery, params);
    res.status(200).json(toPage(result.rows, page.limit));
  } catch (error) {
    console.error("getPosts:", error);
    res.status(500).send("Server error");
  }
}

// GET /api/posts/:postId -> 200 rich post row (same shape as list rows).
// 404 when it doesn't exist, 403 for a group post the viewer can't see.
export async function getPost(req, res) {
  const { postId } = req.params;
  const { id } = req.userInfo;

  try {
    if (!(await ensurePostAccess(res, postId, id))) return;

    const result = await pool.query(getPostRowQuery, [id, postId]);
    if (result.rows.length === 0) {
      return res.status(404).send("Post not found");
    }
    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("getPost:", error);
    res.status(500).send("Server error");
  }
}

export async function createPost(req, res) {
  const description = cleanString(req.body?.description);
  const image = optionalString(req.body?.image);
  const userInfo = req.userInfo;

  const invalid = postError(description, image);
  if (invalid) {
    return res.status(400).send(invalid);
  }

  try {
    const result = await pool.query(createPostQuery, [
      description,
      image,
      userInfo.id,
    ]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("createPost:", error);
    res.status(500).send("Server error");
  }
}

// Deletes any post (regular or group). Allowed for the author, and for the
// group's creator when it is a group post.
export async function deletePost(req, res) {
  const { postId } = req.params;
  const userInfo = req.userInfo;

  try {
    const result = await pool.query(deletePostQuery, [postId, userInfo.id]);
    if (result.rowCount === 0) {
      return res.status(404).send("Not found or not yours");
    }
    res.status(204).send();
  } catch (error) {
    console.error("deletePost:", error);
    res.status(500).send("Server error");
  }
}

// PATCH /api/posts/:postId { description } -> 200 rich post row (with
// editedAt). Author only; same rules as creating a post, so a post without
// an image can't be emptied.
export async function editPost(req, res) {
  const { postId } = req.params;
  const { id } = req.userInfo;
  const description = cleanString(req.body?.description);

  try {
    const own = await pool.query(getOwnPostQuery, [postId, id]);
    if (own.rows.length === 0) {
      return res.status(404).send("Not found or not yours");
    }
    const invalid = postError(description, own.rows[0].image);
    if (invalid) {
      return res.status(400).send(invalid);
    }

    await pool.query(editPostQuery, [description, postId, id]);
    const result = await pool.query(getPostRowQuery, [id, postId]);
    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("editPost:", error);
    res.status(500).send("Server error");
  }
}
