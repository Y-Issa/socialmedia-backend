// Smoke test for direct messages. Needs the API running, seeded users and
// migrations/005_messages.sql applied.
//
//   node scripts/smoke-messages.mjs
//   API_URL=http://localhost:8011/api node scripts/smoke-messages.mjs
//
// Uses james <-> mona (and lina as an outsider). Everything the script
// creates is deleted again before it exits (directly in the database, since
// the API has no delete endpoints for messages).

import "dotenv/config";
import pool from "../db.js";

const API = process.env.API_URL || "http://localhost:8011/api";
const PASSWORD = "test1234";
const MISSING_ID = "00000000-0000-4000-8000-000000000000";

let passed = 0;
let failed = 0;
const cleanups = [];

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

function expectStatus(name, res, status, message) {
  const okStatus = res.status === status;
  const okMessage = message === undefined || res.data === message;
  check(
    name,
    okStatus && okMessage,
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

const MESSAGE_KEYS = "body,conversationId,createdAt,messageId,senderId";
const CONVERSATION_KEYS = "conversationId,lastMessage,lastMessageAt,other,unreadCount";

async function main() {
  console.log(`Smoke testing messages on ${API}\n`);

  const james = await login("james");
  const mona = await login("mona");
  const lina = await login("lina");

  console.log("Auth");
  expectStatus("list without token -> 401", await call("GET", "/messages/conversations"), 401);
  expectStatus("unread-count without token -> 401", await call("GET", "/messages/unread-count"), 401);

  console.log("\nConversations");
  expectStatus(
    "message yourself -> 400",
    await call("POST", "/messages/conversations", { token: james.token, body: { userId: james.id } }),
    400,
    "You can't message yourself"
  );
  expectStatus(
    "invalid userId -> 400",
    await call("POST", "/messages/conversations", { token: james.token, body: { userId: "abc" } }),
    400,
    "Invalid user id"
  );
  expectStatus(
    "unknown user -> 404",
    await call("POST", "/messages/conversations", { token: james.token, body: { userId: MISSING_ID } }),
    404,
    "User not found"
  );

  // Remember the pair's state so a pre-existing conversation is restored.
  const before = await pool.query(
    `SELECT CP."conversationId", C."lastMessageAt" FROM conversation_pairs CP
     JOIN conversations C ON C."conversationId" = CP."conversationId"
     WHERE CP."userA" = LEAST($1::uuid, $2::uuid) AND CP."userB" = GREATEST($1::uuid, $2::uuid)`,
    [james.id, mona.id]
  );
  const preExisting = before.rows[0];

  const created = await call("POST", "/messages/conversations", {
    token: james.token,
    body: { userId: mona.id },
  });
  const conversationId = created.data?.conversationId;
  check(
    preExisting ? "get existing conversation -> 200" : "create conversation -> 201",
    created.status === (preExisting ? 200 : 201) && typeof conversationId === "string",
    `got ${created.status} ${JSON.stringify(created.data)}`
  );
  const createdIds = [];
  if (preExisting) {
    const members = await pool.query(
      `SELECT "userId", "lastReadAt" FROM conversation_members WHERE "conversationId" = $1`,
      [conversationId]
    );
    cleanups.push(async () => {
      await pool.query(`DELETE FROM messages WHERE "messageId" = ANY($1::uuid[])`, [createdIds]);
      await pool.query(`UPDATE conversations SET "lastMessageAt" = $2 WHERE "conversationId" = $1`, [
        conversationId,
        preExisting.lastMessageAt,
      ]);
      for (const m of members.rows) {
        await pool.query(
          `UPDATE conversation_members SET "lastReadAt" = $3 WHERE "conversationId" = $1 AND "userId" = $2`,
          [conversationId, m.userId, m.lastReadAt]
        );
      }
    });
  } else if (conversationId) {
    cleanups.push(() =>
      pool.query(`DELETE FROM conversations WHERE "conversationId" = $1`, [conversationId])
    );
  }

  const again = await call("POST", "/messages/conversations", {
    token: mona.token,
    body: { userId: james.id },
  });
  check(
    "same pair from the other side -> 200 same id",
    again.status === 200 && again.data.conversationId === conversationId,
    JSON.stringify(again.data)
  );
  const racing = await Promise.all(
    [1, 2, 3].map(() =>
      call("POST", "/messages/conversations", { token: james.token, body: { userId: mona.id } })
    )
  );
  check(
    "concurrent get-or-create -> one conversation",
    racing.every((r) => r.status === 200 && r.data.conversationId === conversationId)
  );

  console.log("\nSending");
  const path = `/messages/conversations/${conversationId}`;
  expectStatus(
    "empty body -> 400",
    await call("POST", `${path}/messages`, { token: james.token, body: { body: "   " } }),
    400,
    "Message can't be empty"
  );
  expectStatus(
    "2001 chars -> 400",
    await call("POST", `${path}/messages`, { token: james.token, body: { body: "x".repeat(2001) } }),
    400,
    "Message is too long (max 2000 characters)"
  );
  expectStatus(
    "outsider sends -> 403",
    await call("POST", `${path}/messages`, { token: lina.token, body: { body: "hi" } }),
    403
  );
  expectStatus(
    "send to missing conversation -> 404",
    await call("POST", `/messages/conversations/${MISSING_ID}/messages`, {
      token: james.token,
      body: { body: "hi" },
    }),
    404
  );
  expectStatus(
    "send to invalid id -> 400",
    await call("POST", "/messages/conversations/abc/messages", { token: james.token, body: { body: "hi" } }),
    400,
    "Invalid id"
  );

  const sent = [];
  for (let i = 1; i <= 5; i++) {
    const who = i % 2 ? james : mona;
    const res = await call("POST", `${path}/messages`, {
      token: who.token,
      body: { body: `  smoke message ${i}  ` },
    });
    if (res.status === 201) {
      sent.push(res.data);
      createdIds.push(res.data.messageId);
    }
  }
  check("send 5 messages -> 201", sent.length === 5);
  check(
    "message shape + trimmed body",
    Object.keys(sent[0] || {}).sort().join(",") === MESSAGE_KEYS &&
      sent[0].body === "smoke message 1" &&
      sent[0].senderId === james.id &&
      sent[0].conversationId === conversationId,
    JSON.stringify(sent[0])
  );
  const long = await call("POST", `${path}/messages`, {
    token: james.token,
    body: { body: "y".repeat(2000) },
  });
  check("2000 chars -> 201", long.status === 201);
  if (long.status === 201) createdIds.push(long.data.messageId);

  console.log("\nReading");
  const page = await call("GET", `${path}/messages?limit=3`, { token: mona.token });
  check(
    "latest page oldest -> newest, hasMore",
    page.status === 200 &&
      page.data.items.length === 3 &&
      page.data.hasMore === true &&
      page.data.items[2].messageId === long.data.messageId &&
      page.data.items[0].messageId === sent[3].messageId,
    JSON.stringify(page.data).slice(0, 200)
  );
  const older = await call("GET", `${path}/messages?limit=3&before=${page.data.items[0].messageId}`, {
    token: mona.token,
  });
  check(
    "before cursor -> older page in order",
    older.status === 200 &&
      older.data.items.map((m) => m.messageId).join() ===
        [sent[0], sent[1], sent[2]].map((m) => m.messageId).join() &&
      (preExisting || older.data.hasMore === false),
    JSON.stringify(older.data).slice(0, 200)
  );
  const newer = await call("GET", `${path}/messages?after=${sent[2].messageId}`, { token: mona.token });
  check(
    "after cursor -> newer messages only",
    newer.status === 200 &&
      newer.data.items.map((m) => m.messageId).join() ===
        [sent[3].messageId, sent[4].messageId, long.data.messageId].join() &&
      newer.data.hasMore === false
  );
  const none = await call("GET", `${path}/messages?after=${long.data.messageId}`, { token: mona.token });
  check("after newest -> empty", none.status === 200 && none.data.items.length === 0 && !none.data.hasMore);
  expectStatus(
    "both cursors -> 400",
    await call("GET", `${path}/messages?after=${sent[0].messageId}&before=${sent[1].messageId}`, {
      token: mona.token,
    }),
    400
  );
  expectStatus(
    "foreign cursor -> 400",
    await call("GET", `${path}/messages?before=${MISSING_ID}`, { token: mona.token }),
    400,
    "Invalid cursor"
  );
  expectStatus(
    "bad limit -> 400",
    await call("GET", `${path}/messages?limit=0`, { token: mona.token }),
    400
  );
  expectStatus("outsider reads -> 403", await call("GET", `${path}/messages`, { token: lina.token }), 403);
  expectStatus(
    "missing conversation -> 404",
    await call("GET", `/messages/conversations/${MISSING_ID}/messages`, { token: mona.token }),
    404
  );

  console.log("\nInbox + unread");
  const list = await call("GET", "/messages/conversations", { token: mona.token });
  const row = Array.isArray(list.data) ? list.data.find((c) => c.conversationId === conversationId) : null;
  check(
    "inbox row shape",
    row &&
      Object.keys(row).sort().join(",") === CONVERSATION_KEYS &&
      row.other.userId === james.id &&
      typeof row.other.name === "string" &&
      "profileImage" in row.other,
    JSON.stringify(row)
  );
  check(
    "inbox lastMessage truncated to 120 chars",
    row?.lastMessage?.body === "y".repeat(120) && row.lastMessage.senderId === james.id,
    JSON.stringify(row?.lastMessage)?.slice(0, 160)
  );
  check("mona has 2 unread (after her last)", row?.unreadCount === 2, String(row?.unreadCount));
  check("inbox newest first", list.data[0]?.conversationId === conversationId);
  const jamesRow = (await call("GET", "/messages/conversations", { token: james.token })).data.find(
    (c) => c.conversationId === conversationId
  );
  check("sender has 0 unread", jamesRow?.unreadCount === 0, String(jamesRow?.unreadCount));

  const unreadBefore = (await call("GET", "/messages/unread-count", { token: mona.token })).data;
  check("unread-count >= 1", Number.isInteger(unreadBefore.count) && unreadBefore.count >= 1);
  expectStatus("outsider mark read -> 403", await call("POST", `${path}/read`, { token: lina.token }), 403);
  expectStatus("mark read -> 204", await call("POST", `${path}/read`, { token: mona.token }), 204);
  const unreadAfter = (await call("GET", "/messages/unread-count", { token: mona.token })).data;
  check("unread-count drops by 1", unreadAfter.count === unreadBefore.count - 1, JSON.stringify(unreadAfter));
  const rowAfter = (await call("GET", "/messages/conversations", { token: mona.token })).data.find(
    (c) => c.conversationId === conversationId
  );
  check("row unreadCount 0 after read", rowAfter?.unreadCount === 0);
  const linaList = (await call("GET", "/messages/conversations", { token: lina.token })).data;
  check("outsider doesn't see it", !linaList.some((c) => c.conversationId === conversationId));
}

try {
  await main();
} catch (error) {
  failed++;
  console.error("\nSmoke test crashed:", error);
} finally {
  for (const undo of cleanups.reverse()) {
    await undo().catch((error) => console.error("cleanup failed:", error.message));
  }
  await pool.end();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}
