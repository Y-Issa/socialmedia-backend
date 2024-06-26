import pool from "../../db.js";
import {
  getSavedPostIdsQuery,
  getSavedPostsQuery,
  savePostQuery,
  unsavePostQuery,
} from "../queries.js";

export async function savePost(req, res) {
  const { userInfo } = req;
  const { postId } = req.params;

  try {
    const savePostResult = await pool.query(savePostQuery, [
      postId,
      userInfo.id,
    ]);
    res.status(201).json(savePostResult.rows[0]);
  } catch (error) {
    console.log(error);
    res.status(500).send("Server error");
  }
}

export async function getSavedPosts(req, res) {
  const { userInfo } = req;

  try {
    const savedPostsResult = await pool.query(getSavedPostsQuery, [
      userInfo.id,
    ]);
    res.status(200).json(savedPostsResult.rows);
  } catch (error) {
    console.log(error);
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
    console.log(error);
    res.status(500).send("Server error");
  }
}

export async function unsavePost(req, res) {
  const { userInfo } = req;
  const { postId } = req.params;

  try {
    const unsavePostResult = await pool.query(unsavePostQuery, [
      postId,
      userInfo.id,
    ]);
    res.status(200).json(unsavePostResult.rows[0]);
  } catch (error) {
    console.log(error);
    res.status(500).send("Server error");
  }
}
