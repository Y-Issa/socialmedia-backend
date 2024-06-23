import jwt from "jsonwebtoken";
import { getUserByIdQuery } from "../queries.js";
import pool from "../../db.js";

export function getUser(req, res) {
  const { uid } = req.params;
  const { authorization } = req.headers;

  if (!authorization) {
    return res.status(401).send("Unauthorized");
  }

  const token = authorization.split(" ")[1];

  jwt.verify(token, process.env.JWT_SECRET, (error, userInfo) => {
    if (error) {
      return res.status(403).send("Unauthorized");
    }

    pool.query(getUserByIdQuery, [uid], (error, results) => {
      if (error) throw error;

      return res
        .status(200)
        .json((({ password, ...rest }) => rest)(results.rows[0]));
    });
  });
}
