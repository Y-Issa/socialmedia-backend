import express from "express";
import { search } from "../controllers/search.js";
import { verifyToken } from "../middleware/jwtMiddleware.js";

const router = express.Router();

router.get("/", verifyToken, search);

export default router;
