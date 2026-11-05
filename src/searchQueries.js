// Search queries (accent- and case-insensitive).
//
// $1 viewer, $2 search text, $3 LIKE pattern ('%text%', wildcards escaped),
// $4 LIMIT, $5 prefix pattern ('text%', users / groups only).
// Both sides go through f_unaccent(lower(...)) (migration 004), so "jose"
// matches "José". A row matches on a substring (LIKE, served by the trigram
// GIN indexes on f_unaccent(lower(column))) or trigram similarity; prefix
// matches rank first.

import { POST_COLUMNS, POST_FROM } from "./queries.js";

const norm = (sql) => `f_unaccent(lower(${sql}))`;

export const searchUsersQuery = `SELECT U."userId", U.name, U."profileImage", U.city,
  EXISTS (SELECT 1 FROM relationships R WHERE R."followerUserId" = $1 AND R."followedUserId" = U."userId") AS "isFollowing"
  FROM users U
  WHERE ${norm("U.name")} LIKE ${norm("$3")} OR ${norm("U.name")} % ${norm("$2")}
  ORDER BY (${norm("U.name")} LIKE ${norm("$5")}) DESC, similarity(${norm("U.name")}, ${norm("$2")}) DESC, U.name, U."userId"
  LIMIT $4`;

export const searchGroupsQuery = `SELECT G."groupId", G.name, G.description, G.image,
  (SELECT COUNT(*)::int FROM group_members M WHERE M."groupId" = G."groupId") AS "memberCount",
  EXISTS (SELECT 1 FROM group_members M WHERE M."groupId" = G."groupId" AND M."userId" = $1) AS "isMember"
  FROM groups G
  WHERE ${norm("G.name")} LIKE ${norm("$3")} OR ${norm("G.name")} % ${norm("$2")}
  ORDER BY (${norm("G.name")} LIKE ${norm("$5")}) DESC, similarity(${norm("G.name")}, ${norm("$2")}) DESC, G.name, G."groupId"
  LIMIT $4`;

// Rich post rows, newest first. Group posts only for the group's members.
export const searchPostsQuery = `SELECT ${POST_COLUMNS}
  ${POST_FROM}
  WHERE (${norm("P.description")} LIKE ${norm("$3")} OR ${norm("$2")} <% ${norm("P.description")})
    AND (P."groupId" IS NULL OR EXISTS (SELECT 1 FROM group_members M WHERE M."groupId" = P."groupId" AND M."userId" = $1))
  ORDER BY P."createdAt" DESC, P."postId" DESC
  LIMIT $4`;
