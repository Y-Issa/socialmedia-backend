import jwt from "jsonwebtoken";
import pool from "../../db.js";
import {
  createRelationshipQuery,
  deleteRelationshipQuery,
  getRelationshipsQuery,
} from "../queries.js";
import e from "express";

export function getRelationships(req, res) {
  const { authorization } = req.headers;
  const { uid } = req.params;

  if (!authorization) {
    return res.status(401).send("Unauthorized");
  }

  const token = authorization.split(" ")[1];

  jwt.verify(token, process.env.JWT_SECRET, (error, userInfo) => {
    if (error) {
      return res.status(403).send("Unauthorized");
    }

    pool.query(getRelationshipsQuery, [uid], (error, results) => {
      if (error) throw error;

      return res
        .status(200)
        .json(results.rows.map((row) => row.followerUserId));
    });
  });
}

export function createRelationship(req, res) {
  const { authorization } = req.headers;
  const { uid } = req.params;

  if (!authorization) {
    return res.status(401).send("Unauthorized");
  }

  const token = authorization.split(" ")[1];

  jwt.verify(token, process.env.JWT_SECRET, (error, userInfo) => {
    if (error) {
      return res.status(403).send("Unauthorized");
    }

    pool.query(
      createRelationshipQuery,
      [userInfo.id, uid],
      (error, results) => {
        if (error) throw error;

        return res.status(201).send("Relationship created");
      }
    );
  });
}

export function deleteRelationship(req, res) {
  const { authorization } = req.headers;
  const { uid } = req.params;

  if (!authorization) {
    return res.status(401).send("Unauthorized");
  }

  const token = authorization.split(" ")[1];

  jwt.verify(token, process.env.JWT_SECRET, (error, userInfo) => {
    if (error) {
      return res.status(403).send("Unauthorized");
    }

    pool.query(
      deleteRelationshipQuery,
      [userInfo.id, uid],
      (error, results) => {
        if (error) throw error;

        return res.status(200).send("Relationship deleted");
      }
    );
  });
}
