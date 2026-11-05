import bcrypt from "bcrypt";
import pool from "../../db.js";
import {
  getFollowersQuery,
  getFollowingQuery,
  getUserByIdQuery,
  getUserPasswordQuery,
  getUserProfileQuery,
  suggestionsQuery,
  updateUserQuery,
} from "../queries.js";
import { cleanString, optionalString } from "../utils/validate.js";

const SALT_ROUNDS = 10;
const MIN_PASSWORD_LENGTH = 6;
const BIO_MAX_LENGTH = 160;

// Profile plus followerCount, followingCount and isFollowing (whether the
// requester follows this user).
export async function getUser(req, res) {
  const { uid } = req.params;
  const { id } = req.userInfo;

  try {
    const result = await pool.query(getUserProfileQuery, [uid, id]);
    const user = result.rows[0];
    if (!user) {
      return res.status(404).send("User not found");
    }

    // Email is private: only return it to the user themselves.
    if (user.userId !== id) {
      delete user.email;
    }
    res.status(200).json(user);
  } catch (error) {
    console.error("getUser:", error);
    res.status(500).send("Server error");
  }
}

// GET /api/users/:uid/followers and /following -> [{ userId, name, profileImage }]
// (at most 100, by name).
function listRelations(query, label) {
  return async (req, res) => {
    const { uid } = req.params;

    try {
      const user = await pool.query(getUserByIdQuery, [uid]);
      if (user.rows.length === 0) {
        return res.status(404).send("User not found");
      }
      const result = await pool.query(query, [uid]);
      res.status(200).json(result.rows);
    } catch (error) {
      console.error(`${label}:`, error);
      res.status(500).send("Server error");
    }
  };
}

export const getFollowers = listRelations(getFollowersQuery, "getFollowers");
export const getFollowing = listRelations(getFollowingQuery, "getFollowing");

export async function updateUser(req, res) {
  const body = req.body || {};
  const name = cleanString(body.name);
  const city = optionalString(body.city);
  const website = optionalString(body.website);
  const coverImage = optionalString(body.coverImage);
  const profileImage = optionalString(body.profileImage);
  // bio is only changed when the request sends it (null or "" clears it).
  const hasBio = body.bio !== undefined;
  const bio = optionalString(body.bio);
  const { newPassword, oldPassword } = body;
  const userInfo = req.userInfo;

  if (!name) {
    return res.status(400).send("Name is required");
  }
  if (name.length > 100) {
    return res.status(400).send("Name is too long (max 100 characters)");
  }
  if ((city && city.length > 100) || (website && website.length > 200)) {
    return res.status(400).send("City or website is too long");
  }
  if (
    (coverImage && coverImage.length > 255) ||
    (profileImage && profileImage.length > 255)
  ) {
    return res.status(400).send("Invalid image");
  }
  if (bio && bio.length > BIO_MAX_LENGTH) {
    return res
      .status(400)
      .send(`Bio is too long (max ${BIO_MAX_LENGTH} characters)`);
  }
  if (typeof oldPassword !== "string" || oldPassword === "") {
    return res.status(400).send("Current password is required");
  }
  if (
    newPassword &&
    (typeof newPassword !== "string" || newPassword.length < MIN_PASSWORD_LENGTH)
  ) {
    return res
      .status(400)
      .send(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }

  try {
    const userResult = await pool.query(getUserPasswordQuery, [userInfo.id]);
    const user = userResult.rows[0];
    if (!user) {
      return res.status(404).send("User not found");
    }

    const match = await bcrypt.compare(oldPassword, user.password);
    if (!match) {
      // 400, not 401: a 401 would make the frontend log the user out.
      return res.status(400).send("Password is incorrect");
    }

    let password = user.password;
    if (newPassword) {
      password = await bcrypt.hash(newPassword, SALT_ROUNDS);
    }

    const updateUserResult = await pool.query(updateUserQuery, [
      name,
      city,
      website,
      password,
      profileImage,
      coverImage,
      userInfo.id,
      hasBio,
      bio,
    ]);
    res.status(200).json(updateUserResult.rows[0]);
  } catch (error) {
    console.error("updateUser:", error);
    res.status(500).send("Server error");
  }
}

const SUGGESTIONS_DEFAULT = 5;
const SUGGESTIONS_MAX = 20;

function suggestionReason({ mutualCount, mutualName, followerCount }) {
  if (mutualCount > 0) {
    const others = mutualCount - 1;
    if (others === 0) return `Followed by ${mutualName}`;
    return `Followed by ${mutualName} and ${others} ${others === 1 ? "other" : "others"}`;
  }
  return followerCount > 0 ? "Popular on Communet" : "New on Communet";
}

// GET /api/users/suggestions?limit=5
//   -> [{ userId, name, profileImage, city, mutualCount, reason }]
// People the requester doesn't follow yet: friends of friends first, then
// popular accounts, then the newest ones.
export async function getSuggestions(req, res) {
  let limit = SUGGESTIONS_DEFAULT;
  if (req.query.limit !== undefined && req.query.limit !== "") {
    const n = Number(req.query.limit);
    if (!Number.isInteger(n) || n < 1) {
      return res.status(400).send("Invalid limit");
    }
    limit = Math.min(n, SUGGESTIONS_MAX);
  }

  try {
    const result = await pool.query(suggestionsQuery, [req.userInfo.id, limit]);
    res.status(200).json(
      result.rows.map(({ mutualName, followerCount, ...user }) => ({
        ...user,
        reason: suggestionReason({ ...user, mutualName, followerCount }),
      }))
    );
  } catch (error) {
    console.error("getSuggestions:", error);
    res.status(500).send("Server error");
  }
}
