import pool from "../../db.js";
import {
  getNotificationsQuery,
  markAllReadQuery,
  markReadQuery,
  unreadCountQuery,
} from "../queries.js";
import { isUuid } from "../utils/validate.js";
import { parsePage, toPage } from "../utils/pagination.js";

const DEFAULT_LIMIT = 20;
const MAX_READ_IDS = 200;

// GET /api/notifications?limit=&cursor= -> { items, nextCursor }, newest first.
export async function getNotifications(req, res) {
  const page = parsePage(req.query, DEFAULT_LIMIT);
  if (page.error) {
    return res.status(400).send(page.error);
  }

  try {
    const result = await pool.query(getNotificationsQuery, [
      req.userInfo.id,
      page.at,
      page.postId,
      page.limit + 1,
    ]);
    res.status(200).json(toPage(result.rows, page.limit, "notificationId"));
  } catch (error) {
    console.error("getNotifications:", error);
    res.status(500).send("Server error");
  }
}

// GET /api/notifications/unread-count -> { count }
export async function getUnreadCount(req, res) {
  try {
    const result = await pool.query(unreadCountQuery, [req.userInfo.id]);
    res.status(200).json({ count: result.rows[0].count });
  } catch (error) {
    console.error("getUnreadCount:", error);
    res.status(500).send("Server error");
  }
}

// POST /api/notifications/read { ids?: uuid[] } -> 204
// Without ids every unread notification is marked read. Ids that aren't the
// requester's are ignored.
export async function markRead(req, res) {
  const ids = req.body?.ids;
  const { id } = req.userInfo;

  if (
    ids !== undefined &&
    ids !== null &&
    (!Array.isArray(ids) || ids.length > MAX_READ_IDS || !ids.every(isUuid))
  ) {
    return res.status(400).send("Invalid ids");
  }

  try {
    if (Array.isArray(ids)) {
      if (ids.length > 0) await pool.query(markReadQuery, [id, ids]);
    } else {
      await pool.query(markAllReadQuery, [id]);
    }
    res.status(204).send();
  } catch (error) {
    console.error("markRead:", error);
    res.status(500).send("Server error");
  }
}
