-- Phase 2 migration: merge group posts into the posts table.
--
--   posts."groupId"        NULL for regular posts, set for group posts
--   group_posts            -> posts (postId and createdAt preserved)
--   group_post_likes       -> likes
--   group_post_comments    -> comments (commentId and createdAt preserved)
--   saved."groupPostId"    -> saved."postId"
--
-- The old tables and column are dropped afterwards. Runs in one transaction
-- and is idempotent: once the old tables are gone the copy steps are skipped.
-- Usage: psql -U postgres -p <port> -d social -f migrations/002_unify_posts.sql

BEGIN;

ALTER TABLE posts
    ADD COLUMN IF NOT EXISTS "groupId" UUID
    REFERENCES groups ("groupId") ON DELETE CASCADE ON UPDATE CASCADE;

DO $$
BEGIN
    IF to_regclass('public.group_posts') IS NOT NULL THEN
        INSERT INTO posts ("postId", description, image, "createdAt", "userId", "groupId")
        SELECT "postId", description, image, "createdAt", "userId", "groupId"
        FROM group_posts
        ON CONFLICT ("postId") DO NOTHING;
    END IF;

    IF to_regclass('public.group_post_likes') IS NOT NULL THEN
        INSERT INTO likes ("userId", "postId")
        SELECT "userId", "postId" FROM group_post_likes
        ON CONFLICT ("postId", "userId") DO NOTHING;
    END IF;

    IF to_regclass('public.group_post_comments') IS NOT NULL THEN
        INSERT INTO comments ("commentId", description, "createdAt", "userId", "postId")
        SELECT "commentId", description, "createdAt", "userId", "postId"
        FROM group_post_comments
        ON CONFLICT ("commentId") DO NOTHING;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'saved' AND column_name = 'groupPostId'
    ) THEN
        UPDATE saved SET "postId" = "groupPostId"
        WHERE "groupPostId" IS NOT NULL AND "postId" IS NULL;
    END IF;
END $$;

ALTER TABLE saved DROP COLUMN IF EXISTS "groupPostId";
DROP TABLE IF EXISTS group_post_likes;
DROP TABLE IF EXISTS group_post_comments;
DROP TABLE IF EXISTS group_posts;

-- Every saved row now points at a post.
DELETE FROM saved WHERE "postId" IS NULL;

-- Indexes for group feeds and keyset pagination.
CREATE INDEX IF NOT EXISTS idx_posts_group_created ON posts ("groupId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_posts_created ON posts ("createdAt" DESC, "postId" DESC);
CREATE INDEX IF NOT EXISTS idx_saved_user_saved ON saved ("userId", "savedAt" DESC);
CREATE INDEX IF NOT EXISTS idx_likes_user ON likes ("userId");
CREATE INDEX IF NOT EXISTS idx_relationships_follower ON relationships ("followerUserId");

COMMIT;
