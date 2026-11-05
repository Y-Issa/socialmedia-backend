import pool from "../../db.js";
import {
  searchGroupsQuery,
  searchPostsQuery,
  searchUsersQuery,
} from "../queries.js";
import { cleanString } from "../utils/validate.js";

const TYPES = ["all", "users", "posts", "groups"];
const QUERY_MAX_LENGTH = 100;
const DEFAULT_LIMIT_ALL = 5;
const DEFAULT_LIMIT_ONE = 20;
const MAX_LIMIT = 50;

const SEARCHES = {
  users: searchUsersQuery,
  posts: searchPostsQuery,
  groups: searchGroupsQuery,
};

// Escapes LIKE wildcards so "%" or "_" in the query match literally.
const escapeLike = (text) => text.replace(/[\\%_]/g, (c) => `\\${c}`);

// GET /api/search?q=&type=all|users|posts|groups&limit=
//   -> { users?, posts?, groups? } (only the requested arrays)
// limit is per array: default 5 for type=all, 20 for a single type, max 50.
export async function search(req, res) {
  const q = cleanString(req.query.q);
  const type = req.query.type === undefined || req.query.type === "" ? "all" : req.query.type;

  if (!q || q.length > QUERY_MAX_LENGTH) {
    return res.status(400).send("Search query is required");
  }
  if (!TYPES.includes(type)) {
    return res.status(400).send("Invalid type");
  }

  let limit = type === "all" ? DEFAULT_LIMIT_ALL : DEFAULT_LIMIT_ONE;
  if (req.query.limit !== undefined && req.query.limit !== "") {
    const n = Number(req.query.limit);
    if (!Number.isInteger(n) || n < 1) {
      return res.status(400).send("Invalid limit");
    }
    limit = Math.min(n, MAX_LIMIT);
  }

  const escaped = escapeLike(q);
  const kinds = type === "all" ? ["users", "posts", "groups"] : [type];

  try {
    const results = await Promise.all(
      kinds.map((kind) => {
        const params = [req.userInfo.id, q, `%${escaped}%`, limit];
        // users / groups rank prefix matches first ($5).
        if (kind !== "posts") params.push(`${escaped}%`);
        return pool.query(SEARCHES[kind], params);
      })
    );
    const body = {};
    kinds.forEach((kind, i) => {
      body[kind] = results[i].rows;
    });
    res.status(200).json(body);
  } catch (error) {
    console.error("search:", error);
    res.status(500).send("Server error");
  }
}
