// Smoke test for the Events API. Needs the API running, seeded users and
// groups, and migrations/007_events.sql applied.
//
//   node scripts/smoke-events.mjs
//   API_URL=http://localhost:8021/api node scripts/smoke-events.mjs
//
// Every event the script creates (with its RSVPs and notifications) is
// deleted again before it exits.

import "dotenv/config";
import pool from "../db.js";

const API = process.env.API_URL || "http://localhost:8011/api";
const PASSWORD = "test1234";
const MISSING_ID = "00000000-0000-4000-8000-000000000000";
const HOUR = 60 * 60 * 1000;

let passed = 0;
let failed = 0;
const created = [];

function check(name, condition, detail = "") {
  if (condition) {
    passed++;
    console.log(`  ok    ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ""}`);
  }
}

async function call(method, path, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(API + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = text;
  try {
    data = JSON.parse(text);
  } catch {
    // plain-text body
  }
  return { status: res.status, data };
}

function expectStatus(name, res, status) {
  check(
    name,
    res.status === status,
    `got ${res.status} ${String(JSON.stringify(res.data)).slice(0, 120)}`
  );
}

async function login(who) {
  const res = await call("POST", "/auth/login", {
    body: { email: `${who}@communet.dev`, password: PASSWORD },
  });
  if (res.status !== 200) throw new Error(`login ${who} failed: ${res.status}`);
  const token = res.data.token ?? res.data.accessToken;
  const id = res.data.user?.userId ?? res.data.userId;
  return { token, id };
}

const inHours = (hours) => new Date(Date.now() + hours * HOUR).toISOString();

const ROW_KEYS =
  "createdAt,createdBy,description,endsAt,eventId,goingCount,groupId,groupName,interestedCount,location,myRsvp,startsAt,title";

async function main() {
  const [test, sara, omar, james] = await Promise.all(
    ["test", "sara", "omar", "james"].map(login)
  );
  const { rows: groupRows } = await pool.query(
    `SELECT "groupId", name FROM groups WHERE name IN ('Photography', 'Web Developers')`
  );
  const photo = groupRows.find((g) => g.name === "Photography")?.groupId;
  if (!photo) throw new Error("Photography group not found (seed first)");
  const base = `/groups/${photo}/events`;

  console.log("Create");
  const good = {
    title: "  Smoke photo walk  ",
    description: "Bring a camera",
    location: "Riverside",
    startsAt: inHours(48),
    endsAt: inHours(50),
  };
  expectStatus("non-member create -> 403", await call("POST", base, { token: james.token, body: good }), 403);
  expectStatus("missing group -> 404", await call("POST", `/groups/${MISSING_ID}/events`, { token: sara.token, body: good }), 404);
  expectStatus("bad group id -> 400", await call("POST", `/groups/nope/events`, { token: sara.token, body: good }), 400);
  const noTitle = await call("POST", base, { token: sara.token, body: { ...good, title: "  " } });
  check("missing title -> 400", noTitle.status === 400 && /title is required/i.test(noTitle.data), noTitle.data);
  const longTitle = await call("POST", base, { token: sara.token, body: { ...good, title: "x".repeat(121) } });
  check("long title -> 400", longTitle.status === 400 && /too long/i.test(longTitle.data), longTitle.data);
  const past = await call("POST", base, { token: sara.token, body: { ...good, startsAt: inHours(-1), endsAt: null } });
  check("past start -> 400", past.status === 400 && /in the future/i.test(past.data), past.data);
  const badEnd = await call("POST", base, { token: sara.token, body: { ...good, endsAt: inHours(47) } });
  check("end before start -> 400", badEnd.status === 400 && /after the start/i.test(badEnd.data), badEnd.data);
  const badDate = await call("POST", base, { token: sara.token, body: { ...good, startsAt: "tomorrow-ish" } });
  check("bad date -> 400", badDate.status === 400 && /invalid start/i.test(badDate.data), badDate.data);
  const noStart = await call("POST", base, { token: sara.token, body: { title: "x" } });
  check("missing start -> 400", noStart.status === 400 && /start time is required/i.test(noStart.data), noStart.data);

  const event = await call("POST", base, { token: sara.token, body: good });
  expectStatus("member create -> 201", event, 201);
  if (event.status !== 201) return;
  const eventId = event.data.eventId;
  created.push(eventId);
  check("row shape", Object.keys(event.data).sort().join(",") === ROW_KEYS, Object.keys(event.data).sort().join(","));
  check("title trimmed", event.data.title === "Smoke photo walk");
  check("groupName + createdBy", event.data.groupName === "Photography" && event.data.createdBy?.userId === sara.id);
  check("counts start at 0", event.data.goingCount === 0 && event.data.interestedCount === 0 && event.data.myRsvp === null);

  console.log("\nNotifications");
  const { rows: notes } = await pool.query(
    `SELECT "recipientId" FROM notifications WHERE type = 'event' AND "eventId" = $1`,
    [eventId]
  );
  const recipients = new Set(notes.map((n) => n.recipientId));
  check("members notified", recipients.has(omar.id) && recipients.has(test.id), String(notes.length));
  check("creator not notified", !recipients.has(sara.id));
  check("non-member not notified", !recipients.has(james.id));
  const omarNotes = await call("GET", "/notifications?limit=10", { token: omar.token });
  const item = omarNotes.data.items?.find((n) => n.event?.eventId === eventId);
  check(
    "notification item has event + group + actor",
    item && item.type === "event" && item.event.title === "Smoke photo walk" &&
      item.event.startsAt && item.group?.groupId === photo && item.actor.userId === sara.id,
    JSON.stringify(item).slice(0, 200)
  );
  const plain = omarNotes.data.items?.find((n) => n.type !== "event");
  check("other notifications have event: null", !plain || plain.event === null);

  console.log("\nRead");
  const upcoming = await call("GET", base, { token: test.token });
  expectStatus("group upcoming -> 200", upcoming, 200);
  check("group upcoming includes event", upcoming.data.some?.((e) => e.eventId === eventId));
  const sorted = upcoming.data.every((e, i, all) => i === 0 || all[i - 1].startsAt <= e.startsAt);
  check("group upcoming soonest first", sorted);
  const pastList = await call("GET", `${base}?scope=past`, { token: test.token });
  check("group past excludes event", pastList.status === 200 && !pastList.data.some((e) => e.eventId === eventId));
  expectStatus("bad scope -> 400", await call("GET", `${base}?scope=soon`, { token: test.token }), 400);
  expectStatus("group events non-member -> 403", await call("GET", base, { token: james.token }), 403);
  const mine = await call("GET", "/events", { token: test.token });
  check("GET /events includes event", mine.status === 200 && mine.data.some((e) => e.eventId === eventId));
  const jamesMine = await call("GET", "/events", { token: james.token });
  check("GET /events excludes other groups", jamesMine.status === 200 && !jamesMine.data.some((e) => e.groupId === photo));
  expectStatus("GET event member -> 200", await call("GET", `/events/${eventId}`, { token: test.token }), 200);
  expectStatus("GET event non-member -> 403", await call("GET", `/events/${eventId}`, { token: james.token }), 403);
  expectStatus("GET event missing -> 404", await call("GET", `/events/${MISSING_ID}`, { token: test.token }), 404);
  expectStatus("GET event bad id -> 400", await call("GET", `/events/abc`, { token: test.token }), 400);

  console.log("\nRSVP");
  const rsvp = (user, status) =>
    call("PUT", `/events/${eventId}/rsvp`, { token: user.token, body: { status } });
  const going = await rsvp(test, "going");
  check("test going", going.status === 200 && going.data.goingCount === 1 && going.data.myRsvp === "going", JSON.stringify(going.data).slice(0, 120));
  const again = await rsvp(test, "going");
  check("going twice is idempotent", again.data.goingCount === 1);
  const interested = await rsvp(test, "interested");
  check("switch to interested", interested.data.goingCount === 0 && interested.data.interestedCount === 1 && interested.data.myRsvp === "interested");
  const omarGoing = await rsvp(omar, "going");
  check("omar going", omarGoing.data.goingCount === 1 && omarGoing.data.interestedCount === 1 && omarGoing.data.myRsvp === "going");
  const asTest = await call("GET", `/events/${eventId}`, { token: test.token });
  check("myRsvp is per viewer", asTest.data.myRsvp === "interested");
  const goingList = await call("GET", `/events/${eventId}/going`, { token: test.token });
  check("going list", goingList.status === 200 && goingList.data.length === 1 && goingList.data[0].userId === omar.id);
  expectStatus("bad status -> 400", await rsvp(test, "maybe"), 400);
  expectStatus("non-member rsvp -> 403", await rsvp(james, "going"), 403);
  const cleared = await call("DELETE", `/events/${eventId}/rsvp`, { token: test.token });
  check("clear rsvp", cleared.status === 200 && cleared.data.myRsvp === null && cleared.data.interestedCount === 0);

  console.log("\nEdit");
  const patch = (user, body) => call("PATCH", `/events/${eventId}`, { token: user.token, body });
  expectStatus("edit as plain member -> 403", await patch(test, { title: "Nope" }), 403);
  expectStatus("edit as non-member -> 403", await patch(james, { title: "Nope" }), 403);
  const renamed = await patch(sara, { title: "Smoke walk (moved)", location: "" });
  check("creator edits", renamed.status === 200 && renamed.data.title === "Smoke walk (moved)" && renamed.data.location === null, JSON.stringify(renamed.data).slice(0, 120));
  check("edit keeps other fields", renamed.data.description === "Bring a camera" && renamed.data.goingCount === 1);
  const ownerEdit = await patch(omar, { endsAt: null });
  check("group owner edits", ownerEdit.status === 200 && ownerEdit.data.endsAt === null);
  const badPatch = await patch(sara, { endsAt: inHours(1) });
  check("edit end before start -> 400", badPatch.status === 400 && /after the start/i.test(badPatch.data), badPatch.data);
  const pastPatch = await patch(sara, { startsAt: inHours(-2) });
  check("edit start into past -> 400", pastPatch.status === 400 && /in the future/i.test(pastPatch.data), pastPatch.data);
  expectStatus("edit missing -> 404", await call("PATCH", `/events/${MISSING_ID}`, { token: sara.token, body: {} }), 404);

  console.log("\nDelete");
  const second = await call("POST", base, { token: test.token, body: { title: "Smoke second", startsAt: inHours(24) } });
  expectStatus("plain member creates -> 201", second, 201);
  if (second.status === 201) created.push(second.data.eventId);
  expectStatus("delete as other member -> 403", await call("DELETE", `/events/${eventId}`, { token: test.token }), 403);
  expectStatus("delete as creator -> 204", await call("DELETE", `/events/${second.data.eventId}`, { token: test.token }), 204);
  expectStatus("delete as group owner -> 204", await call("DELETE", `/events/${eventId}`, { token: omar.token }), 204);
  expectStatus("deleted -> 404", await call("GET", `/events/${eventId}`, { token: sara.token }), 404);
  const { rows: leftovers } = await pool.query(
    `SELECT (SELECT count(*)::int FROM notifications WHERE "eventId" = ANY($1::uuid[])) AS notes,
            (SELECT count(*)::int FROM event_rsvps WHERE "eventId" = ANY($1::uuid[])) AS rsvps`,
    [created]
  );
  check("notifications + rsvps cascade", leftovers[0].notes === 0 && leftovers[0].rsvps === 0, JSON.stringify(leftovers[0]));
}

try {
  await main();
} catch (error) {
  failed++;
  console.error("\nSmoke test crashed:", error);
} finally {
  if (created.length) {
    await pool.query(`DELETE FROM events WHERE "eventId" = ANY($1::uuid[])`, [created]);
  }
  await pool.end();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}
