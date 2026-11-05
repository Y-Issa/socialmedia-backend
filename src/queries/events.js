// Event queries. $1 is always the viewer (for "myRsvp") unless noted.
//
// An event is "upcoming" until it has ended: endsAt when set, otherwise
// startsAt. "past" is everything else, most recent first.

const EVENT_COLUMNS = `E."eventId", E."groupId", G.name AS "groupName", E.title, E.description,
  E.location, E."startsAt", E."endsAt", E."createdAt",
  CASE WHEN U."userId" IS NULL THEN NULL ELSE json_build_object(
    'userId', U."userId", 'name', U.name, 'profileImage', U."profileImage") END AS "createdBy",
  (SELECT COUNT(*)::int FROM event_rsvps R WHERE R."eventId" = E."eventId" AND R.status = 'going') AS "goingCount",
  (SELECT COUNT(*)::int FROM event_rsvps R WHERE R."eventId" = E."eventId" AND R.status = 'interested') AS "interestedCount",
  (SELECT R.status FROM event_rsvps R WHERE R."eventId" = E."eventId" AND R."userId" = $1) AS "myRsvp"`;

const EVENT_FROM = `FROM events E
  JOIN groups G ON G."groupId" = E."groupId"
  LEFT JOIN users U ON U."userId" = E."createdBy"`;

const ENDED = `COALESCE(E."endsAt", E."startsAt") < now()`;

// $1 viewer, $2 eventId
export const getEventQuery = `SELECT ${EVENT_COLUMNS} ${EVENT_FROM} WHERE E."eventId" = $2`;

// $1 viewer, $2 groupId
export const groupUpcomingEventsQuery = `SELECT ${EVENT_COLUMNS} ${EVENT_FROM}
  WHERE E."groupId" = $2 AND NOT ${ENDED}
  ORDER BY E."startsAt", E."eventId" LIMIT 100`;

export const groupPastEventsQuery = `SELECT ${EVENT_COLUMNS} ${EVENT_FROM}
  WHERE E."groupId" = $2 AND ${ENDED}
  ORDER BY E."startsAt" DESC, E."eventId" LIMIT 100`;

// $1 viewer: events in every group the viewer belongs to.
export const myUpcomingEventsQuery = `SELECT ${EVENT_COLUMNS} ${EVENT_FROM}
  JOIN group_members M ON M."groupId" = E."groupId" AND M."userId" = $1
  WHERE NOT ${ENDED}
  ORDER BY E."startsAt", E."eventId" LIMIT 50`;

export const myPastEventsQuery = `SELECT ${EVENT_COLUMNS} ${EVENT_FROM}
  JOIN group_members M ON M."groupId" = E."groupId" AND M."userId" = $1
  WHERE ${ENDED}
  ORDER BY E."startsAt" DESC, E."eventId" LIMIT 50`;

// $1 eventId, $2 userId -> the event's group owner, creator and membership.
export const eventAccessQuery = `SELECT E."groupId", E."createdBy", E."startsAt", E."endsAt",
  G."createdBy" AS "groupOwner",
  EXISTS (SELECT 1 FROM group_members M WHERE M."groupId" = E."groupId" AND M."userId" = $2) AS "isMember"
  FROM events E JOIN groups G ON G."groupId" = E."groupId" WHERE E."eventId" = $1`;

export const createEventQuery = `INSERT INTO events ("groupId", "createdBy", title, description, location, "startsAt", "endsAt")
  VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING "eventId"`;

export const updateEventQuery = `UPDATE events SET title = $2, description = $3, location = $4,
  "startsAt" = $5, "endsAt" = $6 WHERE "eventId" = $1`;

export const getEventFieldsQuery = `SELECT title, description, location, "startsAt", "endsAt" FROM events WHERE "eventId" = $1`;

export const deleteEventQuery = `DELETE FROM events WHERE "eventId" = $1`;

// $1 eventId, $2 userId, $3 status
export const upsertRsvpQuery = `INSERT INTO event_rsvps ("eventId", "userId", status) VALUES ($1, $2, $3)
  ON CONFLICT ("eventId", "userId") DO UPDATE SET status = EXCLUDED.status, "createdAt" = CURRENT_TIMESTAMP`;

export const deleteRsvpQuery = `DELETE FROM event_rsvps WHERE "eventId" = $1 AND "userId" = $2`;

// $1 eventId -> first 8 people going, earliest RSVP first.
export const eventGoingQuery = `SELECT U."userId", U.name, U."profileImage" FROM event_rsvps R
  JOIN users U ON U."userId" = R."userId"
  WHERE R."eventId" = $1 AND R.status = 'going'
  ORDER BY R."createdAt", U."userId" LIMIT 8`;

// $1 eventId, $2 creator, $3 groupId: tell every other member.
export const notifyEventQuery = `INSERT INTO notifications ("recipientId", "actorId", type, "groupId", "eventId")
  SELECT M."userId", $2, 'event', $3, $1 FROM group_members M
  WHERE M."groupId" = $3 AND M."userId" <> $2
  ON CONFLICT DO NOTHING`;
