// User queries

// Includes the password hash: only use it for login / password checks and
// strip the hash before sending the row anywhere.
export const checkEmailExistsQuery =
  "SELECT * FROM users WHERE LOWER(email) = LOWER($1)";

export const createUserQuery = `INSERT INTO users (name,email,password) VALUES ($1,$2,$3) RETURNING "userId", name, email, "coverImage", "profileImage", city, website`;

// Public profile columns (no password). Email is removed by the controller
// unless the requester is looking at their own profile.
export const getUserByIdQuery = `SELECT "userId", name, email, "coverImage", "profileImage", city, website FROM users WHERE "userId" = $1`;

// Profile with follow counts; $2 is the viewer (for isFollowing).
export const getUserProfileQuery = `SELECT U."userId", U.name, U.email, U."coverImage", U."profileImage", U.city, U.website,
  (SELECT COUNT(*)::int FROM relationships R WHERE R."followedUserId" = U."userId") AS "followerCount",
  (SELECT COUNT(*)::int FROM relationships R WHERE R."followerUserId" = U."userId") AS "followingCount",
  EXISTS (SELECT 1 FROM relationships R WHERE R."followerUserId" = $2 AND R."followedUserId" = U."userId") AS "isFollowing"
  FROM users U WHERE U."userId" = $1`;

export const getFollowersQuery = `SELECT U."userId", U.name, U."profileImage" FROM relationships R JOIN users U ON U."userId" = R."followerUserId" WHERE R."followedUserId" = $1 ORDER BY U.name LIMIT 100`;

export const getFollowingQuery = `SELECT U."userId", U.name, U."profileImage" FROM relationships R JOIN users U ON U."userId" = R."followedUserId" WHERE R."followerUserId" = $1 ORDER BY U.name LIMIT 100`;

export const getUserPasswordQuery = `SELECT password FROM users WHERE "userId" = $1`;

export const updateUserQuery = `UPDATE users SET name = $1, city = $2, website = $3, password = $4, "profileImage" = $5, "coverImage" = $6 WHERE "userId" = $7 RETURNING "userId", name, email, "coverImage", "profileImage", city, website`;

// Post queries
//
// Every post list returns the same "rich" row (see POST_COLUMNS) and uses
// keyset pagination. Shared parameters:
//   $1 viewer userId (for likedByMe / savedByMe)
//   $2 cursor timestamp (timestamptz, NULL for the first page)
//   $3 cursor postId (uuid, NULL for the first page)
//   $4 page size (the controller asks for limit + 1 to detect a next page)
//   $5 list-specific id (profile userId / groupId), where used
// "cursorKey" is the row's sort timestamp as an exact UTC ISO string with
// microseconds; the controller turns it into the opaque cursor and strips it.

const isoUtc = (column) =>
  `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

const POST_COLUMNS = `P."postId", P.description, P.image, P."createdAt", P."userId",
  U.name, U."profileImage", P."groupId", G.name AS "groupName",
  (SELECT COUNT(*)::int FROM likes L WHERE L."postId" = P."postId") AS "likeCount",
  (SELECT COUNT(*)::int FROM comments C WHERE C."postId" = P."postId") AS "commentCount",
  EXISTS (SELECT 1 FROM likes L WHERE L."postId" = P."postId" AND L."userId" = $1) AS "likedByMe",
  EXISTS (SELECT 1 FROM saved S2 WHERE S2."postId" = P."postId" AND S2."userId" = $1) AS "savedByMe"`;

const POST_FROM = `FROM posts P
  JOIN users U ON U."userId" = P."userId"
  LEFT JOIN groups G ON G."groupId" = P."groupId"`;

const POST_CURSOR = `($2::timestamptz IS NULL OR (P."createdAt", P."postId") < ($2::timestamptz, $3::uuid))`;
const POST_ORDER = `ORDER BY P."createdAt" DESC, P."postId" DESC LIMIT $4`;

// Home feed: own + followed users' posts, never group posts.
export const getFeedQuery = `SELECT ${POST_COLUMNS}, ${isoUtc('P."createdAt"')} AS "cursorKey"
  ${POST_FROM}
  WHERE P."groupId" IS NULL
    AND (P."userId" = $1 OR P."userId" IN (SELECT "followedUserId" FROM relationships WHERE "followerUserId" = $1))
    AND ${POST_CURSOR}
  ${POST_ORDER}`;

// Profile: one user's posts, never group posts.
export const getUserPostsQuery = `SELECT ${POST_COLUMNS}, ${isoUtc('P."createdAt"')} AS "cursorKey"
  ${POST_FROM}
  WHERE P."groupId" IS NULL AND P."userId" = $5 AND ${POST_CURSOR}
  ${POST_ORDER}`;

// One group's posts (membership is checked by the controller).
export const getGroupPostsQuery = `SELECT ${POST_COLUMNS}, ${isoUtc('P."createdAt"')} AS "cursorKey"
  ${POST_FROM}
  WHERE P."groupId" = $5 AND ${POST_CURSOR}
  ${POST_ORDER}`;

// Saved posts, newest save first (cursor on savedAt + postId). Group posts
// only show while the viewer is still a member of that group.
export const getSavedPostsQuery = `SELECT ${POST_COLUMNS}, S."savedAt", ${isoUtc('S."savedAt"')} AS "cursorKey"
  FROM saved S
  JOIN posts P ON P."postId" = S."postId"
  JOIN users U ON U."userId" = P."userId"
  LEFT JOIN groups G ON G."groupId" = P."groupId"
  WHERE S."userId" = $1
    AND (P."groupId" IS NULL OR EXISTS (SELECT 1 FROM group_members M WHERE M."groupId" = P."groupId" AND M."userId" = $1))
    AND ($2::timestamptz IS NULL OR (S."savedAt", P."postId") < ($2::timestamptz, $3::uuid))
  ORDER BY S."savedAt" DESC, P."postId" DESC LIMIT $4`;

export const createPostQuery = `INSERT INTO posts (description, image, "userId") VALUES ($1, $2, $3) RETURNING *`;

export const createGroupPostQuery = `INSERT INTO posts (description, image, "userId", "groupId") VALUES ($1, $2, $3, $4) RETURNING *`;

// The author can delete any of their posts; a group's creator can also
// delete posts made in that group.
export const deletePostQuery = `DELETE FROM posts P WHERE P."postId" = $1 AND (P."userId" = $2 OR EXISTS (SELECT 1 FROM groups G WHERE G."groupId" = P."groupId" AND G."createdBy" = $2))`;

// One row if the post exists. "canAccess" is false only for a group post
// whose group $2 is not a member of.
export const postAccessQuery = `SELECT P."groupId", (P."groupId" IS NULL OR EXISTS (SELECT 1 FROM group_members M WHERE M."groupId" = P."groupId" AND M."userId" = $2)) AS "canAccess" FROM posts P WHERE P."postId" = $1`;

// Comment queries

export const getCommentsQuery = `SELECT C.*, name, "profileImage" FROM comments C JOIN users U ON C."userId" = U."userId" WHERE "postId" = $1 ORDER BY C."createdAt" DESC`;

export const createCommentQuery = `INSERT INTO comments (description, "postId", "userId") VALUES ($1, $2, $3) RETURNING *`;

// Like queries

export const getLikesQuery = `SELECT * FROM likes WHERE "postId" = $1`;

export const createLikeQuery = `INSERT INTO likes ("postId", "userId") VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING *`;

export const deleteLikeQuery = `DELETE FROM likes WHERE "postId" = $1 AND "userId" = $2`;

// Relationship queries

export const getRelationshipsQuery = `SELECT "followerUserId" FROM relationships WHERE "followedUserId" = $1`;

export const createRelationshipQuery = `INSERT INTO relationships ("followerUserId", "followedUserId") VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING *`;

export const deleteRelationshipQuery = `DELETE FROM relationships WHERE "followerUserId" = $1 AND "followedUserId" = $2`;

// Saved post queries

export const savePostQuery = `INSERT INTO saved ("postId", "userId") VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING *`;

export const getSavedPostIdsQuery = `SELECT "postId" FROM saved WHERE "userId" = $1 AND "postId" IS NOT NULL`;

export const unsavePostQuery = `DELETE FROM saved WHERE "postId" = $1 AND "userId" = $2`;

// Group queries

export const createGroupQuery = `INSERT INTO groups (name, description, image, "createdBy") VALUES ($1, $2, $3, $4) RETURNING *`;

export const deleteGroupQuery = `DELETE FROM groups WHERE "groupId" = $1 AND "createdBy" = $2`;

export const getGroupQuery = `SELECT G."groupId", G.name, G.description, G.image, G."createdBy", G."createdAt",
  (SELECT COUNT(*)::int FROM group_members M WHERE M."groupId" = G."groupId") AS "memberCount",
  EXISTS (SELECT 1 FROM group_members M WHERE M."groupId" = G."groupId" AND M."userId" = $2) AS "isMember"
  FROM groups G WHERE G."groupId" = $1`;

// One row if the group exists; "isMember" tells whether $2 belongs to it.
export const groupMembershipQuery = `SELECT G."createdBy", EXISTS (SELECT 1 FROM group_members M WHERE M."groupId" = G."groupId" AND M."userId" = $2) AS "isMember" FROM groups G WHERE G."groupId" = $1`;

export const getUnjoinedGroupsQuery = `SELECT * FROM groups WHERE "groupId" NOT IN (SELECT "groupId" FROM group_members WHERE "userId" = $1)`;

export const getJoinedGroupsQuery = `SELECT G.* FROM groups G JOIN group_members M ON G."groupId" = M."groupId" WHERE M."userId" = $1`;

export const joinGroupQuery = `INSERT INTO group_members ("groupId", "userId") VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING *`;

export const leaveGroupQuery = `DELETE FROM group_members WHERE "groupId" = $1 AND "userId" = $2`;

export const getGroupMembersQuery = `SELECT U."userId", U.name, U."profileImage" FROM users U JOIN group_members M ON U."userId" = M."userId" WHERE M."groupId" = $1`;
