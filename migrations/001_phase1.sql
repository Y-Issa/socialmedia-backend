-- Phase 1 migration: longer text columns, TIMESTAMPTZ, and indexes.
-- Idempotent: safe to run more than once.
-- Usage: psql -U postgres -p <port> -d social -f migrations/001_phase1.sql
--
-- Existing TIMESTAMP values are interpreted in the session TimeZone when
-- converted to TIMESTAMPTZ, so run it with the same TimeZone the API wrote
-- them in (the server default).

BEGIN;

-- Length limits
ALTER TABLE posts ALTER COLUMN description TYPE VARCHAR(2000);
ALTER TABLE group_posts ALTER COLUMN description TYPE VARCHAR(2000);
ALTER TABLE comments ALTER COLUMN description TYPE VARCHAR(1000);
ALTER TABLE group_post_comments ALTER COLUMN description TYPE VARCHAR(1000);

-- TIMESTAMP -> TIMESTAMPTZ (only columns that are still TIMESTAMP)
DO $$
DECLARE
    col record;
BEGIN
    FOR col IN
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND data_type = 'timestamp without time zone'
          AND (table_name, column_name) IN (
              ('posts', 'createdAt'),
              ('comments', 'createdAt'),
              ('groups', 'createdAt'),
              ('group_members', 'joinedAt'),
              ('group_posts', 'createdAt'),
              ('group_post_likes', 'createdAt'),
              ('group_post_comments', 'createdAt'),
              ('saved', 'savedAt')
          )
    LOOP
        EXECUTE format(
            'ALTER TABLE %I ALTER COLUMN %I TYPE TIMESTAMPTZ',
            col.table_name, col.column_name
        );
    END LOOP;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_posts_user_created ON posts ("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_comments_post ON comments ("postId");
CREATE INDEX IF NOT EXISTS idx_likes_post ON likes ("postId");
CREATE INDEX IF NOT EXISTS idx_group_posts_group_created ON group_posts ("groupId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_group_post_comments_post ON group_post_comments ("postId");
CREATE INDEX IF NOT EXISTS idx_group_post_likes_post ON group_post_likes ("postId");
CREATE INDEX IF NOT EXISTS idx_relationships_followed ON relationships ("followedUserId");
CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members ("userId");
CREATE INDEX IF NOT EXISTS idx_saved_user ON saved ("userId");

COMMIT;
