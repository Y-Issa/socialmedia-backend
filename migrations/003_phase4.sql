-- Phase 4 migration: notifications, search indexes, bios, edited posts.
--
--   users.bio                 VARCHAR(160), optional
--   users."createdAt"         when the account was made (existing rows: now)
--   posts."editedAt"          set when the author edits the description
--   notifications             like / comment / follow / group_join
--   pg_trgm + GIN indexes     for /api/search
--
-- Runs in one transaction and is idempotent.
-- Usage: psql -U postgres -p <port> -d social -f migrations/003_phase4.sql

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE users ADD COLUMN IF NOT EXISTS bio VARCHAR(160);
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE posts ADD COLUMN IF NOT EXISTS "editedAt" TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS notifications (
    "notificationId" UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    "recipientId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('like', 'comment', 'follow', 'group_join')),
    "postId" UUID,
    "groupId" UUID,
    "commentId" UUID,
    "readAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_recipient FOREIGN KEY ("recipientId")
        REFERENCES users ("userId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_actor FOREIGN KEY ("actorId")
        REFERENCES users ("userId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_post FOREIGN KEY ("postId")
        REFERENCES posts ("postId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_group FOREIGN KEY ("groupId")
        REFERENCES groups ("groupId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_comment FOREIGN KEY ("commentId")
        REFERENCES comments ("commentId") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created
    ON notifications ("recipientId", "createdAt" DESC, "notificationId" DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread
    ON notifications ("recipientId") WHERE "readAt" IS NULL;

-- At most one like / follow / join notification per actor and target, so
-- like -> unlike -> like never stacks duplicates (inserts use ON CONFLICT).
CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_like
    ON notifications ("actorId", "postId") WHERE type = 'like';
CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_follow
    ON notifications ("actorId", "recipientId") WHERE type = 'follow';
CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_group_join
    ON notifications ("actorId", "groupId") WHERE type = 'group_join';

-- Trigram indexes for search (ILIKE '%q%' and similarity operators).
CREATE INDEX IF NOT EXISTS idx_users_name_trgm ON users USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_groups_name_trgm ON groups USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_posts_description_trgm ON posts USING gin (description gin_trgm_ops);

COMMIT;
