import pool from "../../db.js";
import {
  createPostQuery,
  deletePostQuery,
  getPostsQuery,
  getUserPostsQuery,
} from "../queries.js";
import {
  cleanString,
  isUuid,
  optionalString,
  postError,
} from "../utils/validate.js";

export async function getPosts(req, res) {
  const { userId } = req.query;
  const currentUserInfo = req.userInfo;

  // With ?userId=... return that user's posts (profile page);
  // otherwise return the current user's feed (own posts + followed users).
  const hasUserId = userId && userId !== "undefined";
  if (hasUserId && !isUuid(userId)) {
    return res.status(400).send("Invalid id");
  }

  try {
    const result = await pool.query(
      hasUserId ? getUserPostsQuery : getPostsQuery,
      [hasUserId ? userId : currentUserInfo.id]
    );
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("getPosts:", error);
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
