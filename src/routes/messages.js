import express from "express";
import {
  getConversations,
  getMessages,
  getOrCreateConversation,
  getUnreadCount,
  markConversationRead,
  sendMessage,
} from "../controllers/message.js";
import { verifyToken } from "../middleware/jwtMiddleware.js";
import { validateIdParam } from "../utils/validate.js";

const router = express.Router();

router.param("id", validateIdParam);

router.get("/unread-count", verifyToken, getUnreadCount);
router.get("/conversations", verifyToken, getConversations);
router.post("/conversations", verifyToken, getOrCreateConversation);
router.get("/conversations/:id/messages", verifyToken, getMessages);
router.post("/conversations/:id/messages", verifyToken, sendMessage);
router.post("/conversations/:id/read", verifyToken, markConversationRead);

export default router;
