import pg from "pg";
import "dotenv/config";

const { Pool } = pg;

const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "social",
  password: process.env.POSTGRES_PASSWORD,
});

export default pool;

/*
The following is related to setting up db in pgAdmin:
After creating a social database in pgAdmin, run the following SQL queries:

-- Ensure uuid-ossp extension is available or create it if not exists
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create users table
CREATE TABLE users (
    "userId" UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    "coverImage" VARCHAR(255),
    "profileImage" VARCHAR(255),
    city VARCHAR(100),
    website VARCHAR(200)
);

-- Create posts table
CREATE TABLE posts (
    "postId" UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    description VARCHAR(200),
    image VARCHAR(200),
    "createdAt" TIMESTAMP,
    "userId" UUID,
    CONSTRAINT fk_user
        FOREIGN KEY("userId")
        REFERENCES users("userId")
        ON DELETE CASCADE
        ON UPDATE CASCADE
);

-- Create comments table
CREATE TABLE comments (
    "commentId" UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    description VARCHAR(200) NOT NULL,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "userId" UUID,
    "postId" UUID,
    CONSTRAINT fk_user
        FOREIGN KEY("userId")
        REFERENCES users("userId")
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    CONSTRAINT fk_post
        FOREIGN KEY("postId")
        REFERENCES posts("postId")
        ON DELETE CASCADE
        ON UPDATE CASCADE
);

-- Create stories table
CREATE TABLE stories (
    "storyId" UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    image VARCHAR(200) NOT NULL,
    "userId" UUID,
    CONSTRAINT fk_user
        FOREIGN KEY("userId")
        REFERENCES users("userId")
        ON DELETE CASCADE
        ON UPDATE CASCADE
);

-- Create relationships table
CREATE TABLE relationships (
    id SERIAL PRIMARY KEY,
    "followerUserId" UUID,
    "followedUserId" UUID,
    CONSTRAINT fk_follower
        FOREIGN KEY ("followerUserId")
        REFERENCES users ("userId")
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    CONSTRAINT fk_followed
        FOREIGN KEY ("followedUserId")
        REFERENCES users ("userId")
        ON DELETE CASCADE
        ON UPDATE CASCADE
);

-- Create likes table
CREATE TABLE likes (
    "likeId" UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    "userId" UUID,
    "postId" UUID,
    CONSTRAINT "fk_user"
        FOREIGN KEY ("userId")
        REFERENCES users ("userId")
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    CONSTRAINT "fk_post"
        FOREIGN KEY ("postId")
        REFERENCES posts ("postId")
        ON DELETE CASCADE
        ON UPDATE CASCADE
);

-- Create saved table
CREATE TABLE saved (
    "savedPostId" UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    "userId" UUID,
    "postId" UUID,
    "groupPostId" UUID,
    "savedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_user
        FOREIGN KEY("userId")
        REFERENCES users("userId")
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    CONSTRAINT fk_post
        FOREIGN KEY("postId")
        REFERENCES posts("postId")
        ON DELETE CASCADE
        ON UPDATE CASCADE
    CONSTRAINT fk_g_post
        FOREIGN KEY("groupPostId")
        REFERENCES group_posts("postId")
        ON DELETE CASCADE
        ON UPDATE CASCADE
);

-- Query to create the groups table
CREATE TABLE groups (
    "groupId" UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    image VARCHAR(200),
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "createdBy" UUID,
    CONSTRAINT fk_creator
        FOREIGN KEY("createdBy")
        REFERENCES users("userId")
        ON DELETE SET NULL
        ON UPDATE CASCADE
);

-- Query to create the group_members table
CREATE TABLE group_members (
    "groupId" UUID,
    "userId" UUID,
    "joinedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("groupId", "userId"),
    CONSTRAINT fk_group
        FOREIGN KEY("groupId")
        REFERENCES groups("groupId")
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    CONSTRAINT fk_user
        FOREIGN KEY("userId")
        REFERENCES users("userId")
        ON DELETE CASCADE
        ON UPDATE CASCADE
);

-- Query to create the group_posts table
CREATE TABLE group_posts (
    "postId" UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    "groupId" UUID,
    "userId" UUID,
    description VARCHAR(200),
    image VARCHAR(200),
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_group
        FOREIGN KEY("groupId")
        REFERENCES groups("groupId")
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    CONSTRAINT fk_user
        FOREIGN KEY("userId")
        REFERENCES users("userId")
        ON DELETE CASCADE
        ON UPDATE CASCADE
);

CREATE TABLE group_post_likes (
    "likeId" UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    "postId" UUID,
    "userId" UUID,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_group_post
        FOREIGN KEY("postId")
        REFERENCES group_posts("postId")
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    CONSTRAINT fk_user
        FOREIGN KEY("userId")
        REFERENCES users("userId")
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    UNIQUE ("postId", "userId")
);

CREATE TABLE group_post_comments (
    "commentId" UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    "postId" UUID,
    "userId" UUID,
    description VARCHAR(200) NOT NULL,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_group_post
        FOREIGN KEY("postId")
        REFERENCES group_posts("postId")
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    CONSTRAINT fk_user
        FOREIGN KEY("userId")
        REFERENCES users("userId")
        ON DELETE CASCADE
        ON UPDATE CASCADE
);


*/
