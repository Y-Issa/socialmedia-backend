import express from "express";
import { login, register, logout, checkToken } from "../controllers/auth.js";
import { verifyToken } from "../middleware/jwtMiddleware.js";

const router = express.Router();

router.post("/login", login);
router.post("/register", register);
router.post("/logout", logout);
router.get("/check", verifyToken, checkToken);

export default router;
