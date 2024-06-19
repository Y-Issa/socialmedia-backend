import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

import pool from "../../db.js";
import { checkEmailExistsQuery, createUserQuery } from "../queries.js";

export function register(req, res) {
  const { name, email, password } = req.body;

  pool.query(checkEmailExistsQuery, [email], (error, results) => {
    if (error) {
      throw error;
    }
    if (results.rows.length > 0) {
      return res.status(409).send("Email already exists");
    }

    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(password, salt);

    pool.query(
      createUserQuery,
      [name, email, hashedPassword],
      (error, results) => {
        if (error) {
          throw error;
        }
        res.status(201).json({
          user: (({ password, ...rest }) => rest)(results.rows[0]),
        });
      }
    );
  });
}

export function login(req, res) {
  const { email, password } = req.body;

  pool.query(checkEmailExistsQuery, [email], (error, results) => {
    if (error) {
      throw error;
    }
    if (results.rows.length === 0) {
      return res.status(401).send("Email is incorrect");
    }

    const checkPassword = bcrypt.compareSync(
      password,
      results.rows[0].password
    );

    if (!checkPassword) return res.status(401).send("Password is incorrect");

    const token = jwt.sign(
      { id: results.rows[0].userId },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.status(200).json({
      user: (({ password, ...rest }) => rest)(results.rows[0]),
      token,
    });
  });
}

export function logout(req, res) {
  res.status(200).json("Logged out");
}
