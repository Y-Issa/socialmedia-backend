// Smoke test for the Stories API. Needs the API running, seeded users and
// migrations/006_stories.sql applied.
//
//   node scripts/smoke-stories.mjs
//   API_URL=http://localhost:8011/api node scripts/smoke-stories.mjs
//
// Every story the script creates is deleted again before it exits.

import "dotenv/config";
import pool from "../db.js";

const API = process.env.API_URL || "http://localhost:8011/api";
const PASSWORD = "test1234";
const MISSING_ID = "00000000-0000-4000-8000-000000000000";
const IMAGE = "1718914059518-3900252.jpg"; // exists in public/upload

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
  if (res.status !== 200) {
    throw new Error(`login ${who} failed: ${res.status} ${res.data}`);
  }
  return { token: res.data.token, id: res.data.user.userId };
}

async function follows(follower, followed) {
  const { rows } = await pool.query(
    `SELECT 1 FROM relationships WHERE "followerUserId" = $1 AND "followedUserId" = $2`,
    [follower, followed]
  );
  return rows.length > 0;
}

async function feed(user) {
  return call("GET", "/stories/feed", { token: user.token });
}

function findStory(feedData, storyId) {
  for (const group of feedData) {
    const story = group.stories.find((s) => s.storyId === storyId);
    if (story) return { group, story };
  }
  return null;
}

async function main() {
  console.log(`Smoke testing stories at ${API}\n`);

  const users = {};
  for (const who of ["test", "sara", "omar", "james", "mona"]) {
    users[who] = await login(who);
  }
  const { test, sara, james, mona } = users;

  // Preconditions from the seed: sara follows test, mona doesn't.
  if (!(await follows(sara.id, test.id)) || (await follows(mona.id, test.id))) {
    throw new Error("Seeded follows not as expected; run the seed");
  }

  console.log("Create");
  expectStatus("no token -> 401", await call("POST", "/stories", { body: { image: IMAGE } }), 401);
  for (const [label, image] of [
    ["missing image", undefined],
    ["URL image", "https://evil.example/x.jpg"],
    ["path traversal", "../../index.js"],
    ["non-image name", "123-notes.txt"],
    ["unknown upload", "1-does-not-exist.jpg"],
    ["non-string", 42],
  ]) {
    expectStatus(
      `${label} -> 400`,
      await call("POST", "/stories", { token: test.token, body: { image } }),
      400
    );
  }
  expectStatus(
    "caption over 200 -> 400",
    await call("POST", "/stories", {
      token: test.token,
      body: { image: IMAGE, caption: "x".repeat(201) },
    }),
    400
  );

  const first = await call("POST", "/stories", {
    token: test.token,
    body: { image: IMAGE, caption: "  smoke story  " },
  });
  expectStatus("create -> 201", first, 201);
  if (first.status === 201) created.push(first.data.storyId);
  check("caption trimmed", first.data.caption === "smoke story", JSON.stringify(first.data.caption));
  const hours =
    (new Date(first.data.expiresAt) - new Date(first.data.createdAt)) / 36e5;
  check("expires 24h after creation", Math.abs(hours - 24) < 0.01, String(hours));

  const second = await call("POST", "/stories", {
    token: test.token,
    body: { image: IMAGE },
  });
  expectStatus("create without caption -> 201", second, 201);
  if (second.status === 201) created.push(second.data.storyId);
  check("empty caption is null", second.data.caption === null);

  const expired = await call("POST", "/stories", {
    token: test.token,
    body: { image: IMAGE, caption: "expired" },
  });
  if (expired.status === 201) created.push(expired.data.storyId);
  await pool.query(
    `UPDATE stories SET "expiresAt" = now() - INTERVAL '1 minute' WHERE "storyId" = $1`,
    [expired.data.storyId]
  );

  console.log("\nFeed");
  const mine = await feed(test);
  expectStatus("feed -> 200", mine, 200);
  check("own group first", mine.data[0]?.user.userId === test.id);
  const ownIds = mine.data[0]?.stories.map((s) => s.storyId) ?? [];
  check(
    "own stories oldest -> newest",
    ownIds.indexOf(first.data.storyId) < ownIds.indexOf(second.data.storyId) &&
      ownIds.indexOf(first.data.storyId) >= 0
  );
  check("expired story excluded", !findStory(mine.data, expired.data.storyId));
  check(
    "story shape",
    Object.keys(mine.data[0]?.stories[0] ?? {}).sort().join(",") ===
      "caption,createdAt,expiresAt,image,storyId,viewed" &&
      Object.keys(mine.data[0]?.user ?? {}).sort().join(",") ===
        "name,profileImage,userId"
  );
  const ranks = mine.data.map((g, i) => (i === 0 && g.user.userId === test.id ? 0 : g.hasUnseen ? 1 : 2));
  check("unseen groups before seen", ranks.every((r, i) => i === 0 || r >= ranks[i - 1]));

  const saraFeed = await feed(sara);
  const seen = findStory(saraFeed.data, first.data.storyId);
  check("follower sees story", !!seen);
  check("follower: unseen", seen?.story.viewed === false && seen?.group.hasUnseen === true);
  check("follower: expired excluded", !findStory(saraFeed.data, expired.data.storyId));
  const monaFeed = await feed(mona);
  check("non-follower doesn't see story", !findStory(monaFeed.data, first.data.storyId));

  console.log("\nViews");
  expectStatus("non-follower view -> 404", await call("POST", `/stories/${first.data.storyId}/view`, { token: mona.token }), 404);
  expectStatus("view expired -> 404", await call("POST", `/stories/${expired.data.storyId}/view`, { token: sara.token }), 404);
  expectStatus("view missing -> 404", await call("POST", `/stories/${MISSING_ID}/view`, { token: sara.token }), 404);
  expectStatus("view bad id -> 400", await call("POST", "/stories/nope/view", { token: sara.token }), 400);
  expectStatus("follower view -> 204", await call("POST", `/stories/${first.data.storyId}/view`, { token: sara.token }), 204);
  expectStatus("view again -> 204", await call("POST", `/stories/${first.data.storyId}/view`, { token: sara.token }), 204);
  expectStatus("author views own -> 204", await call("POST", `/stories/${first.data.storyId}/view`, { token: test.token }), 204);
  const viewCount = await pool.query(
    `SELECT count(*)::int AS n FROM story_views WHERE "storyId" = $1`,
    [first.data.storyId]
  );
  check("views idempotent (2 rows)", viewCount.rows[0].n === 2, String(viewCount.rows[0].n));

  const saraAfter = findStory((await feed(sara)).data, first.data.storyId);
  check("viewed flag set", saraAfter?.story.viewed === true);
  check("still unseen while one story left", saraAfter?.group.hasUnseen === true);
  await call("POST", `/stories/${second.data.storyId}/view`, { token: sara.token });
  const saraAll = findStory((await feed(sara)).data, first.data.storyId);
  check("hasUnseen false after viewing all", saraAll?.group.hasUnseen === false);

  console.log("\nViewers");
  const viewers = await call("GET", `/stories/${first.data.storyId}/viewers`, { token: test.token });
  expectStatus("author viewers -> 200", viewers, 200);
  check(
    "viewers lists sara only (not the author)",
    Array.isArray(viewers.data) &&
      viewers.data.length === 1 &&
      viewers.data[0].userId === sara.id &&
      Object.keys(viewers.data[0]).sort().join(",") === "name,profileImage,userId,viewedAt",
    JSON.stringify(viewers.data).slice(0, 160)
  );
  expectStatus("viewers as follower -> 404", await call("GET", `/stories/${first.data.storyId}/viewers`, { token: sara.token }), 404);
  expectStatus("viewers as stranger -> 404", await call("GET", `/stories/${first.data.storyId}/viewers`, { token: james.token }), 404);

  console.log("\nDelete");
  expectStatus("delete as other -> 404", await call("DELETE", `/stories/${first.data.storyId}`, { token: sara.token }), 404);
  expectStatus("delete missing -> 404", await call("DELETE", `/stories/${MISSING_ID}`, { token: test.token }), 404);
  expectStatus("delete as author -> 204", await call("DELETE", `/stories/${first.data.storyId}`, { token: test.token }), 204);
  check("deleted story gone from feed", !findStory((await feed(sara)).data, first.data.storyId));
  const orphanViews = await pool.query(
    `SELECT count(*)::int AS n FROM story_views WHERE "storyId" = $1`,
    [first.data.storyId]
  );
  check("views cascade on delete", orphanViews.rows[0].n === 0);

  console.log("\nCleanup job");
  const { deleteExpiredStories } = await import("../src/controllers/story.js");
  const removed = await deleteExpiredStories();
  const left = await pool.query(`SELECT 1 FROM stories WHERE "storyId" = $1`, [expired.data.storyId]);
  check("expired story deleted by cleanup", removed >= 1 && left.rows.length === 0);
}

try {
  await main();
} catch (error) {
  failed++;
  console.error("\nSmoke test crashed:", error);
} finally {
  if (created.length) {
    await pool.query(`DELETE FROM stories WHERE "storyId" = ANY($1::uuid[])`, [created]);
  }
  await pool.end();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}
