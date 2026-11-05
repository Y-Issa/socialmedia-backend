// Smoke test for the Phase 1 fixes. Needs the API running and seeded data.
//
//   node scripts/smoke.mjs
//   API_URL=http://localhost:8002/api node scripts/smoke.mjs
//
// Everything the script creates is deleted again before it exits.

import "dotenv/config";
import jwt from "jsonwebtoken";

const API = process.env.API_URL || "http://localhost:8001/api";
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

async function main() {
  console.log(`Smoke testing ${API}\n`);

  const users = {};
  for (const who of ["test", "sara", "omar", "lina", "james"]) {
    users[who] = await login(who);
  }
  const { test, sara, omar, lina, james } = users;

  const joined = (await call("GET", "/groups/joined", { token: test.token })).data;
  const saraGroups = (await call("GET", "/groups/joined", { token: sara.token })).data;
  const photo = joined.find((g) => g.name === "Photography");
  const books = saraGroups.find((g) => g.name === "Book Club");
  if (!photo || !books) throw new Error("Seeded groups not found; run the seed");

  console.log("Auth");
  expectStatus(
    "login wrong password -> 401 generic",
    await call("POST", "/auth/login", {
      body: { email: "test@communet.dev", password: "wrong-password" },
    }),
    401,
    "Invalid email or password"
  );
  expectStatus(
    "login unknown email -> 401 generic",
    await call("POST", "/auth/login", {
      body: { email: "nobody@communet.dev", password: "wrong-password" },
    }),
    401,
    "Invalid email or password"
  );
  expectStatus(
    "login missing fields -> 400",
    await call("POST", "/auth/login", { body: { email: "test@communet.dev" } }),
    400
  );
  expectStatus(
    "register missing fields -> 400",
    await call("POST", "/auth/register", { body: { email: "x@y.dev" } }),
    400
  );
  expectStatus(
    "register bad email -> 400",
    await call("POST", "/auth/register", {
      body: { name: "X", email: "not-an-email", password: "secret12" },
    }),
    400
  );
  expectStatus(
    "register short password -> 400",
    await call("POST", "/auth/register", {
      body: { name: "X", email: "smoke@communet.dev", password: "123" },
    }),
    400
  );
  expectStatus("no token -> 401", await call("GET", "/posts"), 401);
  expectStatus(
    "garbage token -> 401",
    await call("GET", "/posts", { token: "garbage.token.here" }),
    401
  );
  const expired = jwt.sign(
    { id: test.id, exp: Math.floor(Date.now() / 1000) - 60 },
    process.env.JWT_SECRET
  );
  expectStatus(
    "expired token -> 401",
    await call("GET", "/posts", { token: expired }),
    401
  );
  expectStatus("unknown /api route -> 404", await call("GET", "/nope"), 404);

  console.log("\nUsers");
  expectStatus(
    "invalid uuid -> 400",
    await call("GET", "/users/find/not-a-uuid", { token: test.token }),
    400,
    "Invalid id"
  );
  expectStatus(
    "missing user -> 404",
    await call("GET", `/users/find/${MISSING_ID}`, { token: test.token }),
    404,
    "User not found"
  );
  const me = await call("GET", `/users/find/${test.id}`, { token: test.token });
  check(
    "own profile includes email, no password",
    me.status === 200 && me.data.email && !("password" in me.data)
  );
  const other = await call("GET", `/users/find/${sara.id}`, { token: test.token });
  check(
    "other profile has no email/password",
    other.status === 200 && !("email" in other.data) && !("password" in other.data)
  );
  expectStatus(
    "update profile without old password -> 400",
    await call("PUT", "/users", { token: test.token, body: { name: "Test User" } }),
    400
  );
  expectStatus(
    "update profile without name -> 400",
    await call("PUT", "/users", {
      token: test.token,
      body: { name: "  ", oldPassword: PASSWORD },
    }),
    400
  );
  expectStatus(
    "follow self -> 400",
    await call("POST", `/relationships/${test.id}`, { token: test.token }),
    400,
    "You can't follow yourself"
  );
  expectStatus(
    "follow invalid uuid -> 400",
    await call("POST", "/relationships/abc", { token: test.token }),
    400,
    "Invalid id"
  );

  console.log("\nPosts");
  const feed = await call("GET", "/posts", { token: test.token });
  check("feed works", feed.status === 200 && Array.isArray(feed.data) && feed.data.length > 0);
  const profilePosts = await call("GET", `/posts?userId=${sara.id}`, { token: test.token });
  check("profile posts work", profilePosts.status === 200 && profilePosts.data.length > 0);
  expectStatus(
    "posts ?userId invalid -> 400",
    await call("GET", "/posts?userId=abc", { token: test.token }),
    400
  );
  expectStatus(
    "2001-char post -> 400",
    await call("POST", "/posts", { token: test.token, body: { description: "a".repeat(2001) } }),
    400,
    "Post is too long (max 2000 characters)"
  );
  expectStatus(
    "empty post -> 400",
    await call("POST", "/posts", { token: test.token, body: { description: "   " } }),
    400,
    "Post can't be empty"
  );
  const long = await call("POST", "/posts", {
    token: test.token,
    body: { description: "b".repeat(1999) },
  });
  expectStatus("1999-char post -> 201", long, 201);
  if (long.status === 201) {
    const postId = long.data.postId;
    cleanups.push(() => call("DELETE", `/posts/${postId}`, { token: test.token }));

    expectStatus(
      "empty comment -> 400",
      await call("POST", `/comments/${postId}`, { token: sara.token, body: { description: " " } }),
      400,
      "Comment can't be empty"
    );
    expectStatus(
      "1001-char comment -> 400",
      await call("POST", `/comments/${postId}`, {
        token: sara.token,
        body: { description: "c".repeat(1001) },
      }),
      400,
      "Comment is too long (max 1000 characters)"
    );
    expectStatus(
      "comment -> 201",
      await call("POST", `/comments/${postId}`, { token: sara.token, body: { description: " hi " } }),
      201
    );
    expectStatus(
      "someone else deleting the post -> 404",
      await call("DELETE", `/posts/${postId}`, { token: sara.token }),
      404,
      "Not found or not yours"
    );
    expectStatus(
      "owner deletes the post -> 204",
      await call("DELETE", `/posts/${postId}`, { token: test.token }),
      204
    );
    cleanups.pop();
  }
  const saraPost = profilePosts.data[0];
  expectStatus(
    "deleting someone else's seeded post -> 404",
    await call("DELETE", `/posts/${saraPost.postId}`, { token: test.token }),
    404,
    "Not found or not yours"
  );
  expectStatus(
    "delete post invalid uuid -> 400",
    await call("DELETE", "/posts/abc", { token: test.token }),
    400,
    "Invalid id"
  );
  expectStatus(
    "like missing post -> 404",
    await call("POST", `/likes/${MISSING_ID}`, { token: test.token }),
    404
  );

  console.log("\nGroups");
  const members = await call("GET", `/groups/${photo.groupId}/members`, { token: test.token });
  check(
    "members have only userId/name/profileImage",
    members.status === 200 &&
      members.data.length === 4 &&
      members.data.every(
        (m) => Object.keys(m).sort().join(",") === "name,profileImage,userId"
      ),
    JSON.stringify(members.data[0])
  );

  const detail = await call("GET", `/groups/${photo.groupId}`, { token: test.token });
  const keys = "createdAt,createdBy,description,groupId,image,isMember,memberCount,name";
  check(
    "group detail shape",
    detail.status === 200 &&
      Object.keys(detail.data).sort().join(",") === keys &&
      detail.data.memberCount === 4 &&
      detail.data.isMember === true &&
      detail.data.createdBy === omar.id,
    JSON.stringify(detail.data)
  );
  const detailJames = await call("GET", `/groups/${books.groupId}`, { token: james.token });
  check(
    "group detail for non-member: isMember false",
    detailJames.status === 200 && detailJames.data.isMember === false &&
      detailJames.data.memberCount === 2
  );
  expectStatus(
    "group detail missing -> 404",
    await call("GET", `/groups/${MISSING_ID}`, { token: test.token }),
    404
  );
  expectStatus(
    "group detail invalid uuid -> 400",
    await call("GET", "/groups/abc", { token: test.token }),
    400,
    "Invalid id"
  );
  for (const path of ["/groups/joined", "/groups/unjoined", "/groups/save", "/groups/save/ids"]) {
    const r = await call("GET", path, { token: test.token });
    check(`${path} still works`, r.status === 200 && Array.isArray(r.data));
  }

  const NOT_MEMBER = "You are not a member of this group";
  expectStatus(
    "non-member reads group posts -> 403",
    await call("GET", `/groups/${books.groupId}/posts`, { token: james.token }),
    403,
    NOT_MEMBER
  );
  expectStatus(
    "non-member posts to group -> 403",
    await call("POST", `/groups/${books.groupId}/posts`, {
      token: james.token,
      body: { description: "let me in" },
    }),
    403,
    NOT_MEMBER
  );
  const bookPosts = await call("GET", `/groups/${books.groupId}/posts`, { token: sara.token });
  check("member reads group posts", bookPosts.status === 200 && bookPosts.data.length > 0);
  const bookPostId = bookPosts.data[0].postId;
  expectStatus(
    "non-member comments on group post -> 403",
    await call("POST", `/groups/${bookPostId}/comments`, {
      token: james.token,
      body: { description: "hi" },
    }),
    403,
    NOT_MEMBER
  );
  expectStatus(
    "non-member reads group comments -> 403",
    await call("GET", `/groups/${bookPostId}/comments`, { token: james.token }),
    403,
    NOT_MEMBER
  );
  expectStatus(
    "non-member likes group post -> 403",
    await call("POST", `/groups/${bookPostId}/likes`, { token: james.token }),
    403,
    NOT_MEMBER
  );
  expectStatus(
    "non-member saves group post -> 403",
    await call("POST", `/groups/save/${bookPostId}`, { token: james.token }),
    403,
    NOT_MEMBER
  );
  expectStatus(
    "group post too long -> 400",
    await call("POST", `/groups/${books.groupId}/posts`, {
      token: sara.token,
      body: { description: "a".repeat(2001) },
    }),
    400
  );

  expectStatus(
    "owner can't leave group -> 400",
    await call("DELETE", `/groups/${books.groupId}`, { token: sara.token }),
    400,
    "Group owners can't leave their group"
  );
  cleanups.push(() => call("DELETE", `/groups/${books.groupId}`, { token: james.token }));
  expectStatus(
    "join group -> 204",
    await call("POST", `/groups/${books.groupId}`, { token: james.token }),
    204
  );
  expectStatus(
    "join group twice -> 204",
    await call("POST", `/groups/${books.groupId}`, { token: james.token }),
    204
  );
  const afterJoin = await call("GET", `/groups/${books.groupId}`, { token: james.token });
  check(
    "double join adds the member once",
    afterJoin.data.memberCount === 3 && afterJoin.data.isMember === true
  );
  expectStatus(
    "leave group -> 204",
    await call("DELETE", `/groups/${books.groupId}`, { token: james.token }),
    204
  );
  cleanups.pop();
  expectStatus(
    "join missing group -> 404",
    await call("POST", `/groups/${MISSING_ID}`, { token: james.token }),
    404
  );

  // Group post deletion: author's post removed by the group creator.
  const gp = await call("POST", `/groups/${photo.groupId}/posts`, {
    token: sara.token,
    body: { description: "smoke test group post" },
  });
  expectStatus("member creates group post -> 201", gp, 201);
  if (gp.status === 201) {
    const gpId = gp.data.postId;
    cleanups.push(() => call("DELETE", `/groups/posts/${gpId}`, { token: sara.token }));
    expectStatus(
      "member likes group post -> 201",
      await call("POST", `/groups/${gpId}/likes`, { token: lina.token }),
      201
    );
    expectStatus(
      "member comments on group post -> 201",
      await call("POST", `/groups/${gpId}/comments`, {
        token: lina.token,
        body: { description: "nice" },
      }),
      201
    );
    expectStatus(
      "non-author non-creator deletes group post -> 404",
      await call("DELETE", `/groups/posts/${gpId}`, { token: lina.token }),
      404,
      "Not found or not yours"
    );
    expectStatus(
      "group creator deletes member's post -> 204",
      await call("DELETE", `/groups/posts/${gpId}`, { token: omar.token }),
      204
    );
    cleanups.pop();
  }
  expectStatus(
    "delete someone else's group -> 404",
    await call("DELETE", `/groups/${photo.groupId}/delete`, { token: test.token }),
    404,
    "Not found or not yours"
  );

  console.log("\nSaved");
  const savedIds = await call("GET", "/save/ids", { token: test.token });
  const saved = await call("GET", "/save", { token: test.token });
  check("GET /save works", saved.status === 200 && Array.isArray(saved.data));
  check("GET /save/ids works", savedIds.status === 200 && Array.isArray(savedIds.data));
  const toSave = feed.data.find((p) => !savedIds.data.includes(p.postId));
  if (toSave) {
    cleanups.push(() => call("DELETE", `/save/${toSave.postId}`, { token: test.token }));
    expectStatus(
      "save post -> 201",
      await call("POST", `/save/${toSave.postId}`, { token: test.token }),
      201
    );
    const after = await call("GET", "/save/ids", { token: test.token });
    check("saved id listed", after.data.includes(toSave.postId));
    expectStatus(
      "unsave post -> 200",
      await call("DELETE", `/save/${toSave.postId}`, { token: test.token }),
      200
    );
    cleanups.pop();
  }
  expectStatus(
    "save missing post -> 404",
    await call("POST", `/save/${MISSING_ID}`, { token: test.token }),
    404
  );
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
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}
