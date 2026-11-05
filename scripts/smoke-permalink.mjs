// Smoke test for single-post permalinks (GET /api/posts/:postId) and
// accent-insensitive search (migration 004). Needs the API running, the
// seeded data and migration 004 applied.
//
//   node scripts/smoke-permalink.mjs
//   API_URL=http://localhost:8011/api node scripts/smoke-permalink.mjs
//
// Everything the script creates is deleted again before it exits.

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

const POST_KEYS =
  "commentCount,createdAt,description,editedAt,groupId,groupName,image,likeCount,likedByMe,name,postId,profileImage,savedByMe,userId";

function hasPostShape(post) {
  return (
    post &&
    typeof post === "object" &&
    Object.keys(post).sort().join(",") === POST_KEYS &&
    Number.isInteger(post.likeCount) &&
    Number.isInteger(post.commentCount) &&
    typeof post.likedByMe === "boolean" &&
    typeof post.savedByMe === "boolean"
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

const q = (text) => encodeURIComponent(text);

async function main() {
  console.log(`Smoke testing ${API}\n`);

  const test = await login("test");
  const sara = await login("sara");
  const james = await login("james");

  const saraGroups = (await call("GET", "/groups/joined", { token: sara.token })).data;
  const books = saraGroups.find((g) => g.name === "Book Club");
  if (!books) throw new Error("Seeded groups not found; run the seed");

  console.log("Permalink");
  const created = await call("POST", "/posts", {
    token: test.token,
    body: { description: "Permalink smoke post" },
  });
  check("create post -> 201", created.status === 201, `got ${created.status}`);
  const postId = created.data.postId;
  cleanups.push(() => call("DELETE", `/posts/${postId}`, { token: test.token }));

  const own = await call("GET", `/posts/${postId}`, { token: test.token });
  check("GET /posts/:id -> 200", own.status === 200, `got ${own.status}`);
  check("permalink row has the rich post shape", hasPostShape(own.data), JSON.stringify(own.data));
  check(
    "permalink row values",
    own.data.postId === postId &&
      own.data.description === "Permalink smoke post" &&
      own.data.userId === test.id &&
      own.data.groupId === null &&
      own.data.groupName === null &&
      own.data.editedAt === null &&
      own.data.likeCount === 0 &&
      own.data.commentCount === 0 &&
      own.data.likedByMe === false &&
      own.data.savedByMe === false
  );

  await call("POST", `/likes/${postId}`, { token: sara.token });
  await call("POST", `/save/${postId}`, { token: sara.token });
  await call("POST", `/comments/${postId}`, { token: sara.token, body: { description: "Nice" } });
  await call("PATCH", `/posts/${postId}`, { token: test.token, body: { description: "Permalink smoke post (edited)" } });

  const asSara = await call("GET", `/posts/${postId}`, { token: sara.token });
  check(
    "counts and viewer flags reflect likes / saves / comments",
    asSara.status === 200 &&
      asSara.data.likeCount === 1 &&
      asSara.data.commentCount === 1 &&
      asSara.data.likedByMe === true &&
      asSara.data.savedByMe === true,
    JSON.stringify(asSara.data)
  );
  check(
    "edit shows up with editedAt",
    asSara.data.description === "Permalink smoke post (edited)" && typeof asSara.data.editedAt === "string"
  );
  const asAuthor = await call("GET", `/posts/${postId}`, { token: test.token });
  check(
    "viewer flags are per viewer",
    asAuthor.data.likedByMe === false && asAuthor.data.savedByMe === false && asAuthor.data.likeCount === 1
  );

  // Group post: members see it with group info, others get 403.
  const groupPost = await call("POST", `/groups/${books.groupId}/posts`, {
    token: sara.token,
    body: { description: "Permalink group smoke post" },
  });
  check("create group post -> 201", groupPost.status === 201, `got ${groupPost.status} ${JSON.stringify(groupPost.data)}`);
  const groupPostId = groupPost.data.postId;
  cleanups.push(() => call("DELETE", `/posts/${groupPostId}`, { token: sara.token }));

  const member = await call("GET", `/posts/${groupPostId}`, { token: sara.token });
  check(
    "group post for a member -> 200 with groupId / groupName",
    member.status === 200 &&
      hasPostShape(member.data) &&
      member.data.groupId === books.groupId &&
      member.data.groupName === "Book Club",
    JSON.stringify(member.data)
  );
  const jamesGroups = (await call("GET", "/groups/joined", { token: james.token })).data;
  const jamesIsMember = jamesGroups.some((g) => g.groupId === books.groupId);
  const outsider = jamesIsMember ? test : james;
  const outsiderGroups = (await call("GET", "/groups/joined", { token: outsider.token })).data;
  if (outsiderGroups.some((g) => g.groupId === books.groupId)) {
    throw new Error("Need a user outside Book Club");
  }
  expectStatus(
    "group post for a non-member -> 403",
    await call("GET", `/posts/${groupPostId}`, { token: outsider.token }),
    403,
    "You are not a member of this group"
  );

  expectStatus(
    "missing post -> 404",
    await call("GET", `/posts/${MISSING_ID}`, { token: test.token }),
    404,
    "Post not found"
  );
  expectStatus(
    "invalid id -> 400",
    await call("GET", "/posts/abc", { token: test.token }),
    400,
    "Invalid id"
  );
  expectStatus("no token -> 401", await call("GET", `/posts/${postId}`), 401);

  // The new route must not shadow the list endpoint.
  const feed = await call("GET", "/posts?limit=5", { token: test.token });
  check(
    "GET /posts (feed) still returns a page",
    feed.status === 200 && Array.isArray(feed.data.items) && "nextCursor" in feed.data
  );
  const profile = await call("GET", `/posts?userId=${test.id}&limit=5`, { token: test.token });
  check("GET /posts?userId= still works", profile.status === 200 && Array.isArray(profile.data.items));

  const deleted = await call("DELETE", `/posts/${postId}`, { token: test.token });
  check("delete post -> 204", deleted.status === 204, `got ${deleted.status}`);
  expectStatus(
    "permalink of a deleted post -> 404",
    await call("GET", `/posts/${postId}`, { token: test.token }),
    404,
    "Post not found"
  );

  console.log("\nAccent-insensitive search");
  const stamp = Date.now().toString(36);
  const email = `jose.smoke.${stamp}@communet.dev`;
  const name = `José Ñúñez ${stamp}`;
  const reg = await call("POST", "/auth/register", {
    body: { name, email, password: PASSWORD },
  });
  check("register accented user -> 201", reg.status === 201, `got ${reg.status} ${JSON.stringify(reg.data)}`);
  const joseId = reg.data?.user?.userId;
  cleanups.push(() => pool.query(`DELETE FROM users WHERE "userId" = $1`, [joseId]));

  const findUser = async (text) => {
    const res = await call("GET", `/search?q=${q(text)}&type=users&limit=50`, { token: test.token });
    return res.status === 200 && res.data.users.some((u) => u.userId === joseId);
  };
  check('"jose" finds "José"', await findUser(`jose nunez ${stamp}`));
  check('"JOSE" finds "José" (case-insensitive)', await findUser(`JOSE ${stamp}`));
  check('"josé" still finds "José"', await findUser(`josé ${stamp}`));
  check('"nunez" finds "Ñúñez"', await findUser(`nunez ${stamp}`));

  const accented = await call("POST", "/posts", {
    token: test.token,
    body: { description: `Café crème à la façon ${stamp}` },
  });
  check("create accented post -> 201", accented.status === 201);
  const accentedId = accented.data.postId;
  cleanups.push(() => call("DELETE", `/posts/${accentedId}`, { token: test.token }));

  const findPost = async (text) => {
    const res = await call("GET", `/search?q=${q(text)}&type=posts&limit=50`, { token: test.token });
    return res.status === 200 && res.data.posts.find((p) => p.postId === accentedId);
  };
  const hit = await findPost(`cafe creme ${stamp}`);
  check('"cafe creme" finds "Café crème"', Boolean(hit));
  check("post search hit keeps the rich shape", hasPostShape(hit));
  check('"FACON" finds "façon"', Boolean(await findPost(`FACON ${stamp}`)));

  // Group names go through the same normalisation.
  const group = await call("POST", "/groups", {
    token: test.token,
    body: { name: `Écoles ${stamp}`, description: "Smoke group" },
  });
  check("create accented group -> 201", group.status === 201, `got ${group.status} ${JSON.stringify(group.data)}`);
  const groupId = group.data?.groupId;
  cleanups.push(() => call("DELETE", `/groups/${groupId}/delete`, { token: test.token }));
  const gRes = await call("GET", `/search?q=${q(`ecoles ${stamp}`)}&type=groups`, { token: test.token });
  check('"ecoles" finds "Écoles"', gRes.status === 200 && gRes.data.groups.some((g) => g.groupId === groupId));

  // Wildcards are still literal.
  const pct = await call("GET", `/search?q=${q("%")}&type=users`, { token: test.token });
  check('"%" is literal (no match-all)', pct.status === 200 && Array.isArray(pct.data.users));
}

try {
  await main();
} catch (error) {
  failed++;
  console.error("\nSmoke test crashed:", error);
} finally {
  for (const undo of cleanups.reverse()) {
    await undo().catch(() => {});
  }
  await pool.end();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}
