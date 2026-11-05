-- Schema for the "social" database.
-- Usage: psql -U postgres -p <port> -d social -f schema.sql

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS users (
    "userId" UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    "coverImage" VARCHAR(255),
    "profileImage" VARCHAR(255),
    city VARCHAR(100),
    website VARCHAR(200)
);

CREATE TABLE IF NOT EXISTS posts (
    "postId" UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    description VARCHAR(2000),
    image VARCHAR(200),
    "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "userId" UUID,
    CONSTRAINT fk_user FOREIGN KEY ("userId")
        REFERENCES users ("userId") ON DELETE CASCADE ON UPDATE CASCADE
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

CREATE TABLE IF NOT EXISTS group_posts (
    "postId" UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    "groupId" UUID,
    "userId" UUID,
    description VARCHAR(2000),
    image VARCHAR(200),
    "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_group FOREIGN KEY ("groupId")
        REFERENCES groups ("groupId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_user FOREIGN KEY ("userId")
        REFERENCES users ("userId") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS group_post_likes (
    "likeId" UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    "postId" UUID,
    "userId" UUID,
    "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_group_post FOREIGN KEY ("postId")
        REFERENCES group_posts ("postId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_user FOREIGN KEY ("userId")
        REFERENCES users ("userId") ON DELETE CASCADE ON UPDATE CASCADE,
    UNIQUE ("postId", "userId")
);

CREATE TABLE IF NOT EXISTS group_post_comments (
    "commentId" UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    "postId" UUID,
    "userId" UUID,
    description VARCHAR(1000) NOT NULL,
    "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_group_post FOREIGN KEY ("postId")
        REFERENCES group_posts ("postId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_user FOREIGN KEY ("userId")
        REFERENCES users ("userId") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Created last because it references both posts and group_posts.
-- A row saves either a regular post ("postId") or a group post ("groupPostId").
CREATE TABLE IF NOT EXISTS saved (
    "savedPostId" UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    "userId" UUID,
    "postId" UUID,
    "groupPostId" UUID,
    "savedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_user FOREIGN KEY ("userId")
        REFERENCES users ("userId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_post FOREIGN KEY ("postId")
        REFERENCES posts ("postId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_g_post FOREIGN KEY ("groupPostId")
        REFERENCES group_posts ("postId") ON DELETE CASCADE ON UPDATE CASCADE,
    UNIQUE ("userId", "postId"),
    UNIQUE ("userId", "groupPostId")
);

-- Indexes for the common lookups (feed, comments/likes per post, members, saved).
CREATE INDEX IF NOT EXISTS idx_posts_user_created ON posts ("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_comments_post ON comments ("postId");
CREATE INDEX IF NOT EXISTS idx_likes_post ON likes ("postId");
CREATE INDEX IF NOT EXISTS idx_group_posts_group_created ON group_posts ("groupId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_group_post_comments_post ON group_post_comments ("postId");
CREATE INDEX IF NOT EXISTS idx_group_post_likes_post ON group_post_likes ("postId");
CREATE INDEX IF NOT EXISTS idx_relationships_followed ON relationships ("followedUserId");
CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members ("userId");
CREATE INDEX IF NOT EXISTS idx_saved_user ON saved ("userId");
