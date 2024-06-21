import jwt from "jsonwebtoken";

import { createCommentQuery, getCommentsQuery } from "../queries.js";
import pool from "../../db.js";

export function getComments(req, res) {
  const { postId } = req.params;

  pool.query(getCommentsQuery, [postId], (error, results) => {
    if (error) throw error;

    return res.status(200).json(results.rows);
  });
}

export function createComment(req, res) {
  const { authorization } = req.headers;
  const { postId } = req.params;
  const { description } = req.body;

  if (!authorization) {
    return res.status(401).send("Unauthorized");
  }

  const token = authorization.split(" ")[1];

  jwt.verify(token, process.env.JWT_SECRET, (error, userInfo) => {
    if (error) {
      return res.status(403).send("Unauthorized");
    }
    pool.query(
      createCommentQuery,
      [description, postId, userInfo.id],
      (error, results) => {
        if (error) throw error;

        return res.status(201).json(results.rows[0]);
      }
    );
  });
}
