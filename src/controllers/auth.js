import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import pool from "../../db.js";
import { checkEmailExistsQuery, createUserQuery } from "../queries.js";

export async function register(req, res) {
  const { name, email, password } = req.body;

  try {
    const emailCheckResult = await pool.query(checkEmailExistsQuery, [email]);
    if (emailCheckResult.rows.length > 0) {
      return res.status(409).send("Email already exists");
    }

    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(password, salt);

    const createUserResult = await pool.query(createUserQuery, [
      name,
      email,
      hashedPassword,
    ]);
    res.status(201).json({
      user: (({ password, ...rest }) => rest)(createUserResult.rows[0]),
    });
  } catch (error) {
    res.status(500).send("Server error");
  }
}

export async function login(req, res) {
  const { email, password } = req.body;

  try {
    const emailCheckResult = await pool.query(checkEmailExistsQuery, [email]);
    if (emailCheckResult.rows.length === 0) {
      return res.status(401).send("Email is incorrect");
    }

    const checkPassword = bcrypt.compareSync(
      password,
      emailCheckResult.rows[0].password
    );
    if (!checkPassword) {
      return res.status(401).send("Password is incorrect");
    }

    const token = jwt.sign(
      { id: emailCheckResult.rows[0].userId },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.status(200).json({
      user: (({ password, ...rest }) => rest)(emailCheckResult.rows[0]),
      token,
    });
  } catch (error) {
    res.status(500).send("Server error");
  }
}

export async function logout(req, res) {
  res.status(200).send("Logged out");
}

export async function checkToken(req, res) {
  const userInfo = req.userInfo;
  if (!userInfo) {
    return res.status(401).send("Unauthorized");
  }
  res.status(200).json(userInfo);
}
