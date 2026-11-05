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
