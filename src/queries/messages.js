// Direct message queries (see migrations/005_messages.sql).

const isoUtc = (column) =>
  `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

const MESSAGE_COLUMNS = `"messageId", "conversationId", "senderId", body, "createdAt"`;

export const userExistsQuery = `SELECT 1 FROM users WHERE "userId" = $1`;

// $1 userA, $2 userB (userA < userB)
export const findPairQuery = `SELECT "conversationId" FROM conversation_pairs WHERE "userA" = $1 AND "userB" = $2`;

export const createConversationQuery = `INSERT INTO conversations DEFAULT VALUES RETURNING "conversationId"`;

// Returns no row when another request created the pair first.
export const createPairQuery = `INSERT INTO conversation_pairs ("userA", "userB", "conversationId")
  VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING "conversationId"`;

export const addMembersQuery = `INSERT INTO conversation_members ("conversationId", "userId")
  VALUES ($1, $2), ($1, $3)`;

// $1 conversationId, $2 userId -> { exists, member }
export const membershipQuery = `SELECT
  EXISTS (SELECT 1 FROM conversations WHERE "conversationId" = $1) AS exists,
  EXISTS (SELECT 1 FROM conversation_members WHERE "conversationId" = $1 AND "userId" = $2) AS member`;

// Inbox for $1, newest activity first.
export const listConversationsQuery = `SELECT C."conversationId", C."lastMessageAt",
  json_build_object('userId', U."userId", 'name', U.name, 'profileImage', U."profileImage") AS other,
  LM.last AS "lastMessage",
  (SELECT COUNT(*)::int FROM messages M
     WHERE M."conversationId" = C."conversationId" AND M."senderId" <> $1
       AND (ME."lastReadAt" IS NULL OR M."createdAt" > ME."lastReadAt")) AS "unreadCount"
  FROM conversation_members ME
  JOIN conversations C ON C."conversationId" = ME."conversationId"
  JOIN conversation_members OM ON OM."conversationId" = C."conversationId" AND OM."userId" <> $1
  JOIN users U ON U."userId" = OM."userId"
  LEFT JOIN LATERAL (
    SELECT json_build_object('body', LEFT(M.body, 120), 'senderId', M."senderId",
      'createdAt', ${isoUtc('M."createdAt"')}) AS last
    FROM messages M WHERE M."conversationId" = C."conversationId"
    ORDER BY M."createdAt" DESC, M."messageId" DESC LIMIT 1
  ) LM ON true
  WHERE ME."userId" = $1
  ORDER BY C."lastMessageAt" DESC, C."conversationId" DESC
  LIMIT 200`;

// Number of conversations with at least one unread message for $1.
export const unreadConversationsQuery = `SELECT COUNT(*)::int AS count
  FROM conversation_members ME
  WHERE ME."userId" = $1 AND EXISTS (
    SELECT 1 FROM messages M
    WHERE M."conversationId" = ME."conversationId" AND M."senderId" <> $1
      AND (ME."lastReadAt" IS NULL OR M."createdAt" > ME."lastReadAt"))`;

// $1 conversationId, $2 messageId -> whether the cursor is in this conversation.
export const cursorQuery = `SELECT 1 FROM messages
  WHERE "conversationId" = $1 AND "messageId" = $2`;

// Thread pages. $1 conversationId, $2 limit (+1), $3 cursor messageId.
// The cursor's timestamp is read in SQL so its microseconds survive (a JS Date
// would round them to milliseconds).
const CURSOR = `(SELECT "createdAt", "messageId" FROM messages WHERE "messageId" = $3::uuid)`;
export const latestMessagesQuery = `SELECT ${MESSAGE_COLUMNS} FROM messages
  WHERE "conversationId" = $1
  ORDER BY "createdAt" DESC, "messageId" DESC LIMIT $2`;

export const messagesBeforeQuery = `SELECT ${MESSAGE_COLUMNS} FROM messages
  WHERE "conversationId" = $1 AND ("createdAt", "messageId") < ${CURSOR}
  ORDER BY "createdAt" DESC, "messageId" DESC LIMIT $2`;

export const messagesAfterQuery = `SELECT ${MESSAGE_COLUMNS} FROM messages
  WHERE "conversationId" = $1 AND ("createdAt", "messageId") > ${CURSOR}
  ORDER BY "createdAt" ASC, "messageId" ASC LIMIT $2`;

// clock_timestamp() so messages sent in quick succession keep their order.
export const createMessageQuery = `INSERT INTO messages ("conversationId", "senderId", body, "createdAt")
  VALUES ($1, $2, $3, clock_timestamp()) RETURNING ${MESSAGE_COLUMNS}`;

export const touchConversationQuery = `UPDATE conversations SET "lastMessageAt" = GREATEST("lastMessageAt", $2)
  WHERE "conversationId" = $1`;

// The sender has read everything up to their own message.
export const markReadUpToQuery = `UPDATE conversation_members
  SET "lastReadAt" = GREATEST(COALESCE("lastReadAt", $3), $3)
  WHERE "conversationId" = $1 AND "userId" = $2`;

export const markReadQuery = `UPDATE conversation_members
  SET "lastReadAt" = GREATEST(COALESCE("lastReadAt", clock_timestamp()), clock_timestamp())
  WHERE "conversationId" = $1 AND "userId" = $2`;
