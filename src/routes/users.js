import express from "express";
import {
  getFollowers,
  getFollowing,
  getSuggestions,
  getUser,
  updateUser,
} from "../controllers/user.js";
import { verifyToken } from "../middleware/jwtMiddleware.js";
import { validateIdParam } from "../utils/validate.js";

const router = express.Router();

router.param("uid", validateIdParam);

router.get("/suggestions", verifyToken, getSuggestions);
router.get("/find/:uid", verifyToken, getUser);
router.get("/:uid/followers", verifyToken, getFollowers);
router.get("/:uid/following", verifyToken, getFollowing);
router.put("/", verifyToken, updateUser);

export default router;
