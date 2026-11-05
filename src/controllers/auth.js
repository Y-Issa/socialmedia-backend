import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import pool from "../../db.js";
import { checkEmailExistsQuery, createUserQuery } from "../queries.js";
import { cleanString, isEmail } from "../utils/validate.js";

const SALT_ROUNDS = 10;
const MIN_PASSWORD_LENGTH = 6;

// Compared against when the email is unknown, so a wrong email takes about
// as long as a wrong password.
const dummyHash = bcrypt.hash("not-a-real-password", SALT_ROUNDS);

export async function register(req, res) {
  const name = cleanString(req.body?.name);
  const email = cleanString(req.body?.email);
  const password = typeof req.body?.password === "string" ? req.body.password : "";

  if (!name || !email || !password) {
    return res.status(400).send("Name, email and password are required");
  }
  if (name.length > 100) {
    return res.status(400).send("Name is too long (max 100 characters)");
  }
  if (!isEmail(email) || email.length > 100) {
    return res.status(400).send("Please enter a valid email address");
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return res
      .status(400)
      .send(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }

  try {
    const emailCheckResult = await pool.query(checkEmailExistsQuery, [email]);
    if (emailCheckResult.rows.length > 0) {
      return res.status(409).send("Email already exists");
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    const createUserResult = await pool.query(createUserQuery, [
      name,
      email,
      hashedPassword,
    ]);
    res.status(201).json({ user: createUserResult.rows[0] });
  } catch (error) {
    console.error("register:", error);
    res.status(500).send("Server error");
  }
}

export async function login(req, res) {
  const email = cleanString(req.body?.email);
  const password = typeof req.body?.password === "string" ? req.body.password : "";

  if (!email || !password) {
    return res.status(400).send("Email and password are required");
  }

  try {
    const emailCheckResult = await pool.query(checkEmailExistsQuery, [email]);
    const user = emailCheckResult.rows[0];

    // Same response for an unknown email and a wrong password so the
    // endpoint can't be used to find out which emails are registered.
    const checkPassword = await bcrypt.compare(
      password,
      user ? user.password : await dummyHash
    );
    if (!user || !checkPassword) {
      return res.status(401).send("Invalid email or password");
    }

    const token = jwt.sign({ id: user.userId }, process.env.JWT_SECRET, {
      expiresIn: "1d",
    });

    res.status(200).json({
      user: (({ password, ...rest }) => rest)(user),
      token,
    });
  } catch (error) {
    console.error("login:", error);
    res.status(500).send("Server error");
  }
}

export async function logout(req, res) {
  res.status(200).send("Logged out");
}

// A token can outlive its user (account deleted, database reseeded), so
// confirm the user still exists; a 401 makes the client log out.
export async function checkToken(req, res) {
  const userInfo = req.userInfo;
  if (!userInfo) {
    return res.status(401).send("Unauthorized");
  }
  try {
    const result = await pool.query(`SELECT 1 FROM users WHERE "userId" = $1`, [
      userInfo.id,
    ]);
    if (result.rowCount === 0) {
      return res.status(401).send("Unauthorized");
    }
    res.status(200).json(userInfo);
  } catch (error) {
    console.error("checkToken:", error);
    res.status(500).send("Server error");
  }
}
