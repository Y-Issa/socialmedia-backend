import jwt from "jsonwebtoken";
import pool from "../../db.js";
import { createLikeQuery, deleteLikeQuery, getLikesQuery } from "../queries.js";

export function getLikes(req, res) {
  const { postId } = req.params;

  pool.query(getLikesQuery, [postId], (error, results) => {
    if (error) throw error;

    return res.status(200).json(results.rows.map((like) => like.userId));
  });
}

export function createLike(req, res) {
  const { authorization } = req.headers;
  const { postId } = req.params;

  if (!authorization) {
    return res.status(401).send("Unauthorized");
  }

  const token = authorization.split(" ")[1];

  jwt.verify(token, process.env.JWT_SECRET, (error, userInfo) => {
    if (error) {
      return res.status(403).send("Unauthorized");
    }
    pool.query(createLikeQuery, [postId, userInfo.id], (error, results) => {
      if (error) throw error;

      return res.status(201).json(results.rows[0]);
    });
  });
}

export function deleteLike(req, res) {
  const { authorization } = req.headers;
  const { postId } = req.params;

  if (!authorization) {
    return res.status(401).send("Unauthorized");
  }

  const token = authorization.split(" ")[1];

  jwt.verify(token, process.env.JWT_SECRET, (error, userInfo) => {
    if (error) {
      return res.status(403).send("Unauthorized");
    }
    pool.query(deleteLikeQuery, [postId, userInfo.id], (error) => {
      if (error) throw error;

      return res.status(204).send("Like deleted");
    });
  });
}
