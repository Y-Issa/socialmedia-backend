import pool from "../../db.js";
import {
  createPostQuery,
  deletePostQuery,
  getPostsQuery,
  getUserPostsQuery,
} from "../queries.js";

export async function getPosts(req, res) {
  const { userId } = req.query;
  const currentUserInfo = req.userInfo;

  try {
    const values = userId !== "undefined" ? [userId] : [currentUserInfo.id];
    const result = await pool.query(
      userId !== "undefined" ? getUserPostsQuery : getPostsQuery,
      values
    );
    res.status(200).json(result.rows);
  } catch (error) {
    res.status(500).send("Server error");
  }
}

export async function createPost(req, res) {
  const { description, image } = req.body;
  const userInfo = req.userInfo;

  try {
    const result = await pool.query(createPostQuery, [
      description,
      image,
      userInfo.id,
    ]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).send("Server error");
  }
}

export async function deletePost(req, res) {
  const { postId } = req.params;
  const userInfo = req.userInfo;

  try {
    await pool.query(deletePostQuery, [postId, userInfo.id]);
    res.status(204).send("Post deleted");
  } catch (error) {
    res.status(500).send("Server error");
  }
}
