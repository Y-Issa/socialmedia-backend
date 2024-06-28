// User queries

export const checkEmailExistsQuery = "SELECT * FROM users WHERE email = $1";

export const createUserQuery =
  "INSERT INTO users (name,email,password) VALUES ($1,$2,$3) RETURNING *";

export const getUserByIdQuery = `SELECT * FROM users WHERE "userId" = $1`;

export const updateUserQuery = `UPDATE users SET name = $1, city = $2, website = $3, password = $4, "profileImage" = $5, "coverImage" = $6 WHERE "userId" = $7 RETURNING *`;

// Post queries

export const getPostsQuery = `SELECT P.*, name, "profileImage" FROM posts P JOIN users U ON P."userId" = U."userId" LEFT JOIN relationships R ON (P."userId" = R."followedUserId") WHERE R."followerUserId" = $1 OR p."userId" = $1 ORDER BY P."createdAt" DESC`;

export const getUserPostsQuery = `SELECT P.*, name, "profileImage" FROM posts P JOIN users U ON P."userId" = U."userId" WHERE P."userId" = $1 ORDER BY P."createdAt" DESC`;

export const createPostQuery = `INSERT INTO posts (description, image, "userId") VALUES ($1, $2, $3) RETURNING *`;

export const deletePostQuery = `DELETE FROM posts WHERE "postId" = $1 AND "userId" = $2`;

// Comment queries

export const getCommentsQuery = `SELECT C.*, name, "profileImage" FROM comments C JOIN users U ON C."userId" = U."userId" WHERE "postId" = $1 ORDER BY C."createdAt" DESC`;

export const createCommentQuery = `INSERT INTO comments (description, "postId", "userId") VALUES ($1, $2, $3) RETURNING *`;

// Like queries

export const getLikesQuery = `SELECT * FROM likes WHERE "postId" = $1`;

export const createLikeQuery = `INSERT INTO likes ("postId", "userId") VALUES ($1, $2) RETURNING *`;

export const deleteLikeQuery = `DELETE FROM likes WHERE "postId" = $1 AND "userId" = $2`;

// Relationship queries

export const getRelationshipsQuery = `SELECT "followerUserId" FROM relationships WHERE "followedUserId" = $1`;

export const createRelationshipQuery = `INSERT INTO relationships ("followerUserId", "followedUserId") VALUES ($1, $2) RETURNING *`;

export const deleteRelationshipQuery = `DELETE FROM relationships WHERE "followerUserId" = $1 AND "followedUserId" = $2`;

// Saved post queries

export const savePostQuery = `INSERT INTO saved ("postId", "userId") VALUES ($1, $2) RETURNING *`;

export const getSavedPostsQuery = `SELECT P.*, name, "profileImage" FROM posts P JOIN saved S ON P."postId" = S."postId" JOIN users U ON P."userId" = U."userId" WHERE S."userId" = $1 ORDER BY P."createdAt" DESC`;

export const getSavedPostIdsQuery = `SELECT "postId" FROM saved WHERE "userId" = $1`;

export const unsavePostQuery = `DELETE FROM saved WHERE "postId" = $1 AND "userId" = $2`;

// Group queries

export const createGroupQuery = `INSERT INTO groups (name, description, image, "createdBy") VALUES ($1, $2, $3, $4) RETURNING *`;

export const deleteGroupQuery = `DELETE FROM groups WHERE "groupId" = $1 AND "createdBy" = $2`;

export const getUnjoinedGroupsQuery = `SELECT * FROM groups WHERE "groupId" NOT IN (SELECT "groupId" FROM group_members WHERE "userId" = $1)`;

export const getJoinedGroupsQuery = `SELECT G.* FROM groups G JOIN group_members M ON G."groupId" = M."groupId" WHERE M."userId" = $1`;

export const joinGroupQuery = `INSERT INTO group_members ("groupId", "userId") VALUES ($1, $2) RETURNING *`;

export const leaveGroupQuery = `DELETE FROM group_members WHERE "groupId" = $1 AND "userId" = $2`;

export const getGroupMembersQuery = `SELECT U.* FROM users U JOIN group_members M ON U."userId" = M."userId" WHERE M."groupId" = $1`;

export const createGroupPostQuery = `INSERT INTO group_posts (description, image, "userId", "groupId") VALUES ($1, $2, $3, $4) RETURNING *`;

export const getGroupPostsQuery = `SELECT P.*, name, "profileImage" FROM group_posts P JOIN users U ON P."userId" = U."userId" WHERE "groupId" = $1 ORDER BY P."createdAt" DESC`;

export const deleteGroupPostQuery = `DELETE FROM group_posts WHERE "postId" = $1 AND "userId" = $2`;

export const getGroupCommentsQuery = `SELECT C.*, name, "profileImage" FROM group_post_comments C JOIN users U ON C."userId" = U."userId" WHERE "postId" = $1 ORDER BY C."createdAt" DESC`;

export const createGroupCommentQuery = `INSERT INTO group_post_comments (description, "userId", "postId" ) VALUES ($1, $2, $3) RETURNING *`;

export const getGroupLikesQuery = `SELECT * FROM group_post_likes WHERE "postId" = $1`;

export const createGroupLikeQuery = `INSERT INTO group_post_likes ("postId", "userId") VALUES ($1, $2) RETURNING *`;

export const deleteGroupLikeQuery = `DELETE FROM group_post_likes WHERE "postId" = $1 AND "userId" = $2`;

export const saveGroupPostQuery = `INSERT INTO saved ("groupPostId", "userId") VALUES ($1, $2) RETURNING *`;

export const getSavedGroupPostsQuery = `SELECT P.*, name, "profileImage" FROM group_posts P JOIN saved S ON P."postId" = S."groupPostId" JOIN users U ON P."userId" = U."userId" WHERE S."userId" = $1 ORDER BY P."createdAt" DESC`;

export const getSavedGroupPostIdsQuery = `SELECT "groupPostId" FROM saved WHERE "userId" = $1`;

export const unsaveGroupPostQuery = `DELETE FROM saved WHERE "groupPostId" = $1 AND "userId" = $2`;
