import fs from "fs/promises";
import path from "path";
import pool from "../../db.js";
import { optionalString } from "../utils/validate.js";

export const STORY_CAPTION_MAX_LENGTH = 200;
const UPLOAD_DIR = "public/upload";
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

// Filenames produced by POST /api/upload (see multerConfig.js):
// "<timestamp>-<safe name>.<image ext>". No paths, no URLs.
const UPLOAD_NAME_RE = /^\d+-[A-Za-z0-9._-]+\.(jpe?g|png|gif|webp)$/i;

// A story is visible to its author and to the author's followers, until it
// expires. $1 = storyId, $2 = viewerId.
const visibleStoryQuery = `
  SELECT s."storyId", s."userId"
  FROM stories s
  WHERE s."storyId" = $1
    AND s."expiresAt" > now()
    AND (s."userId" = $2 OR EXISTS (
      SELECT 1 FROM relationships r
      WHERE r."followerUserId" = $2 AND r."followedUserId" = s."userId"))`;

const feedQuery = `
  SELECT s."storyId", s.image, s.caption, s."createdAt", s."expiresAt",
         u."userId", u.name, u."profileImage",
         (v."viewerId" IS NOT NULL) AS viewed
  FROM stories s
  JOIN users u ON u."userId" = s."userId"
  LEFT JOIN story_views v ON v."storyId" = s."storyId" AND v."viewerId" = $1
  WHERE s."expiresAt" > now()
    AND (s."userId" = $1 OR EXISTS (
      SELECT 1 FROM relationships r
      WHERE r."followerUserId" = $1 AND r."followedUserId" = s."userId"))
  ORDER BY s."createdAt" ASC, s."storyId" ASC`;

// The author's own views are recorded (so their ring turns "seen") but never
// listed.
const viewersQuery = `
  SELECT u."userId", u.name, u."profileImage", v."viewedAt"
  FROM story_views v
  JOIN users u ON u."userId" = v."viewerId"
  WHERE v."storyId" = $1 AND v."viewerId" <> $2
  ORDER BY v."viewedAt" DESC, u."userId"`;

async function uploadExists(name) {
  try {
    await fs.access(path.join(UPLOAD_DIR, name));
    return true;
  } catch {
    return false;
  }
}

// Validates a story body. Returns an error message or null.
async function storyError(image, caption) {
  if (
    typeof image !== "string" ||
    image.length > 255 ||
    !UPLOAD_NAME_RE.test(image) ||
    !(await uploadExists(image))
  ) {
    return "Invalid image";
  }
  if (caption && caption.length > STORY_CAPTION_MAX_LENGTH) {
    return `Caption is too long (max ${STORY_CAPTION_MAX_LENGTH} characters)`;
  }
  return null;
}

// POST /api/stories { image, caption? } -> 201 story
export async function createStory(req, res) {
  const { userInfo } = req;
  const image = req.body?.image;
  const caption = optionalString(req.body?.caption);

  try {
    const error = await storyError(image, caption);
    if (error) {
      return res.status(400).send(error);
    }

    const { rows } = await pool.query(
      `INSERT INTO stories ("userId", image, caption) VALUES ($1, $2, $3)
       RETURNING "storyId", "userId", image, caption, "createdAt", "expiresAt"`,
      [userInfo.id, image, caption]
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    console.error("createStory:", error);
    res.status(500).send("Server error");
  }
}

// GET /api/stories/feed -> [{ user, stories, hasUnseen }]
// Me first, then people with unseen stories, then the rest; within each of
// those, the most recent story first. A user's stories run oldest -> newest.
export async function getStoryFeed(req, res) {
  const { userInfo } = req;

  try {
    const { rows } = await pool.query(feedQuery, [userInfo.id]);
    const groups = new Map();
    for (const row of rows) {
      let group = groups.get(row.userId);
      if (!group) {
        group = {
          user: {
            userId: row.userId,
            name: row.name,
            profileImage: row.profileImage,
          },
          stories: [],
          hasUnseen: false,
        };
        groups.set(row.userId, group);
      }
      group.stories.push({
        storyId: row.storyId,
        image: row.image,
        caption: row.caption,
        createdAt: row.createdAt,
        expiresAt: row.expiresAt,
        viewed: row.viewed,
      });
      if (!row.viewed) group.hasUnseen = true;
    }

    const rank = (g) =>
      g.user.userId === userInfo.id ? 0 : g.hasUnseen ? 1 : 2;
    const latest = (g) => new Date(g.stories.at(-1).createdAt).getTime();
    const feed = [...groups.values()].sort(
      (a, b) => rank(a) - rank(b) || latest(b) - latest(a)
    );
    res.status(200).json(feed);
  } catch (error) {
    console.error("getStoryFeed:", error);
    res.status(500).send("Server error");
  }
}

// POST /api/stories/:storyId/view -> 204, idempotent.
export async function viewStory(req, res) {
  const { userInfo } = req;
  const { storyId } = req.params;

  try {
    const visible = await pool.query(visibleStoryQuery, [storyId, userInfo.id]);
    if (visible.rows.length === 0) {
      return res.status(404).send("Story not found");
    }
    await pool.query(
      `INSERT INTO story_views ("storyId", "viewerId") VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [storyId, userInfo.id]
    );
    res.status(204).send();
  } catch (error) {
    console.error("viewStory:", error);
    res.status(500).send("Server error");
  }
}

// DELETE /api/stories/:storyId -> 204; 404 unless you are the author.
export async function deleteStory(req, res) {
  const { userInfo } = req;
  const { storyId } = req.params;

  try {
    const { rowCount } = await pool.query(
      `DELETE FROM stories WHERE "storyId" = $1 AND "userId" = $2`,
      [storyId, userInfo.id]
    );
    if (rowCount === 0) {
      return res.status(404).send("Story not found");
    }
    res.status(204).send();
  } catch (error) {
    console.error("deleteStory:", error);
    res.status(500).send("Server error");
  }
}

// GET /api/stories/:storyId/viewers -> [{ userId, name, profileImage, viewedAt }]
// Author only (404 otherwise).
export async function getStoryViewers(req, res) {
  const { userInfo } = req;
  const { storyId } = req.params;

  try {
    const owner = await pool.query(
      `SELECT 1 FROM stories WHERE "storyId" = $1 AND "userId" = $2`,
      [storyId, userInfo.id]
    );
    if (owner.rows.length === 0) {
      return res.status(404).send("Story not found");
    }
    const { rows } = await pool.query(viewersQuery, [storyId, userInfo.id]);
    res.status(200).json(rows);
  } catch (error) {
    console.error("getStoryViewers:", error);
    res.status(500).send("Server error");
  }
}

// Deletes expired stories (their views cascade). Image files are left alone:
// the same upload can be referenced by posts or other stories.
export async function deleteExpiredStories() {
  const { rowCount } = await pool.query(
    `DELETE FROM stories WHERE "expiresAt" <= now()`
  );
  return rowCount;
}

// Runs the cleanup now and then hourly. Returns the interval handle.
export function startStoryCleanup() {
  const run = () =>
    deleteExpiredStories().catch((error) =>
      console.error("deleteExpiredStories:", error)
    );
  run();
  const timer = setInterval(run, CLEANUP_INTERVAL_MS);
  timer.unref?.();
  return timer;
}
