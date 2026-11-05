// Seeds the database with demo users, posts, follows, comments, likes,
// groups and saved posts. Group posts are rows in posts with a "groupId";
// their likes, comments and saves live in the same tables as everything else.
//
//   npm run seed            -> seeds only if the database is empty
//   npm run seed -- --reset -> WIPES ALL DATA, then seeds
//
// Every seeded account uses the password below.
//   Test account: test@communet.dev / test1234

import bcrypt from "bcrypt";
import pool from "./db.js";

const PASSWORD = "test1234";
const reset = process.argv.includes("--reset");

// Images that already exist in public/upload.
const IMG = {
  field: "1718914059518-3900252.jpg",
  city: "1719062407749-2943466.jpg",
  mountains: "1719265621433-9924042.jpg",
  tree: "1719268078300-lonely_tree_by_samuel_one_dea301s.png",
  city2: "1719326481601-2943466.jpg",
  wallpaper: "1719326677927-inspire-wallpaper-2560x1080_14.jpg",
};

const USERS = [
  { key: "test", name: "Test User", email: "test@communet.dev", city: "Cairo", website: "communet.dev", coverImage: IMG.wallpaper },
  { key: "sara", name: "Sara Ahmed", email: "sara@communet.dev", city: "Alexandria", coverImage: IMG.field },
  { key: "omar", name: "Omar Khaled", email: "omar@communet.dev", city: "Giza", website: "omar.photos", coverImage: IMG.mountains },
  { key: "lina", name: "Lina Haddad", email: "lina@communet.dev", city: "Beirut", coverImage: IMG.tree },
  { key: "james", name: "James Carter", email: "james@communet.dev", city: "London" },
  { key: "mona", name: "Mona Fathy", email: "mona@communet.dev", city: "Cairo" },
];

// [follower, followed]
const FOLLOWS = [
  ["test", "sara"], ["test", "omar"], ["test", "lina"],
  ["sara", "test"], ["omar", "test"], ["james", "test"],
  ["sara", "omar"], ["omar", "lina"], ["lina", "sara"], ["mona", "sara"],
];

// hoursAgo controls ordering in the feed.
const POSTS = [
  { key: "p1", by: "test", hoursAgo: 2, description: "Just got Communet up and running again. Hello everyone! 👋" },
  { key: "p2", by: "sara", hoursAgo: 5, description: "Weekend trip to the countryside. Needed this.", image: IMG.field },
  { key: "p3", by: "omar", hoursAgo: 9, description: "Golden hour from the mountains 🏔️", image: IMG.mountains },
  { key: "p4", by: "lina", hoursAgo: 20, description: "This tree has been standing alone for decades.", image: IMG.tree },
  { key: "p5", by: "test", hoursAgo: 30, description: "City lights never get old.", image: IMG.city },
  { key: "p6", by: "james", hoursAgo: 48, description: "Anyone up for a coding meetup next week?" },
  { key: "p7", by: "sara", hoursAgo: 72, description: "Coffee + rain + a good book. Perfect evening ☕" },
  { key: "p8", by: "mona", hoursAgo: 96, description: "First post here!" },
];

// [post, user, text]
const COMMENTS = [
  ["p1", "sara", "Welcome back!"],
  ["p1", "omar", "Looks great 🔥"],
  ["p2", "test", "Where is this? Looks amazing."],
  ["p2", "lina", "So peaceful."],
  ["p3", "test", "Incredible shot."],
  ["p5", "james", "Which city is this?"],
  ["p6", "test", "Count me in!"],
];

// [post, user]
const LIKES = [
  ["p1", "sara"], ["p1", "omar"], ["p1", "james"],
  ["p2", "test"], ["p2", "lina"], ["p2", "omar"],
  ["p3", "test"], ["p3", "sara"],
  ["p4", "test"], ["p4", "omar"],
  ["p5", "sara"],
  ["p6", "test"],
];

const GROUPS = [
  { key: "photo", name: "Photography", description: "Share your best shots and get feedback.", by: "omar", members: ["omar", "test", "sara", "lina"] },
  { key: "dev", name: "Web Developers", description: "React, Node, Postgres and everything in between.", by: "test", members: ["test", "james", "mona"] },
  { key: "books", name: "Book Club", description: "Monthly reads and discussions.", by: "sara", members: ["sara", "lina"] },
];

const GROUP_POSTS = [
  { key: "g1", group: "photo", by: "omar", hoursAgo: 3, description: "Weekly challenge: architecture. Post yours below!", image: IMG.city2 },
  { key: "g2", group: "photo", by: "sara", hoursAgo: 12, description: "My entry for last week's nature theme.", image: IMG.field },
  { key: "g3", group: "dev", by: "test", hoursAgo: 6, description: "What's everyone using for state management these days?" },
  { key: "g4", group: "dev", by: "james", hoursAgo: 26, description: "TanStack Query has been a game changer for me." },
  { key: "g5", group: "books", by: "sara", hoursAgo: 40, description: "This month's pick: 'The Midnight Library'. Thoughts?" },
];

const GROUP_COMMENTS = [
  ["g1", "test", "Great theme!"],
  ["g3", "james", "TanStack Query + context for auth."],
  ["g3", "mona", "Zustand for anything global."],
  ["g5", "lina", "Loved it!"],
];

const GROUP_LIKES = [
  ["g1", "test"], ["g1", "sara"], ["g2", "omar"], ["g3", "james"], ["g3", "mona"], ["g4", "test"],
];

// Test user's saved posts: [user, post] / [user, group post]
const SAVED = [["test", "p3"], ["test", "p4"]];
const SAVED_GROUP = [["test", "g1"]];

const ago = (h) => new Date(Date.now() - h * 3600 * 1000);

async function main() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query("SELECT count(*)::int AS n FROM users");
    if (rows[0].n > 0 && !reset) {
      console.log(
        `Database already has ${rows[0].n} user(s). Nothing seeded.\n` +
          "Run `npm run seed -- --reset` to WIPE ALL DATA and reseed."
      );
      return;
    }

    await client.query("BEGIN");

    if (reset) {
      await client.query(
        "TRUNCATE users, posts, comments, stories, relationships, likes, groups, group_members, saved RESTART IDENTITY CASCADE"
      );
      console.log("All existing data wiped.");
    }

    const hash = await bcrypt.hash(PASSWORD, 10);
    const u = {};
    for (const user of USERS) {
      const r = await client.query(
        `INSERT INTO users (name, email, password, city, website, "coverImage")
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING "userId"`,
        [user.name, user.email, hash, user.city || null, user.website || null, user.coverImage || null]
      );
      u[user.key] = r.rows[0].userId;
    }

    for (const [a, b] of FOLLOWS) {
      await client.query(
        `INSERT INTO relationships ("followerUserId", "followedUserId") VALUES ($1, $2)`,
        [u[a], u[b]]
      );
    }

    const p = {};
    for (const post of POSTS) {
      const r = await client.query(
        `INSERT INTO posts (description, image, "userId", "createdAt")
         VALUES ($1, $2, $3, $4) RETURNING "postId"`,
        [post.description, post.image || null, u[post.by], ago(post.hoursAgo)]
      );
      p[post.key] = r.rows[0].postId;
    }

    for (const [i, [post, user, text]] of COMMENTS.entries()) {
      const hours = POSTS.find((x) => x.key === post).hoursAgo - 0.5 - i * 0.05;
      await client.query(
        `INSERT INTO comments (description, "postId", "userId", "createdAt") VALUES ($1, $2, $3, $4)`,
        [text, p[post], u[user], ago(Math.max(hours, 0.1))]
      );
    }

    for (const [post, user] of LIKES) {
      await client.query(`INSERT INTO likes ("postId", "userId") VALUES ($1, $2)`, [p[post], u[user]]);
    }

    const g = {};
    for (const group of GROUPS) {
      const r = await client.query(
        `INSERT INTO groups (name, description, "createdBy") VALUES ($1, $2, $3) RETURNING "groupId"`,
        [group.name, group.description, u[group.by]]
      );
      g[group.key] = r.rows[0].groupId;
      for (const m of group.members) {
        await client.query(`INSERT INTO group_members ("groupId", "userId") VALUES ($1, $2)`, [g[group.key], u[m]]);
      }
    }

    const gp = {};
    for (const post of GROUP_POSTS) {
      const r = await client.query(
        `INSERT INTO posts (description, image, "userId", "groupId", "createdAt")
         VALUES ($1, $2, $3, $4, $5) RETURNING "postId"`,
        [post.description, post.image || null, u[post.by], g[post.group], ago(post.hoursAgo)]
      );
      gp[post.key] = r.rows[0].postId;
    }

    for (const [i, [post, user, text]] of GROUP_COMMENTS.entries()) {
      const hours = GROUP_POSTS.find((x) => x.key === post).hoursAgo - 0.5 - i * 0.05;
      await client.query(
        `INSERT INTO comments (description, "postId", "userId", "createdAt") VALUES ($1, $2, $3, $4)`,
        [text, gp[post], u[user], ago(Math.max(hours, 0.1))]
      );
    }

    for (const [post, user] of GROUP_LIKES) {
      await client.query(`INSERT INTO likes ("postId", "userId") VALUES ($1, $2)`, [gp[post], u[user]]);
    }

    // Spread savedAt so the saved list (ordered by savedAt) has a stable order.
    const toSave = [
      ...SAVED.map(([user, post]) => [u[user], p[post]]),
      ...SAVED_GROUP.map(([user, post]) => [u[user], gp[post]]),
    ];
    for (const [i, [userId, postId]] of toSave.entries()) {
      await client.query(
        `INSERT INTO saved ("userId", "postId", "savedAt") VALUES ($1, $2, $3)`,
        [userId, postId, ago(1 + i)]
      );
    }

    await client.query("COMMIT");

    console.log(
      `Seeded ${USERS.length} users, ${POSTS.length} posts, ${COMMENTS.length} comments, ` +
        `${LIKES.length} likes, ${FOLLOWS.length} follows, ${GROUPS.length} groups, ` +
        `${GROUP_POSTS.length} group posts, ${SAVED.length + SAVED_GROUP.length} saved posts.`
    );
    console.log(`\nTest account:  test@communet.dev  /  ${PASSWORD}`);
    console.log(`Other accounts (same password): ${USERS.slice(1).map((x) => x.email).join(", ")}`);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Seeding failed, nothing was changed:", error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
