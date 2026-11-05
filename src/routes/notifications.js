import express from "express";
import {
  getNotifications,
  getUnreadCount,
  markRead,
} from "../controllers/notification.js";
import { verifyToken } from "../middleware/jwtMiddleware.js";

const router = express.Router();

router.get("/", verifyToken, getNotifications);
router.get("/unread-count", verifyToken, getUnreadCount);
router.post("/read", verifyToken, markRead);

export default router;
