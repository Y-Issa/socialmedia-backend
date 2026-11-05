import pool from "../../db.js";
import { groupMembershipQuery } from "../queries.js";
import {
  createEventQuery,
  deleteEventQuery,
  deleteRsvpQuery,
  eventAccessQuery,
  eventGoingQuery,
  getEventFieldsQuery,
  getEventQuery,
  groupPastEventsQuery,
  groupUpcomingEventsQuery,
  myPastEventsQuery,
  myUpcomingEventsQuery,
  notifyEventQuery,
  updateEventQuery,
  upsertRsvpQuery,
} from "../queries/events.js";
import { cleanString, isUuid, optionalString } from "../utils/validate.js";
import { NOT_MEMBER } from "../utils/access.js";
import { notify } from "../utils/notify.js";

export const TITLE_MAX = 120;
export const DESCRIPTION_MAX = 2000;
export const LOCATION_MAX = 200;
const RSVP_STATUSES = ["going", "interested"];
const NOT_ALLOWED = "Only the event's creator or the group owner can do that";

// Parses an ISO date string. Returns a Date, null (absent) or undefined (bad).
function parseDate(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function parseScope(query) {
  const scope = query.scope ?? "upcoming";
  return scope === "upcoming" || scope === "past" ? scope : null;
}

// Validates title/description/location/dates. Returns an error or null.
function fieldsError({ title, description, location, startsAt, endsAt }) {
  if (!title) return "Event title is required";
  if (title.length > TITLE_MAX) {
    return `Event title is too long (max ${TITLE_MAX} characters)`;
  }
  if (description && description.length > DESCRIPTION_MAX) {
    return `Description is too long (max ${DESCRIPTION_MAX} characters)`;
  }
  if (location && location.length > LOCATION_MAX) {
    return `Location is too long (max ${LOCATION_MAX} characters)`;
  }
  if (startsAt === undefined) return "Invalid start time";
  if (startsAt === null) return "Start time is required";
  if (endsAt === undefined) return "Invalid end time";
  if (endsAt && endsAt <= startsAt) return "End time must be after the start time";
  return null;
}

async function loadEvent(res, eventId, viewerId, status = 200) {
  const { rows } = await pool.query(getEventQuery, [viewerId, eventId]);
  if (rows.length === 0) return res.status(404).send("Event not found");
  return res.status(status).json(rows[0]);
}

// Sends 404/403 and returns null unless userId is a member of the event's
// group; otherwise returns the access row.
async function ensureEventMember(res, eventId, userId) {
  if (!isUuid(eventId)) {
    res.status(400).send("Invalid id");
    return null;
  }
  const { rows } = await pool.query(eventAccessQuery, [eventId, userId]);
  if (rows.length === 0) {
    res.status(404).send("Event not found");
    return null;
  }
  if (!rows[0].isMember) {
    res.status(403).send(NOT_MEMBER);
    return null;
  }
  return rows[0];
}

async function ensureGroupMember(res, groupId, userId) {
  if (!isUuid(groupId)) {
    res.status(400).send("Invalid id");
    return false;
  }
  const { rows } = await pool.query(groupMembershipQuery, [groupId, userId]);
  if (rows.length === 0) {
    res.status(404).send("Group not found");
    return false;
  }
  if (!rows[0].isMember) {
    res.status(403).send(NOT_MEMBER);
    return false;
  }
  return true;
}

// POST /api/groups/:groupId/events -> 201 event row
export async function createEvent(req, res) {
  const { id } = req.userInfo;
  const { groupId } = req.params;
  const body = req.body ?? {};
  const fields = {
    title: cleanString(body.title),
    description: optionalString(body.description),
    location: optionalString(body.location),
    startsAt: parseDate(body.startsAt),
    endsAt: parseDate(body.endsAt),
  };

  try {
    if (!(await ensureGroupMember(res, groupId, id))) return;
    const error = fieldsError(fields);
    if (error) return res.status(400).send(error);
    if (fields.startsAt <= new Date()) {
      return res.status(400).send("Start time must be in the future");
    }

    const { rows } = await pool.query(createEventQuery, [
      groupId,
      id,
      fields.title,
      fields.description,
      fields.location,
      fields.startsAt,
      fields.endsAt,
    ]);
    const { eventId } = rows[0];
    await notify(notifyEventQuery, [eventId, id, groupId]);
    await loadEvent(res, eventId, id, 201);
  } catch (error) {
    console.error("createEvent:", error);
    res.status(500).send("Server error");
  }
}

// GET /api/groups/:groupId/events?scope=upcoming|past -> [event rows]
export async function getGroupEvents(req, res) {
  const { id } = req.userInfo;
  const { groupId } = req.params;
  const scope = parseScope(req.query);
  if (!scope) return res.status(400).send("Invalid scope");

  try {
    if (!(await ensureGroupMember(res, groupId, id))) return;
    const query =
      scope === "past" ? groupPastEventsQuery : groupUpcomingEventsQuery;
    const { rows } = await pool.query(query, [id, groupId]);
    res.status(200).json(rows);
  } catch (error) {
    console.error("getGroupEvents:", error);
    res.status(500).send("Server error");
  }
}

// GET /api/events?scope=upcoming|past -> events across the viewer's groups
export async function getMyEvents(req, res) {
  const { id } = req.userInfo;
  const scope = parseScope(req.query);
  if (!scope) return res.status(400).send("Invalid scope");

  try {
    const query = scope === "past" ? myPastEventsQuery : myUpcomingEventsQuery;
    const { rows } = await pool.query(query, [id]);
    res.status(200).json(rows);
  } catch (error) {
    console.error("getMyEvents:", error);
    res.status(500).send("Server error");
  }
}

// GET /api/events/:eventId -> event row
export async function getEvent(req, res) {
  const { id } = req.userInfo;
  try {
    if (!(await ensureEventMember(res, req.params.eventId, id))) return;
    await loadEvent(res, req.params.eventId, id);
  } catch (error) {
    console.error("getEvent:", error);
    res.status(500).send("Server error");
  }
}

// GET /api/events/:eventId/going -> first 8 people going
export async function getEventGoing(req, res) {
  const { id } = req.userInfo;
  try {
    if (!(await ensureEventMember(res, req.params.eventId, id))) return;
    const { rows } = await pool.query(eventGoingQuery, [req.params.eventId]);
    res.status(200).json(rows);
  } catch (error) {
    console.error("getEventGoing:", error);
    res.status(500).send("Server error");
  }
}

// PUT /api/events/:eventId/rsvp { status } -> 200 event row
export async function setRsvp(req, res) {
  const { id } = req.userInfo;
  const { eventId } = req.params;
  const status = req.body?.status;

  try {
    if (!(await ensureEventMember(res, eventId, id))) return;
    if (!RSVP_STATUSES.includes(status)) {
      return res.status(400).send("Status must be 'going' or 'interested'");
    }
    await pool.query(upsertRsvpQuery, [eventId, id, status]);
    await loadEvent(res, eventId, id);
  } catch (error) {
    console.error("setRsvp:", error);
    res.status(500).send("Server error");
  }
}

// DELETE /api/events/:eventId/rsvp -> 200 event row
export async function clearRsvp(req, res) {
  const { id } = req.userInfo;
  const { eventId } = req.params;

  try {
    if (!(await ensureEventMember(res, eventId, id))) return;
    await pool.query(deleteRsvpQuery, [eventId, id]);
    await loadEvent(res, eventId, id);
  } catch (error) {
    console.error("clearRsvp:", error);
    res.status(500).send("Server error");
  }
}

function canManage(access, userId) {
  return access.createdBy === userId || access.groupOwner === userId;
}

// PATCH /api/events/:eventId { title?, description?, location?, startsAt?, endsAt? }
export async function updateEvent(req, res) {
  const { id } = req.userInfo;
  const { eventId } = req.params;
  const body = req.body ?? {};

  try {
    const access = await ensureEventMember(res, eventId, id);
    if (!access) return;
    if (!canManage(access, id)) return res.status(403).send(NOT_ALLOWED);

    const { rows } = await pool.query(getEventFieldsQuery, [eventId]);
    const current = rows[0];
    const has = (key) => Object.prototype.hasOwnProperty.call(body, key);
    const fields = {
      title: has("title") ? cleanString(body.title) : current.title,
      description: has("description")
        ? optionalString(body.description)
        : current.description,
      location: has("location") ? optionalString(body.location) : current.location,
      startsAt: has("startsAt") ? parseDate(body.startsAt) : current.startsAt,
      endsAt: has("endsAt") ? parseDate(body.endsAt) : current.endsAt,
    };
    const error = fieldsError(fields);
    if (error) return res.status(400).send(error);
    if (
      has("startsAt") &&
      fields.startsAt.getTime() !== current.startsAt.getTime() &&
      fields.startsAt <= new Date()
    ) {
      return res.status(400).send("Start time must be in the future");
    }

    await pool.query(updateEventQuery, [
      eventId,
      fields.title,
      fields.description,
      fields.location,
      fields.startsAt,
      fields.endsAt,
    ]);
    await loadEvent(res, eventId, id);
  } catch (error) {
    console.error("updateEvent:", error);
    res.status(500).send("Server error");
  }
}

// DELETE /api/events/:eventId -> 204
export async function deleteEvent(req, res) {
  const { id } = req.userInfo;
  const { eventId } = req.params;

  try {
    const access = await ensureEventMember(res, eventId, id);
    if (!access) return;
    if (!canManage(access, id)) return res.status(403).send(NOT_ALLOWED);
    await pool.query(deleteEventQuery, [eventId]);
    res.status(204).send();
  } catch (error) {
    console.error("deleteEvent:", error);
    res.status(500).send("Server error");
  }
}
