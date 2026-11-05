-- Schema for the "social" database.
-- Usage: psql -U postgres -p <port> -d social -f schema.sql

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- Trigram matching for /api/search.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS users (
    "userId" UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    "coverImage" VARCHAR(255),
    "profileImage" VARCHAR(255),
    city VARCHAR(100),
    website VARCHAR(200),
    bio VARCHAR(160),
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS groups (
    "groupId" UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    image VARCHAR(200),
    "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "createdBy" UUID,
    CONSTRAINT fk_creator FOREIGN KEY ("createdBy")
        REFERENCES users ("userId") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS group_members (
    "groupId" UUID,
    "userId" UUID,
    "joinedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("groupId", "userId"),
    CONSTRAINT fk_group FOREIGN KEY ("groupId")
        REFERENCES groups ("groupId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_user FOREIGN KEY ("userId")
        REFERENCES users ("userId") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS posts (
    "postId" UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    description VARCHAR(2000),
    image VARCHAR(200),
    "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "userId" UUID,
    -- NULL for regular posts; set for posts made inside a group.
    "groupId" UUID,
    -- Set when the author edits the description.
    "editedAt" TIMESTAMPTZ,
    CONSTRAINT fk_user FOREIGN KEY ("userId")
        REFERENCES users ("userId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_group FOREIGN KEY ("groupId")
        REFERENCES groups ("groupId") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS comments (
    "commentId" UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    description VARCHAR(1000) NOT NULL,
    "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "userId" UUID,
    "postId" UUID,
    CONSTRAINT fk_user FOREIGN KEY ("userId")
        REFERENCES users ("userId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_post FOREIGN KEY ("postId")
        REFERENCES posts ("postId") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS stories (
    "storyId" UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    image VARCHAR(200) NOT NULL,
    "userId" UUID,
    CONSTRAINT fk_user FOREIGN KEY ("userId")
        REFERENCES users ("userId") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS relationships (
    id SERIAL PRIMARY KEY,
    "followerUserId" UUID,
    "followedUserId" UUID,
    CONSTRAINT fk_follower FOREIGN KEY ("followerUserId")
        REFERENCES users ("userId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_followed FOREIGN KEY ("followedUserId")
        REFERENCES users ("userId") ON DELETE CASCADE ON UPDATE CASCADE,
    UNIQUE ("followerUserId", "followedUserId")
);

CREATE TABLE IF NOT EXISTS likes (
    "likeId" UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    "userId" UUID,
    "postId" UUID,
    CONSTRAINT fk_user FOREIGN KEY ("userId")
        REFERENCES users ("userId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_post FOREIGN KEY ("postId")
        REFERENCES posts ("postId") ON DELETE CASCADE ON UPDATE CASCADE,
    UNIQUE ("postId", "userId")
);

-- Saved posts (regular and group posts alike).
CREATE TABLE IF NOT EXISTS saved (
    "savedPostId" UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    "userId" UUID,
    "postId" UUID,
    "savedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_user FOREIGN KEY ("userId")
        REFERENCES users ("userId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_post FOREIGN KEY ("postId")
        REFERENCES posts ("postId") ON DELETE CASCADE ON UPDATE CASCADE,
    UNIQUE ("userId", "postId")
);

-- like / comment / follow / group_join notifications. postId, groupId and
-- commentId are set depending on the type.
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

-- Indexes for the common lookups (feeds, comments/likes per post, members, saved).
CREATE INDEX IF NOT EXISTS idx_posts_user_created ON posts ("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_posts_group_created ON posts ("groupId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_posts_created ON posts ("createdAt" DESC, "postId" DESC);
CREATE INDEX IF NOT EXISTS idx_comments_post ON comments ("postId");
CREATE INDEX IF NOT EXISTS idx_likes_post ON likes ("postId");
CREATE INDEX IF NOT EXISTS idx_likes_user ON likes ("userId");
CREATE INDEX IF NOT EXISTS idx_relationships_followed ON relationships ("followedUserId");
CREATE INDEX IF NOT EXISTS idx_relationships_follower ON relationships ("followerUserId");
CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members ("userId");
CREATE INDEX IF NOT EXISTS idx_saved_user ON saved ("userId");
CREATE INDEX IF NOT EXISTS idx_saved_user_saved ON saved ("userId", "savedAt" DESC);

-- Trigram indexes for search (ILIKE '%q%' and similarity operators).
CREATE INDEX IF NOT EXISTS idx_users_name_trgm ON users USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_groups_name_trgm ON groups USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_posts_description_trgm ON posts USING gin (description gin_trgm_ops);

-- >>> migrations/004_permalink_search.sql (folded in so a fresh install matches)

-- Migration 004: accent- and case-insensitive search.
--
--   unaccent                  extension
--   f_unaccent(text)          IMMUTABLE wrapper (unaccent() itself is only
--                             STABLE, so it can't be used in an index)
--   trigram GIN indexes       on f_unaccent(lower(...)) for users.name,
--                             groups.name and posts.description
--
-- The search queries compare f_unaccent(lower(column)) against
-- f_unaccent(lower(query)), so "jose" matches "José".
--
-- Runs in one transaction and is idempotent.
-- Usage: psql -U postgres -p <port> -d social -f migrations/004_permalink_search.sql

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Schema-qualified dictionary + function so the result never depends on
-- search_path, which is what makes declaring it IMMUTABLE safe.
CREATE OR REPLACE FUNCTION f_unaccent(text)
    RETURNS text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;

CREATE INDEX IF NOT EXISTS idx_users_name_unaccent_trgm
    ON users USING gin (f_unaccent(lower(name)) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_groups_name_unaccent_trgm
    ON groups USING gin (f_unaccent(lower(name)) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_posts_description_unaccent_trgm
    ON posts USING gin (f_unaccent(lower(description)) gin_trgm_ops);

-- >>> migrations/005_messages.sql (folded in so a fresh install matches)

-- Direct messages migration: 1:1 conversations between users.
--
--   conversations          one row per conversation; "lastMessageAt" orders the inbox
--   conversation_members   who is in a conversation and when they last read it
--   conversation_pairs     canonical ("userA" < "userB") pair -> conversation, so a
--                          pair of users can only ever have one conversation
--   messages               message bodies (1-2000 chars)
--
-- Runs in one transaction and is idempotent.
-- Usage: psql -U postgres -p <port> -d social -f migrations/005_messages.sql

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS conversations (
    "conversationId" UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastMessageAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS conversation_members (
    "conversationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "lastReadAt" TIMESTAMPTZ,
    PRIMARY KEY ("conversationId", "userId"),
    CONSTRAINT fk_cm_conversation FOREIGN KEY ("conversationId")
        REFERENCES conversations ("conversationId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_cm_user FOREIGN KEY ("userId")
        REFERENCES users ("userId") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS conversation_pairs (
    "userA" UUID NOT NULL,
    "userB" UUID NOT NULL,
    "conversationId" UUID NOT NULL UNIQUE,
    PRIMARY KEY ("userA", "userB"),
    CONSTRAINT ck_pair_order CHECK ("userA" < "userB"),
    CONSTRAINT fk_cp_conversation FOREIGN KEY ("conversationId")
        REFERENCES conversations ("conversationId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_cp_user_a FOREIGN KEY ("userA")
        REFERENCES users ("userId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_cp_user_b FOREIGN KEY ("userB")
        REFERENCES users ("userId") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS messages (
    "messageId" UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    "conversationId" UUID NOT NULL,
    "senderId" UUID NOT NULL,
    body VARCHAR(2000) NOT NULL CHECK (char_length(body) >= 1),
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_msg_conversation FOREIGN KEY ("conversationId")
        REFERENCES conversations ("conversationId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_msg_sender FOREIGN KEY ("senderId")
        REFERENCES users ("userId") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Inbox: a user's conversations; thread pages: keyset on ("createdAt", "messageId").
CREATE INDEX IF NOT EXISTS idx_conversation_members_user
    ON conversation_members ("userId", "conversationId");
CREATE INDEX IF NOT EXISTS idx_conversations_last_message
    ON conversations ("lastMessageAt" DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
    ON messages ("conversationId", "createdAt" DESC, "messageId" DESC);

-- >>> migrations/006_stories.sql (folded in so a fresh install matches)

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

-- >>> migrations/007_events.sql (folded in so a fresh install matches)

-- Events migration: group events with RSVPs, and "event" notifications.
--
--   events               a dated event inside a group (title, description,
--                        location, startsAt, optional endsAt)
--   event_rsvps          one row per (event, user): 'going' or 'interested'
--   notifications        type CHECK gains 'event'; new "eventId" column
--
-- Runs in one transaction and is idempotent.
-- Usage: psql -U postgres -p <port> -d social -f migrations/007_events.sql

CREATE TABLE IF NOT EXISTS events (
    "eventId" UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    "groupId" UUID NOT NULL,
    "createdBy" UUID,
    title VARCHAR(120) NOT NULL,
    description VARCHAR(2000),
    location VARCHAR(200),
    "startsAt" TIMESTAMPTZ NOT NULL,
    "endsAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_group FOREIGN KEY ("groupId")
        REFERENCES groups ("groupId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_creator FOREIGN KEY ("createdBy")
        REFERENCES users ("userId") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT ck_event_ends CHECK ("endsAt" IS NULL OR "endsAt" > "startsAt")
);

-- A group's calendar, and the cross-group "upcoming" list.
CREATE INDEX IF NOT EXISTS idx_events_group_starts ON events ("groupId", "startsAt");
CREATE INDEX IF NOT EXISTS idx_events_starts ON events ("startsAt");

CREATE TABLE IF NOT EXISTS event_rsvps (
    "eventId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('going', 'interested')),
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("eventId", "userId"),
    CONSTRAINT fk_event FOREIGN KEY ("eventId")
        REFERENCES events ("eventId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_user FOREIGN KEY ("userId")
        REFERENCES users ("userId") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Notifications: allow 'event' and point at the event.
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
    CHECK (type IN ('like', 'comment', 'follow', 'group_join', 'event'));

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS "eventId" UUID;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_event' AND conrelid = 'notifications'::regclass
    ) THEN
        ALTER TABLE notifications ADD CONSTRAINT fk_event FOREIGN KEY ("eventId")
            REFERENCES events ("eventId") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- One "event" notification per recipient and event.
CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_event
    ON notifications ("recipientId", "eventId") WHERE type = 'event';
