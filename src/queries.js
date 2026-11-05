// User queries

// Includes the password hash: only use it for login / password checks and
// strip the hash before sending the row anywhere.
export const checkEmailExistsQuery =
  "SELECT * FROM users WHERE LOWER(email) = LOWER($1)";

export const createUserQuery = `INSERT INTO users (name,email,password) VALUES ($1,$2,$3) RETURNING "userId", name, email, "coverImage", "profileImage", city, website, bio, "createdAt"`;

// Public profile columns (no password). Email is removed by the controller
// unless the requester is looking at their own profile.
export const getUserByIdQuery = `SELECT "userId", name, email, "coverImage", "profileImage", city, website, bio, "createdAt" FROM users WHERE "userId" = $1`;

// Profile with follow counts; $2 is the viewer (for isFollowing).
export const getUserProfileQuery = `SELECT U."userId", U.name, U.email, U."coverImage", U."profileImage", U.city, U.website, U.bio, U."createdAt",
  (SELECT COUNT(*)::int FROM relationships R WHERE R."followedUserId" = U."userId") AS "followerCount",
  (SELECT COUNT(*)::int FROM relationships R WHERE R."followerUserId" = U."userId") AS "followingCount",
  EXISTS (SELECT 1 FROM relationships R WHERE R."followerUserId" = $2 AND R."followedUserId" = U."userId") AS "isFollowing"
  FROM users U WHERE U."userId" = $1`;

export const getFollowersQuery = `SELECT U."userId", U.name, U."profileImage" FROM relationships R JOIN users U ON U."userId" = R."followerUserId" WHERE R."followedUserId" = $1 ORDER BY U.name LIMIT 100`;

export const getFollowingQuery = `SELECT U."userId", U.name, U."profileImage" FROM relationships R JOIN users U ON U."userId" = R."followedUserId" WHERE R."followerUserId" = $1 ORDER BY U.name LIMIT 100`;

export const getUserPasswordQuery = `SELECT password FROM users WHERE "userId" = $1`;

// $8 says whether the request sent a bio; when it didn't, the bio is kept.
export const updateUserQuery = `UPDATE users SET name = $1, city = $2, website = $3, password = $4, "profileImage" = $5, "coverImage" = $6,
  bio = CASE WHEN $8::boolean THEN $9 ELSE bio END
  WHERE "userId" = $7 RETURNING "userId", name, email, "coverImage", "profileImage", city, website, bio, "createdAt"`;

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

export const POST_COLUMNS = `P."postId", P.description, P.image, P."createdAt", P."editedAt", P."userId",
  U.name, U."profileImage", P."groupId", G.name AS "groupName",
  (SELECT COUNT(*)::int FROM likes L WHERE L."postId" = P."postId") AS "likeCount",
  (SELECT COUNT(*)::int FROM comments C WHERE C."postId" = P."postId") AS "commentCount",
  EXISTS (SELECT 1 FROM likes L WHERE L."postId" = P."postId" AND L."userId" = $1) AS "likedByMe",
  EXISTS (SELECT 1 FROM saved S2 WHERE S2."postId" = P."postId" AND S2."userId" = $1) AS "savedByMe"`;

export const POST_FROM = `FROM posts P
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

// One rich post row; $1 viewer, $2 postId.
export const getPostRowQuery = `SELECT ${POST_COLUMNS} ${POST_FROM} WHERE P."postId" = $2`;

// The post's image if $2 wrote it (used to validate an edit).
export const getOwnPostQuery = `SELECT image FROM posts WHERE "postId" = $1 AND "userId" = $2`;

export const editPostQuery = `UPDATE posts SET description = $1, "editedAt" = CURRENT_TIMESTAMP WHERE "postId" = $2 AND "userId" = $3`;

// The author can delete any of their posts; a group's creator can also
// delete posts made in that group.
export const deletePostQuery = `DELETE FROM posts P WHERE P."postId" = $1 AND (P."userId" = $2 OR EXISTS (SELECT 1 FROM groups G WHERE G."groupId" = P."groupId" AND G."createdBy" = $2))`;

// One row if the post exists. "canAccess" is false only for a group post
// whose group $2 is not a member of.
export const postAccessQuery = `SELECT P."groupId", (P."groupId" IS NULL OR EXISTS (SELECT 1 FROM group_members M WHERE M."groupId" = P."groupId" AND M."userId" = $2)) AS "canAccess" FROM posts P WHERE P."postId" = $1`;

// Comment queries

export const getCommentsQuery = `SELECT C."commentId", C."userId", C."postId", C.description, C."createdAt", U.name, U."profileImage"
  FROM comments C JOIN users U ON C."userId" = U."userId" WHERE C."postId" = $1 ORDER BY C."createdAt" DESC`;

export const createCommentQuery = `INSERT INTO comments (description, "postId", "userId") VALUES ($1, $2, $3) RETURNING *`;

// The comment's author or the post's author may delete a comment.
export const deleteCommentQuery = `DELETE FROM comments C WHERE C."commentId" = $1
  AND (C."userId" = $2 OR EXISTS (SELECT 1 FROM posts P WHERE P."postId" = C."postId" AND P."userId" = $2))`;

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

// Notification queries
//
// Inserts never notify the actor about their own action and use
// ON CONFLICT DO NOTHING with the partial unique indexes on like / follow /
// group_join, so repeating an action never stacks duplicates.

// $1 postId, $2 actor
export const notifyLikeQuery = `INSERT INTO notifications ("recipientId", "actorId", type, "postId")
  SELECT P."userId", $2, 'like', P."postId" FROM posts P WHERE P."postId" = $1 AND P."userId" <> $2
  ON CONFLICT DO NOTHING`;

// $1 postId, $2 actor, $3 commentId
export const notifyCommentQuery = `INSERT INTO notifications ("recipientId", "actorId", type, "postId", "commentId")
  SELECT P."userId", $2, 'comment', P."postId", $3 FROM posts P WHERE P."postId" = $1 AND P."userId" <> $2
  ON CONFLICT DO NOTHING`;

// $1 followed user, $2 actor
export const notifyFollowQuery = `INSERT INTO notifications ("recipientId", "actorId", type)
  SELECT $1, $2, 'follow' WHERE $1::uuid <> $2::uuid
  ON CONFLICT DO NOTHING`;

// $1 groupId, $2 actor; the group's creator is notified.
export const notifyGroupJoinQuery = `INSERT INTO notifications ("recipientId", "actorId", type, "groupId")
  SELECT G."createdBy", $2, 'group_join', G."groupId" FROM groups G
  WHERE G."groupId" = $1 AND G."createdBy" IS NOT NULL AND G."createdBy" <> $2
  ON CONFLICT DO NOTHING`;

export const unnotifyLikeQuery = `DELETE FROM notifications WHERE type = 'like' AND "postId" = $1 AND "actorId" = $2`;
export const unnotifyFollowQuery = `DELETE FROM notifications WHERE type = 'follow' AND "recipientId" = $1 AND "actorId" = $2`;
export const unnotifyGroupJoinQuery = `DELETE FROM notifications WHERE type = 'group_join' AND "groupId" = $1 AND "actorId" = $2`;

// $1 recipient, $2 cursor createdAt, $3 cursor notificationId, $4 page size.
export const getNotificationsQuery = `SELECT N."notificationId", N.type, N."createdAt", N."readAt",
  json_build_object('userId', A."userId", 'name', A.name, 'profileImage', A."profileImage") AS actor,
  CASE WHEN P."postId" IS NULL THEN NULL ELSE json_build_object(
    'postId', P."postId", 'excerpt', NULLIF(LEFT(P.description, 80), ''), 'groupId', P."groupId") END AS post,
  CASE WHEN G."groupId" IS NULL THEN NULL ELSE json_build_object('groupId', G."groupId", 'name', G.name) END AS "group",
  CASE WHEN C."commentId" IS NULL THEN NULL ELSE json_build_object(
    'commentId', C."commentId", 'excerpt', LEFT(C.description, 80)) END AS comment,
  CASE WHEN E."eventId" IS NULL THEN NULL ELSE json_build_object(
    'eventId', E."eventId", 'title', E.title, 'startsAt', E."startsAt") END AS event,
  ${isoUtc('N."createdAt"')} AS "cursorKey"
  FROM notifications N
  JOIN users A ON A."userId" = N."actorId"
  LEFT JOIN posts P ON P."postId" = N."postId"
  LEFT JOIN groups G ON G."groupId" = N."groupId"
  LEFT JOIN comments C ON C."commentId" = N."commentId"
  LEFT JOIN events E ON E."eventId" = N."eventId"
  WHERE N."recipientId" = $1
    AND ($2::timestamptz IS NULL OR (N."createdAt", N."notificationId") < ($2::timestamptz, $3::uuid))
  ORDER BY N."createdAt" DESC, N."notificationId" DESC LIMIT $4`;

export const unreadCountQuery = `SELECT COUNT(*)::int AS count FROM notifications WHERE "recipientId" = $1 AND "readAt" IS NULL`;

export const markAllReadQuery = `UPDATE notifications SET "readAt" = CURRENT_TIMESTAMP WHERE "recipientId" = $1 AND "readAt" IS NULL`;

export const markReadQuery = `UPDATE notifications SET "readAt" = CURRENT_TIMESTAMP
  WHERE "recipientId" = $1 AND "readAt" IS NULL AND "notificationId" = ANY($2::uuid[])`;

// Search queries live in ../searchQueries.js (accent-insensitive).

// Suggestions: users $1 doesn't follow (never $1). Friends of friends first
// (by mutualCount), then by follower count, then newest accounts.
// "mutualName" is one of the people $1 follows who follows the candidate.
export const suggestionsQuery = `WITH mine AS (
    SELECT "followedUserId" AS id FROM relationships WHERE "followerUserId" = $1
  )
  SELECT U."userId", U.name, U."profileImage", U.city,
    (SELECT COUNT(*)::int FROM relationships R
       WHERE R."followedUserId" = U."userId" AND R."followerUserId" IN (SELECT id FROM mine)) AS "mutualCount",
    (SELECT M.name FROM relationships R JOIN users M ON M."userId" = R."followerUserId"
       WHERE R."followedUserId" = U."userId" AND R."followerUserId" IN (SELECT id FROM mine)
       ORDER BY M.name LIMIT 1) AS "mutualName",
    (SELECT COUNT(*)::int FROM relationships R WHERE R."followedUserId" = U."userId") AS "followerCount"
  FROM users U
  WHERE U."userId" <> $1 AND U."userId" NOT IN (SELECT id FROM mine)
  ORDER BY "mutualCount" DESC, "followerCount" DESC, U."createdAt" DESC, U."userId"
  LIMIT $2`;
