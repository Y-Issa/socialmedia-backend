import jwt from "jsonwebtoken";
import "dotenv/config.js";

// Responds 401 for a missing, malformed, invalid or expired token so the
// frontend can log the user out.
export function verifyToken(req, res, next) {
  const { authorization } = req.headers;

  if (!authorization) {
    return res.status(401).send("Unauthorized");
  }

  const [scheme, token] = authorization.split(" ");
  if (scheme !== "Bearer" || !token) {
    return res.status(401).send("Unauthorized");
  }

  jwt.verify(token, process.env.JWT_SECRET, (error, userInfo) => {
    if (error || !userInfo || !userInfo.id) {
      return res.status(401).send("Unauthorized");
    }

    req.userInfo = userInfo;
    next();
  });
}
