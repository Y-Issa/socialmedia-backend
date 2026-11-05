-- Stories migration: 24-hour stories and who has seen them.
--
--   stories        reshapes the old, unused table (storyId, image, userId):
--                  "userId" NOT NULL, image VARCHAR(255), caption, createdAt,
--                  expiresAt (createdAt + 24h)
--   story_views    one row per (story, viewer); viewing twice is a no-op
--
-- Expired rows are removed by the API's hourly cleanup (src/controllers/story.js).
-- Runs in one transaction and is idempotent.
-- Usage: psql -U postgres -p <port> -d social -f migrations/006_stories.sql

BEGIN;

CREATE TABLE IF NOT EXISTS stories (
    "storyId" UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    image VARCHAR(255) NOT NULL,
    "userId" UUID NOT NULL,
    CONSTRAINT fk_user FOREIGN KEY ("userId")
        REFERENCES users ("userId") ON DELETE CASCADE ON UPDATE CASCADE
);

-- The old table allowed stories without an author; it was never used.
DELETE FROM stories WHERE "userId" IS NULL;
ALTER TABLE stories ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE stories ALTER COLUMN image TYPE VARCHAR(255);
ALTER TABLE stories ADD COLUMN IF NOT EXISTS caption VARCHAR(200);
ALTER TABLE stories
    ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE stories
    ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMPTZ NOT NULL
        DEFAULT now() + INTERVAL '24 hours';

-- Feed: a user's live stories, oldest first.
CREATE INDEX IF NOT EXISTS idx_stories_user_created
    ON stories ("userId", "createdAt");
-- Cleanup and "not expired" filters.
CREATE INDEX IF NOT EXISTS idx_stories_expires ON stories ("expiresAt");

CREATE TABLE IF NOT EXISTS story_views (
    "storyId" UUID NOT NULL,
    "viewerId" UUID NOT NULL,
    "viewedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY ("storyId", "viewerId"),
    CONSTRAINT fk_story FOREIGN KEY ("storyId")
        REFERENCES stories ("storyId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_viewer FOREIGN KEY ("viewerId")
        REFERENCES users ("userId") ON DELETE CASCADE ON UPDATE CASCADE
);

-- "Which of these stories have I seen?" lookups from the feed.
CREATE INDEX IF NOT EXISTS idx_story_views_viewer ON story_views ("viewerId");

COMMIT;
