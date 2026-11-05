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

BEGIN;

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

COMMIT;
