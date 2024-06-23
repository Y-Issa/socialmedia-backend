export const checkEmailExistsQuery = "SELECT * FROM users WHERE email = $1";
export const createUserQuery =
  "INSERT INTO users (name,email,password) VALUES ($1,$2,$3) RETURNING *";

export const getUserByIdQuery = `SELECT * FROM users WHERE "userId" = $1`;

// //
export const getPostsQuery = `SELECT P.*, name, "profileImage" FROM posts P JOIN users U ON P."userId" = U."userId" LEFT JOIN relationships R ON (P."userId" = R."followedUserId") WHERE R."followerUserId" = $1 OR p."userId" = $1 ORDER BY P."createdAt" DESC`;

export const createPostQuery = `INSERT INTO posts (description, image, "userId") VALUES ($1, $2, $3) RETURNING *`;

// //

export const getCommentsQuery = `SELECT C.*, name, "profileImage" FROM comments C JOIN users U ON C."userId" = U."userId" WHERE "postId" = $1 ORDER BY C."createdAt" DESC`;

export const createCommentQuery = `INSERT INTO comments (description, "postId", "userId") VALUES ($1, $2, $3) RETURNING *`;

// //

export const getLikesQuery = `SELECT * FROM likes WHERE "postId" = $1`;

export const createLikeQuery = `INSERT INTO likes ("postId", "userId") VALUES ($1, $2) RETURNING *`;

export const deleteLikeQuery = `DELETE FROM likes WHERE "postId" = $1 AND "userId" = $2`;

// //

export const getRelationshipsQuery = `SELECT "followerUserId" FROM relationships WHERE "followedUserId" = $1`;

export const createRelationshipQuery = `INSERT INTO relationships ("followerUserId", "followedUserId") VALUES ($1, $2) RETURNING *`;

export const deleteRelationshipQuery = `DELETE FROM relationships WHERE "followerUserId" = $1 AND "followedUserId" = $2`;
