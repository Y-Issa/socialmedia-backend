export const checkEmailExistsQuery = "SELECT * FROM users WHERE email = $1";
export const createUserQuery =
  "INSERT INTO users (name,email,password) VALUES ($1,$2,$3) RETURNING *";

export const getUserByIdQuery = "SELECT * FROM users WHERE id = $1";

export const getPostsQuery = `SELECT P.*, name, "profileImage" FROM posts P JOIN users U ON P."userId" = U."userId" LEFT JOIN relationships R ON (P."userId" = R."followedUserId") WHERE R."followerUserId" = $1 OR p."userId" = $1 ORDER BY P."createdAt" DESC`;

export const createPostQuery = `INSERT INTO posts (description, image, "userId") VALUES ($1, $2, $3) RETURNING *`;
