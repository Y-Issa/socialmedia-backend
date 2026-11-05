// Keyset (cursor) pagination for post lists.
//
//   ?limit=10        page size, default 10, max 50
//   ?cursor=...      opaque; the nextCursor of the previous page
//
// A cursor is base64url("<UTC ISO timestamp with microseconds>|<postId>").
// The timestamp is the list's sort key (createdAt, or savedAt for saved
// posts) exactly as Postgres stores it, so no row is skipped or repeated.

import { isUuid } from "./validate.js";

export const DEFAULT_LIMIT = 10;
export const MAX_LIMIT = 50;

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/;

export function encodeCursor(iso, postId) {
  return Buffer.from(`${iso}|${postId}`).toString("base64url");
}

export function decodeCursor(cursor) {
  if (typeof cursor !== "string" || cursor.length > 200) return null;
  const [iso, postId, extra] = Buffer.from(cursor, "base64url")
    .toString("utf8")
    .split("|");
  if (extra !== undefined || !ISO_RE.test(iso || "") || !isUuid(postId)) {
    return null;
  }
  return { at: iso, postId };
}

// Parses ?limit and ?cursor. Returns { error } or { limit, at, postId }.
// (postId is the cursor's row id; other lists use it for their own id.)
export function parsePage(query = {}, defaultLimit = DEFAULT_LIMIT) {
  let limit = defaultLimit;
  if (query.limit !== undefined && query.limit !== "") {
    const n = Number(query.limit);
    if (!Number.isInteger(n) || n < 1) return { error: "Invalid limit" };
    limit = Math.min(n, MAX_LIMIT);
  }

  let at = null;
  let postId = null;
  if (query.cursor !== undefined && query.cursor !== "") {
    const decoded = decodeCursor(query.cursor);
    if (!decoded) return { error: "Invalid cursor" };
    ({ at, postId } = decoded);
  }
  return { limit, at, postId };
}

// Query parameters shared by every paginated post query ($1..$4).
// One extra row is fetched to know whether there is a next page.
export function pageParams(viewerId, page) {
  return [viewerId, page.at, page.postId, page.limit + 1];
}

// Turns the fetched rows into { items, nextCursor }. idKey is the row's
// tie-breaker id column.
export function toPage(rows, limit, idKey = "postId") {
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const last = pageRows[pageRows.length - 1];
  const items = pageRows.map(({ cursorKey, ...post }) => post);
  return {
    items,
    nextCursor: hasMore ? encodeCursor(last.cursorKey, last[idKey]) : null,
  };
}
