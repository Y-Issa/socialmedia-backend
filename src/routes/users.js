import express from "express";
import { getUser, updateUser } from "../controllers/user.js";
import { verifyToken } from "../middleware/jwtMiddleware.js";

const router = express.Router();

router.get("/find/:uid", verifyToken, getUser);
router.put("/", verifyToken, updateUser);

export default router;
