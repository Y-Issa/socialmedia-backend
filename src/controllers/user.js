import bcrypt from "bcrypt";
import pool from "../../db.js";
import { getUserByIdQuery, updateUserQuery } from "../queries.js";

export async function getUser(req, res) {
  const { uid } = req.params;

  try {
    const result = await pool.query(getUserByIdQuery, [uid]);
    res.status(200).json((({ password, ...rest }) => rest)(result.rows[0]));
  } catch (error) {
    res.status(500).send("Server error");
  }
}

export async function updateUser(req, res) {
  const {
    name,
    city,
    website,
    newPassword,
    oldPassword,
    coverImage,
    profileImage,
  } = req.body;
  const userInfo = req.userInfo;

  try {
    const userResult = await pool.query(getUserByIdQuery, [userInfo.id]);
    const user = userResult.rows[0];

    const match = bcrypt.compareSync(oldPassword, user.password);
    if (!match) {
      return res.status(401).send("Password is incorrect");
    }

    let password = user.password;
    if (newPassword) {
      const salt = bcrypt.genSaltSync(10);
      const hashedPassword = bcrypt.hashSync(newPassword, salt);
      password = hashedPassword;
    }

    const updateUserResult = await pool.query(updateUserQuery, [
      name,
      city,
      website,
      password,
      profileImage,
      coverImage,
      userInfo.id,
    ]);
    res
      .status(200)
      .json((({ password, ...rest }) => rest)(updateUserResult.rows[0]));
  } catch (error) {
    res.status(500).send("Server error");
  }
}
