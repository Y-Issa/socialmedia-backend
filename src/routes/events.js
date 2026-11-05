import express from "express";
import { verifyToken } from "../middleware/jwtMiddleware.js";
import { validateIdParam } from "../utils/validate.js";
import {
  clearRsvp,
  createEvent,
  deleteEvent,
  getEvent,
  getEventGoing,
  getGroupEvents,
  getMyEvents,
  setRsvp,
  updateEvent,
} from "../controllers/event.js";

// Mounted at /api/events.
const router = express.Router();

router.param("eventId", validateIdParam);

router.get("/", verifyToken, getMyEvents);
router.get("/:eventId", verifyToken, getEvent);
router.patch("/:eventId", verifyToken, updateEvent);
router.delete("/:eventId", verifyToken, deleteEvent);
router.get("/:eventId/going", verifyToken, getEventGoing);
router.put("/:eventId/rsvp", verifyToken, setRsvp);
router.delete("/:eventId/rsvp", verifyToken, clearRsvp);

export default router;

// Mounted at /api/groups/:groupId/events (the controller validates :groupId).
export const groupEventsRouter = express.Router({ mergeParams: true });

groupEventsRouter.get("/", verifyToken, getGroupEvents);
groupEventsRouter.post("/", verifyToken, createEvent);
