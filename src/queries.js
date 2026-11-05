// User queries

// Includes the password hash: only use it for login / password checks and
// strip the hash before sending the row anywhere.
export const checkEmailExistsQuery =
  "SELECT * FROM users WHERE LOWER(email) = LOWER($1)";

export const createUserQuery = `INSERT INTO users (name,email,password) VALUES ($1,$2,$3) RETURNING "userId", name, email, "coverImage", "profileImage", city, website`;

// Public profile columns (no password). Email is removed by the controller
// unless the requester is looking at their own profile.
export const getUserByIdQuery = `SELECT "userId", name, email, "coverImage", "profileImage", city, website FROM users WHERE "userId" = $1`;

export const getUserPasswordQuery = `SELECT password FROM users WHERE "userId" = $1`;

export const updateUserQuery = `UPDATE users SET name = $1, city = $2, website = $3, password = $4, "profileImage" = $5, "coverImage" = $6 WHERE "userId" = $7 RETURNING "userId", name, email, "coverImage", "profileImage", city, website`;

// Post queries

export const getPostsQuery = `SELECT P.*, name, "profileImage" FROM posts P JOIN users U ON P."userId" = U."userId" WHERE P."userId" = $1 OR P."userId" IN (SELECT "followedUserId" FROM relationships WHERE "followerUserId" = $1) ORDER BY P."createdAt" DESC`;

export const getUserPostsQuery = `SELECT P.*, name, "profileImage" FROM posts P JOIN users U ON P."userId" = U."userId" WHERE P."userId" = $1 ORDER BY P."createdAt" DESC`;

export const createPostQuery = `INSERT INTO posts (description, image, "userId") VALUES ($1, $2, $3) RETURNING *`;

export const deletePostQuery = `DELETE FROM posts WHERE "postId" = $1 AND "userId" = $2`;

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

export const getSavedPostsQuery = `SELECT P.*, name, "profileImage" FROM posts P JOIN saved S ON P."postId" = S."postId" JOIN users U ON P."userId" = U."userId" WHERE S."userId" = $1 ORDER BY P."createdAt" DESC`;

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

// One row if the group post exists, with its group and whether $2 is a member.
export const groupPostMembershipQuery = `SELECT P."groupId", EXISTS (SELECT 1 FROM group_members M WHERE M."groupId" = P."groupId" AND M."userId" = $2) AS "isMember" FROM group_posts P WHERE P."postId" = $1`;

export const getUnjoinedGroupsQuery = `SELECT * FROM groups WHERE "groupId" NOT IN (SELECT "groupId" FROM group_members WHERE "userId" = $1)`;

export const getJoinedGroupsQuery = `SELECT G.* FROM groups G JOIN group_members M ON G."groupId" = M."groupId" WHERE M."userId" = $1`;

export const joinGroupQuery = `INSERT INTO group_members ("groupId", "userId") VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING *`;

export const leaveGroupQuery = `DELETE FROM group_members WHERE "groupId" = $1 AND "userId" = $2`;

export const getGroupMembersQuery = `SELECT U."userId", U.name, U."profileImage" FROM users U JOIN group_members M ON U."userId" = M."userId" WHERE M."groupId" = $1`;

export const createGroupPostQuery = `INSERT INTO group_posts (description, image, "userId", "groupId") VALUES ($1, $2, $3, $4) RETURNING *`;

export const getGroupPostsQuery = `SELECT P.*, name, "profileImage" FROM group_posts P JOIN users U ON P."userId" = U."userId" WHERE "groupId" = $1 ORDER BY P."createdAt" DESC`;

// The author or the group's creator can delete a group post.
export const deleteGroupPostQuery = `DELETE FROM group_posts P WHERE P."postId" = $1 AND (P."userId" = $2 OR EXISTS (SELECT 1 FROM groups G WHERE G."groupId" = P."groupId" AND G."createdBy" = $2))`;

export const getGroupCommentsQuery = `SELECT C.*, name, "profileImage" FROM group_post_comments C JOIN users U ON C."userId" = U."userId" WHERE "postId" = $1 ORDER BY C."createdAt" DESC`;

export const createGroupCommentQuery = `INSERT INTO group_post_comments (description, "userId", "postId" ) VALUES ($1, $2, $3) RETURNING *`;

export const getGroupLikesQuery = `SELECT * FROM group_post_likes WHERE "postId" = $1`;

export const createGroupLikeQuery = `INSERT INTO group_post_likes ("postId", "userId") VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING *`;

export const deleteGroupLikeQuery = `DELETE FROM group_post_likes WHERE "postId" = $1 AND "userId" = $2`;

export const saveGroupPostQuery = `INSERT INTO saved ("groupPostId", "userId") VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING *`;

export const getSavedGroupPostsQuery = `SELECT P.*, name, "profileImage" FROM group_posts P JOIN saved S ON P."postId" = S."groupPostId" JOIN users U ON P."userId" = U."userId" WHERE S."userId" = $1 ORDER BY P."createdAt" DESC`;

export const getSavedGroupPostIdsQuery = `SELECT "groupPostId" FROM saved WHERE "userId" = $1 AND "groupPostId" IS NOT NULL`;

export const unsaveGroupPostQuery = `DELETE FROM saved WHERE "groupPostId" = $1 AND "userId" = $2`;
