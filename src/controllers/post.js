import jwt from "jsonwebtoken";
import "dotenv/config.js";
import pool from "../../db.js";
import { createPostQuery, getPostsQuery } from "../queries.js";

export function getPosts(req, res) {
  const { authorization } = req.headers;

  if (!authorization) {
    return res.status(401).send("Unauthorized");
  }

  const token = authorization.split(" ")[1];

  jwt.verify(token, process.env.JWT_SECRET, (error, userInfo) => {
    if (error) {
      return res.status(403).send("Unauthorized");
    }
    pool.query(getPostsQuery, [userInfo.id], (error, results) => {
      if (error) throw error;

      return res.status(200).json(results.rows);
    });
  });
}

export function createPost(req, res) {
  const { authorization } = req.headers;
  const { description, image } = req.body;

  if (!authorization) {
    return res.status(401).send("Unauthorized");
  }

  const token = authorization.split(" ")[1];

  jwt.verify(token, process.env.JWT_SECRET, (error, userInfo) => {
    if (error) {
      return res.status(403).send("Unauthorized");
    }
    pool.query(
      createPostQuery,
      [description, image, userInfo.id],
      (error, results) => {
        if (error) throw error;

        return res.status(201).json(results.rows[0]);
      }
    );
  });
}
