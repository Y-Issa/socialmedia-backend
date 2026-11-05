// Smoke test for the Phase 1, 2 and 4 API. Needs the API running and seeded data.
//
//   node scripts/smoke.mjs
//   API_URL=http://localhost:8002/api node scripts/smoke.mjs
//
// Everything the script creates is deleted again before it exits.

import "dotenv/config";
import jwt from "jsonwebtoken";

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

// Follows nextCursor until the end; returns every item (or null on error).
async function walk(path, token, limit) {
  const items = [];
  let cursor = null;
  for (let i = 0; i < 100; i++) {
    const sep = path.includes("?") ? "&" : "?";
    const url = `${path}${sep}limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const res = await call("GET", url, { token });
    if (res.status !== 200 || !Array.isArray(res.data.items)) return null;
    if (res.data.items.length > limit) return null;
    items.push(...res.data.items);
    cursor = res.data.nextCursor;
    if (!cursor) return items;
  }
  return null;
}

const POST_KEYS =
  "commentCount,createdAt,description,editedAt,groupId,groupName,image,likeCount,likedByMe,name,postId,profileImage,savedByMe,userId";

function hasPostShape(post, extra = []) {
  return (
    post &&
    Object.keys(post).sort().join(",") === [...POST_KEYS.split(","), ...extra].sort().join(",") &&
    Number.isInteger(post.likeCount) &&
    Number.isInteger(post.commentCount) &&
    typeof post.likedByMe === "boolean" &&
    typeof post.savedByMe === "boolean"
  );
}

async function findPost(path, token, postId) {
  const items = await walk(path, token, 50);
  return items?.find((p) => p.postId === postId);
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
  for (const who of ["test", "sara", "omar", "lina", "james", "mona"]) {
    users[who] = await login(who);
  }
  const { test, sara, omar, lina, james, mona } = users;

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
  const followers = await call("GET", `/relationships/${test.id}`, { token: test.token });
  const followerList = await call("GET", `/users/${test.id}/followers`, { token: sara.token });
  const followingList = await call("GET", `/users/${test.id}/following`, { token: sara.token });
  check("GET /relationships/:uid still works", followers.status === 200 && Array.isArray(followers.data));
  check(
    "profile followerCount/followingCount are ints matching the lists",
    me.data.followerCount === followers.data.length &&
      me.data.followerCount === followerList.data.length &&
      me.data.followingCount === followingList.data.length &&
      Number.isInteger(me.data.followingCount),
    JSON.stringify(me.data)
  );
  check(
    "followers list shape",
    followerList.status === 200 &&
      followerList.data.length > 0 &&
      followerList.data.every((u) => Object.keys(u).sort().join(",") === "name,profileImage,userId") &&
      followerList.data.some((u) => u.userId === sara.id)
  );
  const saraFromTest = await call("GET", `/users/find/${sara.id}`, { token: test.token });
  const jamesFromTest = await call("GET", `/users/find/${james.id}`, { token: test.token });
  check(
    "isFollowing reflects the requester",
    saraFromTest.data.isFollowing === true && jamesFromTest.data.isFollowing === false
  );
  expectStatus(
    "followers of missing user -> 404",
    await call("GET", `/users/${MISSING_ID}/followers`, { token: test.token }),
    404
  );
  expectStatus(
    "followers invalid uuid -> 400",
    await call("GET", "/users/abc/following", { token: test.token }),
    400,
    "Invalid id"
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
  const feed = await call("GET", "/posts?limit=50", { token: test.token });
  check(
    "feed returns { items, nextCursor }",
    feed.status === 200 && Array.isArray(feed.data.items) && feed.data.items.length > 0 &&
      "nextCursor" in feed.data
  );
  check("feed rows have the rich shape", feed.data.items.every((p) => hasPostShape(p)), JSON.stringify(feed.data.items[0]));
  check("feed excludes group posts", feed.data.items.every((p) => p.groupId === null && p.groupName === null));
  const defaultPage = await call("GET", "/posts", { token: test.token });
  check("feed default limit is 10", defaultPage.status === 200 && defaultPage.data.items.length <= 10);
  const profilePosts = await call("GET", `/posts?userId=${sara.id}`, { token: test.token });
  check("profile posts work", profilePosts.status === 200 && profilePosts.data.items.length > 0);
  const omarPosts = await walk(`/posts?userId=${omar.id}`, test.token, 50);
  check(
    "profile posts exclude group posts",
    omarPosts && omarPosts.length > 0 && omarPosts.every((p) => p.groupId === null)
  );

  const fullFeed = await walk("/posts", test.token, 50);
  const pagedFeed = await walk("/posts", test.token, 2);
  const pagedIds = pagedFeed?.map((p) => p.postId) || [];
  check(
    "feed limit=2 walks every page with no duplicates",
    fullFeed && pagedFeed && pagedIds.length === fullFeed.length &&
      new Set(pagedIds).size === pagedIds.length &&
      pagedIds.join() === fullFeed.map((p) => p.postId).join(),
    `${pagedIds.length} vs ${fullFeed?.length}`
  );
  const sorted = [...(fullFeed || [])].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );
  check("feed is newest first", sorted.map((p) => p.postId).join() === (fullFeed || []).map((p) => p.postId).join());
  const big = await call("GET", "/posts?limit=500", { token: test.token });
  check("limit above 50 is capped", big.status === 200 && big.data.items.length <= 50);
  expectStatus("invalid cursor -> 400", await call("GET", "/posts?cursor=nope", { token: test.token }), 400, "Invalid cursor");
  expectStatus("invalid limit -> 400", await call("GET", "/posts?limit=abc", { token: test.token }), 400, "Invalid limit");
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
    expectStatus("like -> 201", await call("POST", `/likes/${postId}`, { token: sara.token }), 201);
    expectStatus("like twice -> 201", await call("POST", `/likes/${postId}`, { token: sara.token }), 201);
    const asSara = await findPost(`/posts?userId=${test.id}`, sara.token, postId);
    const asTest = await findPost(`/posts?userId=${test.id}`, test.token, postId);
    check(
      "counts after like + comment (likeCount 1, commentCount 1)",
      asSara?.likeCount === 1 && asSara?.commentCount === 1,
      JSON.stringify(asSara)
    );
    check("likedByMe true for the liker", asSara?.likedByMe === true);
    check("likedByMe false for others", asTest?.likedByMe === false);
    await call("DELETE", `/likes/${postId}`, { token: sara.token });
    const unliked = await findPost(`/posts?userId=${test.id}`, sara.token, postId);
    check("unlike -> likeCount 0, likedByMe false", unliked?.likeCount === 0 && unliked?.likedByMe === false);
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
  const saraPost = profilePosts.data.items[0];
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
  for (const path of ["/groups/joined", "/groups/unjoined"]) {
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
  check("member reads group posts", bookPosts.status === 200 && bookPosts.data.items.length > 0);
  check(
    "group posts carry groupId/groupName",
    bookPosts.data.items.every(
      (p) => hasPostShape(p) && p.groupId === books.groupId && p.groupName === "Book Club"
    ),
    JSON.stringify(bookPosts.data.items[0])
  );
  const bookPostId = bookPosts.data.items[0].postId;
  expectStatus(
    "non-member comments on group post -> 403",
    await call("POST", `/comments/${bookPostId}`, {
      token: james.token,
      body: { description: "hi" },
    }),
    403,
    NOT_MEMBER
  );
  expectStatus(
    "non-member reads group comments -> 403",
    await call("GET", `/comments/${bookPostId}`, { token: james.token }),
    403,
    NOT_MEMBER
  );
  expectStatus(
    "non-member likes group post -> 403",
    await call("POST", `/likes/${bookPostId}`, { token: james.token }),
    403,
    NOT_MEMBER
  );
  expectStatus(
    "non-member reads group likes -> 403",
    await call("GET", `/likes/${bookPostId}`, { token: james.token }),
    403,
    NOT_MEMBER
  );
  expectStatus(
    "non-member saves group post -> 403",
    await call("POST", `/save/${bookPostId}`, { token: james.token }),
    403,
    NOT_MEMBER
  );
  expectStatus(
    "old group like endpoint is gone",
    await call("POST", `/groups/${bookPostId}/likes`, { token: sara.token }),
    404
  );
  expectStatus(
    "group posts invalid cursor -> 400",
    await call("GET", `/groups/${books.groupId}/posts?cursor=abc`, { token: sara.token }),
    400
  );
  const fullPhoto = await walk(`/groups/${photo.groupId}/posts`, test.token, 50);
  const pagedPhoto = await walk(`/groups/${photo.groupId}/posts`, test.token, 1);
  check(
    "group posts limit=1 walk matches the full list",
    fullPhoto && pagedPhoto && fullPhoto.length > 1 &&
      pagedPhoto.map((p) => p.postId).join() === fullPhoto.map((p) => p.postId).join()
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
  // Saved group posts disappear from the saved list once you leave the group.
  const unsaveBook = () => call("DELETE", `/save/${bookPostId}`, { token: james.token });
  cleanups.push(unsaveBook);
  expectStatus(
    "member saves group post -> 201",
    await call("POST", `/save/${bookPostId}`, { token: james.token }),
    201
  );
  const jamesSaved = await walk("/save", james.token, 50);
  const savedBook = jamesSaved?.find((p) => p.postId === bookPostId);
  check(
    "saved group post listed with groupName and savedByMe",
    savedBook?.groupName === "Book Club" && savedBook?.savedByMe === true &&
      hasPostShape(savedBook, ["savedAt"]),
    JSON.stringify(savedBook)
  );
  expectStatus(
    "leave group -> 204",
    await call("DELETE", `/groups/${books.groupId}`, { token: james.token }),
    204
  );
  cleanups.splice(cleanups.length - 2, 1); // the leave-group cleanup is done
  const jamesSavedAfter = await walk("/save", james.token, 50);
  check(
    "saved list hides posts from groups you left",
    jamesSavedAfter && !jamesSavedAfter.some((p) => p.postId === bookPostId)
  );
  expectStatus("unsave after leaving still works -> 204", await unsaveBook(), 204);
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
    cleanups.push(() => call("DELETE", `/posts/${gpId}`, { token: sara.token }));
    expectStatus(
      "member likes group post -> 201",
      await call("POST", `/likes/${gpId}`, { token: lina.token }),
      201
    );
    expectStatus(
      "member comments on group post -> 201",
      await call("POST", `/comments/${gpId}`, {
        token: lina.token,
        body: { description: "nice" },
      }),
      201
    );
    const gpRow = await findPost(`/groups/${photo.groupId}/posts`, lina.token, gpId);
    check(
      "group post counts + likedByMe",
      gpRow?.likeCount === 1 && gpRow?.commentCount === 1 && gpRow?.likedByMe === true,
      JSON.stringify(gpRow)
    );
    const saraFeed = await walk("/posts", sara.token, 50);
    check("new group post not in author's feed", saraFeed && !saraFeed.some((p) => p.postId === gpId));
    expectStatus(
      "non-author non-creator deletes group post -> 404",
      await call("DELETE", `/posts/${gpId}`, { token: lina.token }),
      404,
      "Not found or not yours"
    );
    expectStatus(
      "group creator deletes member's post -> 204",
      await call("DELETE", `/posts/${gpId}`, { token: omar.token }),
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
  check("GET /save works", saved.status === 200 && Array.isArray(saved.data.items));
  check(
    "saved rows: rich shape + savedAt, all savedByMe",
    saved.data.items.length > 0 &&
      saved.data.items.every((p) => hasPostShape(p, ["savedAt"]) && p.savedByMe === true),
    JSON.stringify(saved.data.items[0])
  );
  check(
    "saved includes group posts with groupName",
    saved.data.items.some((p) => p.groupId && p.groupName)
  );
  check("GET /save/ids works", savedIds.status === 200 && Array.isArray(savedIds.data));
  const fullSaved = await walk("/save", test.token, 50);
  const pagedSaved = await walk("/save", test.token, 1);
  check(
    "saved limit=1 walk matches the full list",
    fullSaved && pagedSaved && fullSaved.length > 1 &&
      pagedSaved.map((p) => p.postId).join() === fullSaved.map((p) => p.postId).join()
  );
  const toSave = feed.data.items.find((p) => !savedIds.data.includes(p.postId));
  if (toSave) {
    cleanups.push(() => call("DELETE", `/save/${toSave.postId}`, { token: test.token }));
    expectStatus(
      "save post -> 201",
      await call("POST", `/save/${toSave.postId}`, { token: test.token }),
      201
    );
    const after = await call("GET", "/save/ids", { token: test.token });
    check("saved id listed", after.data.includes(toSave.postId));
    const savedRow = await findPost("/posts", test.token, toSave.postId);
    check("savedByMe true in feed after saving", savedRow?.savedByMe === true);
    const firstSaved = (await call("GET", "/save?limit=1", { token: test.token })).data.items[0];
    check("saved list is ordered by savedAt (newest save first)", firstSaved?.postId === toSave.postId);
    expectStatus(
      "unsave post -> 204",
      await call("DELETE", `/save/${toSave.postId}`, { token: test.token }),
      204
    );
    cleanups.pop();
  }
  expectStatus(
    "save missing post -> 404",
    await call("POST", `/save/${MISSING_ID}`, { token: test.token }),
    404
  );
  console.log("\nNotifications");
  const NOTIF_KEYS = "actor,comment,createdAt,event,group,notificationId,post,readAt,type";
  const unread = async (who) =>
    (await call("GET", "/notifications/unread-count", { token: who.token })).data.count;
  const notifs = async (who) =>
    (await call("GET", "/notifications?limit=50", { token: who.token })).data.items || [];

  const monaBase = await unread(mona);
  check("unread-count returns { count }", Number.isInteger(monaBase));
  const monaPost = await call("POST", "/posts", {
    token: mona.token,
    body: { description: "Smoke notification post ".repeat(5) },
  });
  expectStatus("recipient creates a post -> 201", monaPost, 201);
  if (monaPost.status === 201) {
    const mpId = monaPost.data.postId;
    // Deleting the post also deletes its notifications (FK cascade).
    cleanups.push(() => call("DELETE", `/posts/${mpId}`, { token: mona.token }));
    const likeNotifs = async () =>
      (await notifs(mona)).filter(
        (n) => n.type === "like" && n.post?.postId === mpId && n.actor.userId === sara.id
      );

    await call("POST", `/likes/${mpId}`, { token: sara.token });
    check("like -> unread count +1", (await unread(mona)) === monaBase + 1);
    const first = (await notifs(mona))[0];
    check(
      "like notification shape",
      first &&
        Object.keys(first).sort().join(",") === NOTIF_KEYS &&
        first.type === "like" &&
        first.readAt === null &&
        Object.keys(first.actor).sort().join(",") === "name,profileImage,userId" &&
        first.actor.userId === sara.id &&
        first.post.postId === mpId &&
        first.post.groupId === null &&
        first.post.excerpt === monaPost.data.description.slice(0, 80) &&
        first.group === null &&
        first.comment === null,
      JSON.stringify(first)
    );
    await call("POST", `/likes/${mpId}`, { token: sara.token });
    check("liking twice doesn't add a notification", (await unread(mona)) === monaBase + 1);
    await call("DELETE", `/likes/${mpId}`, { token: sara.token });
    check(
      "unlike removes the like notification",
      (await unread(mona)) === monaBase && (await likeNotifs()).length === 0
    );
    await call("POST", `/likes/${mpId}`, { token: sara.token });
    check("like -> unlike -> like leaves exactly one", (await likeNotifs()).length === 1);
    await call("POST", `/likes/${mpId}`, { token: mona.token });
    check(
      "liking your own post -> no notification",
      (await unread(mona)) === monaBase + 1 &&
        !(await notifs(mona)).some((n) => n.actor.userId === mona.id)
    );

    const comment = await call("POST", `/comments/${mpId}`, {
      token: sara.token,
      body: { description: "Smoke comment" },
    });
    const commentNotif = (await notifs(mona)).find((n) => n.type === "comment");
    check(
      "comment -> notification with comment excerpt",
      commentNotif?.comment?.commentId === comment.data.commentId &&
        commentNotif.comment.excerpt === "Smoke comment" &&
        commentNotif.post.postId === mpId &&
        commentNotif.actor.userId === sara.id,
      JSON.stringify(commentNotif)
    );
    await call("POST", `/comments/${mpId}`, {
      token: mona.token,
      body: { description: "my own comment" },
    });
    check("commenting on your own post -> no notification", (await unread(mona)) === monaBase + 2);

    cleanups.push(() => call("DELETE", `/relationships/${mona.id}`, { token: james.token }));
    await call("POST", `/relationships/${mona.id}`, { token: james.token });
    const followNotif = (await notifs(mona)).find(
      (n) => n.type === "follow" && n.actor.userId === james.id
    );
    check(
      "follow -> notification",
      followNotif && followNotif.post === null && followNotif.group === null &&
        (await unread(mona)) === monaBase + 3
    );
    await call("DELETE", `/relationships/${mona.id}`, { token: james.token });
    cleanups.pop();
    check(
      "unfollow removes the follow notification",
      !(await notifs(mona)).some((n) => n.type === "follow" && n.actor.userId === james.id) &&
        (await unread(mona)) === monaBase + 2
    );

    const pagedNotifs = await walk("/notifications", mona.token, 1);
    const allNotifs = await walk("/notifications", mona.token, 50);
    check(
      "notifications limit=1 walk matches the full list, newest first",
      pagedNotifs && allNotifs && allNotifs.length >= 2 &&
        pagedNotifs.map((n) => n.notificationId).join() ===
          allNotifs.map((n) => n.notificationId).join() &&
        allNotifs.every((n, i) => i === 0 || new Date(allNotifs[i - 1].createdAt) >= new Date(n.createdAt))
    );
    expectStatus(
      "notifications invalid cursor -> 400",
      await call("GET", "/notifications?cursor=abc", { token: mona.token }),
      400
    );

    expectStatus(
      "mark read with invalid ids -> 400",
      await call("POST", "/notifications/read", { token: mona.token, body: { ids: ["x"] } }),
      400
    );
    const target = (await notifs(mona)).find((n) => n.readAt === null);
    expectStatus(
      "someone else marking your notification read -> 204 (ignored)",
      await call("POST", "/notifications/read", {
        token: sara.token,
        body: { ids: [target.notificationId] },
      }),
      204
    );
    check("other user's mark-read has no effect", (await unread(mona)) === monaBase + 2);
    expectStatus(
      "mark one read -> 204",
      await call("POST", "/notifications/read", {
        token: mona.token,
        body: { ids: [target.notificationId] },
      }),
      204
    );
    const marked = (await notifs(mona)).find((n) => n.notificationId === target.notificationId);
    check(
      "marked notification has readAt, count -1",
      marked?.readAt !== null && (await unread(mona)) === monaBase + 1
    );
    // Only mark everything read when the recipient had no unread seed data.
    if (monaBase === 0) {
      expectStatus(
        "mark all read -> 204",
        await call("POST", "/notifications/read", { token: mona.token, body: {} }),
        204
      );
      check("unread count 0 after mark all", (await unread(mona)) === 0);
    }
  }

  cleanups.push(() => call("DELETE", `/groups/${photo.groupId}`, { token: james.token }));
  await call("POST", `/groups/${photo.groupId}`, { token: james.token });
  const joinNotif = (await notifs(omar)).find(
    (n) => n.type === "group_join" && n.actor.userId === james.id && n.group?.groupId === photo.groupId
  );
  check(
    "group join -> notification for the creator",
    joinNotif?.group?.name === "Photography" && joinNotif.post === null,
    JSON.stringify(joinNotif)
  );
  await call("DELETE", `/groups/${photo.groupId}`, { token: james.token });
  cleanups.pop();
  check(
    "leaving removes the join notification",
    !(await notifs(omar)).some(
      (n) => n.type === "group_join" && n.actor.userId === james.id && n.group?.groupId === photo.groupId
    )
  );
  expectStatus("notifications need a token -> 401", await call("GET", "/notifications"), 401);

  console.log("\nSearch");
  const sUsers = await call("GET", "/search?q=sara&type=users", { token: test.token });
  const sSara = sUsers.data.users?.find((x) => x.userId === sara.id);
  check(
    "search users finds Sara with isFollowing",
    sUsers.status === 200 &&
      Object.keys(sUsers.data).join() === "users" &&
      Object.keys(sSara || {}).sort().join(",") === "city,isFollowing,name,profileImage,userId" &&
      sSara.isFollowing === true,
    JSON.stringify(sUsers.data)
  );
  const sPosts = await call("GET", "/search?q=mountains&type=posts", { token: test.token });
  check(
    "search posts finds a seeded post (rich rows)",
    sPosts.status === 200 &&
      sPosts.data.posts.length > 0 &&
      sPosts.data.posts.every((p) => hasPostShape(p)) &&
      sPosts.data.posts.some((p) => p.userId === omar.id),
    JSON.stringify(sPosts.data).slice(0, 200)
  );
  const sGroups = await call("GET", "/search?q=photo&type=groups", { token: test.token });
  const sPhoto = sGroups.data.groups?.find((g) => g.groupId === photo.groupId);
  check(
    "search groups finds Photography",
    Object.keys(sPhoto || {}).sort().join(",") ===
      "description,groupId,image,isMember,memberCount,name" &&
      sPhoto.isMember === true && sPhoto.memberCount === 4,
    JSON.stringify(sGroups.data)
  );
  const sAll = await call("GET", "/search?q=a", { token: test.token });
  check(
    "type=all returns users/posts/groups, at most 5 each",
    sAll.status === 200 &&
      ["users", "posts", "groups"].every(
        (k) => Array.isArray(sAll.data[k]) && sAll.data[k].length <= 5
      ) &&
      sAll.data.posts.length > 0
  );
  const midnightMember = await call("GET", "/search?q=midnight library&type=posts", { token: sara.token });
  const midnightOther = await call("GET", "/search?q=midnight library&type=posts", { token: james.token });
  check(
    "group posts are searchable by members",
    midnightMember.data.posts?.some((p) => p.groupId === books.groupId)
  );
  check(
    "group posts hidden from non-members",
    midnightOther.status === 200 && !midnightOther.data.posts.some((p) => p.groupId === books.groupId)
  );
  const wildcard = await call("GET", "/search?q=%25&type=users", { token: test.token });
  check("LIKE wildcards are literal", wildcard.status === 200 && wildcard.data.users.length === 0);
  for (const [label, path] of [
    ["empty q -> 400", "/search?q="],
    ["blank q -> 400", "/search?q=%20%20"],
    ["missing q -> 400", "/search"],
    ["101-char q -> 400", `/search?q=${"a".repeat(101)}`],
  ]) {
    expectStatus(label, await call("GET", path, { token: test.token }), 400, "Search query is required");
  }
  expectStatus(
    "bad type -> 400",
    await call("GET", "/search?q=a&type=bogus", { token: test.token }),
    400
  );

  console.log("\nSuggestions");
  const sugg = await call("GET", "/users/suggestions", { token: test.token });
  const followingIds = (await call("GET", `/users/${test.id}/following`, { token: test.token })).data.map((x) => x.userId);
  check(
    "suggestions shape",
    sugg.status === 200 && Array.isArray(sugg.data) && sugg.data.length > 0 && sugg.data.length <= 5 &&
      sugg.data.every(
        (s) =>
          Object.keys(s).sort().join(",") === "city,mutualCount,name,profileImage,reason,userId" &&
          Number.isInteger(s.mutualCount) && typeof s.reason === "string" && s.reason
      ),
    JSON.stringify(sugg.data)
  );
  check(
    "suggestions exclude self and followed users",
    sugg.data.every((s) => s.userId !== test.id && !followingIds.includes(s.userId))
  );
  check(
    "friends of friends come first with a 'Followed by' reason",
    sugg.data[0]?.mutualCount > 0 && sugg.data[0].reason.startsWith("Followed by "),
    JSON.stringify(sugg.data[0])
  );
  const sugg1 = await call("GET", "/users/suggestions?limit=1", { token: test.token });
  check("suggestions limit=1", sugg1.status === 200 && sugg1.data.length === 1);

  console.log("\nEdit post");
  const toEdit = await call("POST", "/posts", { token: test.token, body: { description: "before edit" } });
  if (toEdit.status === 201) {
    const eId = toEdit.data.postId;
    cleanups.push(() => call("DELETE", `/posts/${eId}`, { token: test.token }));
    const edited = await call("PATCH", `/posts/${eId}`, {
      token: test.token,
      body: { description: "  after edit  " },
    });
    check(
      "author edits -> 200 rich row with editedAt",
      edited.status === 200 && hasPostShape(edited.data) &&
        edited.data.description === "after edit" && edited.data.editedAt !== null,
      JSON.stringify(edited.data)
    );
    const inFeed = await findPost("/posts", test.token, eId);
    check("feed shows the edit", inFeed?.description === "after edit" && inFeed.editedAt !== null);
    expectStatus(
      "someone else edits -> 404",
      await call("PATCH", `/posts/${eId}`, { token: sara.token, body: { description: "hack" } }),
      404,
      "Not found or not yours"
    );
    expectStatus(
      "edit to 2001 chars -> 400",
      await call("PATCH", `/posts/${eId}`, { token: test.token, body: { description: "a".repeat(2001) } }),
      400,
      "Post is too long (max 2000 characters)"
    );
    expectStatus(
      "edit text-only post to empty -> 400",
      await call("PATCH", `/posts/${eId}`, { token: test.token, body: { description: " " } }),
      400,
      "Post can't be empty"
    );
  }
  expectStatus(
    "edit missing post -> 404",
    await call("PATCH", `/posts/${MISSING_ID}`, { token: test.token, body: { description: "x" } }),
    404
  );
  expectStatus(
    "edit invalid uuid -> 400",
    await call("PATCH", "/posts/abc", { token: test.token, body: { description: "x" } }),
    400,
    "Invalid id"
  );

  console.log("\nDelete comment");
  const cPost = await call("POST", "/posts", { token: test.token, body: { description: "comment target" } });
  if (cPost.status === 201) {
    const cpId = cPost.data.postId;
    cleanups.push(() => call("DELETE", `/posts/${cpId}`, { token: test.token }));
    const c1 = await call("POST", `/comments/${cpId}`, { token: sara.token, body: { description: "one" } });
    const c2 = await call("POST", `/comments/${cpId}`, { token: james.token, body: { description: "two" } });
    const list = await call("GET", `/comments/${cpId}`, { token: test.token });
    check(
      "comment rows have the documented fields",
      list.status === 200 && list.data.length === 2 &&
        list.data.every(
          (c) =>
            Object.keys(c).sort().join(",") ===
            "commentId,createdAt,description,name,postId,profileImage,userId"
        ),
      JSON.stringify(list.data[0])
    );
    expectStatus(
      "stranger deletes comment -> 404",
      await call("DELETE", `/comments/${c1.data.commentId}`, { token: lina.token }),
      404,
      "Not found or not yours"
    );
    expectStatus(
      "comment author deletes -> 204",
      await call("DELETE", `/comments/${c1.data.commentId}`, { token: sara.token }),
      204
    );
    check(
      "deleted comment's notification is gone",
      !(await notifs(test)).some((n) => n.comment?.commentId === c1.data.commentId)
    );
    expectStatus(
      "post author deletes someone's comment -> 204",
      await call("DELETE", `/comments/${c2.data.commentId}`, { token: test.token }),
      204
    );
    expectStatus(
      "delete comment twice -> 404",
      await call("DELETE", `/comments/${c2.data.commentId}`, { token: test.token }),
      404
    );
    const after = await call("GET", `/comments/${cpId}`, { token: test.token });
    check("comments removed", after.data.length === 0);
  }
  expectStatus(
    "delete comment invalid uuid -> 400",
    await call("DELETE", "/comments/abc", { token: test.token }),
    400,
    "Invalid id"
  );

  console.log("\nBio");
  const profile = (await call("GET", `/users/find/${test.id}`, { token: test.token })).data;
  const profileBody = (bio) => ({
    name: profile.name,
    city: profile.city,
    website: profile.website,
    coverImage: profile.coverImage,
    profileImage: profile.profileImage,
    oldPassword: PASSWORD,
    ...(bio === undefined ? {} : { bio }),
  });
  check(
    "profile includes bio and createdAt",
    "bio" in profile && typeof profile.createdAt === "string" && !Number.isNaN(Date.parse(profile.createdAt))
  );
  const loginRes = await call("POST", "/auth/login", {
    body: { email: "test@communet.dev", password: PASSWORD },
  });
  check(
    "login user includes bio and createdAt",
    "bio" in loginRes.data.user && typeof loginRes.data.user.createdAt === "string"
  );
  cleanups.push(() => call("PUT", "/users", { token: test.token, body: profileBody(profile.bio) }));
  const setBio = await call("PUT", "/users", { token: test.token, body: profileBody("  Smoke bio  ") });
  check("update bio -> 200", setBio.status === 200 && setBio.data.bio === "Smoke bio", JSON.stringify(setBio.data));
  const keep = await call("PUT", "/users", { token: test.token, body: profileBody() });
  check("PUT without bio keeps it", keep.status === 200 && keep.data.bio === "Smoke bio");
  const readBack = await call("GET", `/users/find/${test.id}`, { token: test.token });
  check("bio round-trips", readBack.data.bio === "Smoke bio");
  expectStatus(
    "161-char bio -> 400",
    await call("PUT", "/users", { token: test.token, body: profileBody("b".repeat(161)) }),
    400,
    "Bio is too long (max 160 characters)"
  );
  const restored = await call("PUT", "/users", { token: test.token, body: profileBody(profile.bio) });
  check("bio restored", restored.status === 200 && restored.data.bio === profile.bio);
  cleanups.pop();
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
