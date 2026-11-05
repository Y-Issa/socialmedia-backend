-- Events migration: group events with RSVPs, and "event" notifications.
--
--   events               a dated event inside a group (title, description,
--                        location, startsAt, optional endsAt)
--   event_rsvps          one row per (event, user): 'going' or 'interested'
--   notifications        type CHECK gains 'event'; new "eventId" column
--
-- Runs in one transaction and is idempotent.
-- Usage: psql -U postgres -p <port> -d social -f migrations/007_events.sql

BEGIN;

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

COMMIT;
