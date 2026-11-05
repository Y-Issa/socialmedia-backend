import pool from "../../db.js";
import {
  addMembersQuery,
  createConversationQuery,
  createMessageQuery,
  createPairQuery,
  cursorQuery,
  findPairQuery,
  latestMessagesQuery,
  listConversationsQuery,
  markReadQuery,
  markReadUpToQuery,
  membershipQuery,
  messagesAfterQuery,
  messagesBeforeQuery,
  touchConversationQuery,
  unreadConversationsQuery,
  userExistsQuery,
} from "../queries/messages.js";
import { cleanString, isUuid } from "../utils/validate.js";

export const MESSAGE_MAX_LENGTH = 2000;
const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

// Sends 404 / 403 and returns false unless the requester is in the conversation.
async function checkMember(res, conversationId, userId, db = pool) {
  const { rows } = await db.query(membershipQuery, [conversationId, userId]);
  if (!rows[0].exists) {
    res.status(404).send("Conversation not found");
    return false;
  }
  if (!rows[0].member) {
    res.status(403).send("You are not in this conversation");
    return false;
  }
  return true;
}

// POST /api/messages/conversations { userId }
// -> 200 (already existed) / 201 (created) { conversationId }
export async function getOrCreateConversation(req, res) {
  const me = req.userInfo.id;
  const otherId = req.body?.userId;

  if (!isUuid(otherId)) {
    return res.status(400).send("Invalid user id");
  }
  if (otherId.toLowerCase() === me.toLowerCase()) {
    return res.status(400).send("You can't message yourself");
  }

  // Canonical order matches the uuid comparison in conversation_pairs' CHECK.
  const [userA, userB] = [me.toLowerCase(), otherId.toLowerCase()].sort();
  const client = await pool.connect();
  try {
    const user = await client.query(userExistsQuery, [otherId]);
    if (user.rowCount === 0) {
      return res.status(404).send("User not found");
    }

    const existing = await client.query(findPairQuery, [userA, userB]);
    if (existing.rowCount > 0) {
      return res.status(200).json({ conversationId: existing.rows[0].conversationId });
    }

    await client.query("BEGIN");
    const created = await client.query(createConversationQuery);
    const { conversationId } = created.rows[0];
    const pair = await client.query(createPairQuery, [userA, userB, conversationId]);
    if (pair.rowCount === 0) {
      // A concurrent request created this pair's conversation first: use it.
      await client.query("ROLLBACK");
      const winner = await client.query(findPairQuery, [userA, userB]);
      return res.status(200).json({ conversationId: winner.rows[0].conversationId });
    }
    await client.query(addMembersQuery, [conversationId, me, otherId]);
    await client.query("COMMIT");
    res.status(201).json({ conversationId });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("getOrCreateConversation:", error);
    res.status(500).send("Server error");
  } finally {
    client.release();
  }
}

// GET /api/messages/conversations
// -> [{ conversationId, other, lastMessage, unreadCount, lastMessageAt }], newest first
export async function getConversations(req, res) {
  try {
    const result = await pool.query(listConversationsQuery, [req.userInfo.id]);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("getConversations:", error);
    res.status(500).send("Server error");
  }
}

// GET /api/messages/unread-count -> { count } (conversations with unread messages)
export async function getUnreadCount(req, res) {
  try {
    const result = await pool.query(unreadConversationsQuery, [req.userInfo.id]);
    res.status(200).json({ count: result.rows[0].count });
  } catch (error) {
    console.error("getMessagesUnreadCount:", error);
    res.status(500).send("Server error");
  }
}

// GET /api/messages/conversations/:id/messages?before=|after=<messageId>&limit=
// -> { items (oldest -> newest), hasMore }
// No cursor: the latest page (hasMore = older messages exist).
// before: the page just older than the cursor (hasMore = even older exist).
// after: messages newer than the cursor (hasMore = more than limit are newer).
export async function getMessages(req, res) {
  const conversationId = req.params.id;
  const { before, after } = req.query;

  let limit = DEFAULT_LIMIT;
  if (req.query.limit !== undefined) {
    limit = Number(req.query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      return res.status(400).send(`Limit must be between 1 and ${MAX_LIMIT}`);
    }
  }
  if (before !== undefined && after !== undefined) {
    return res.status(400).send("Use either before or after, not both");
  }
  const cursorId = before ?? after;
  if (cursorId !== undefined && !isUuid(cursorId)) {
    return res.status(400).send("Invalid cursor");
  }

  try {
    if (!(await checkMember(res, conversationId, req.userInfo.id))) return;

    let rows;
    if (cursorId === undefined) {
      ({ rows } = await pool.query(latestMessagesQuery, [conversationId, limit + 1]));
    } else {
      const cursor = await pool.query(cursorQuery, [conversationId, cursorId]);
      if (cursor.rowCount === 0) {
        return res.status(400).send("Invalid cursor");
      }
      const query = before !== undefined ? messagesBeforeQuery : messagesAfterQuery;
      ({ rows } = await pool.query(query, [conversationId, limit + 1, cursorId]));
    }

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);
    if (after === undefined) items.reverse();
    res.status(200).json({ items, hasMore });
  } catch (error) {
    console.error("getMessages:", error);
    res.status(500).send("Server error");
  }
}

// POST /api/messages/conversations/:id/messages { body } -> 201 message
export async function sendMessage(req, res) {
  const conversationId = req.params.id;
  const me = req.userInfo.id;
  const body = cleanString(req.body?.body);

  if (!body) {
    return res.status(400).send("Message can't be empty");
  }
  if (body.length > MESSAGE_MAX_LENGTH) {
    return res
      .status(400)
      .send(`Message is too long (max ${MESSAGE_MAX_LENGTH} characters)`);
  }

  const client = await pool.connect();
  try {
    if (!(await checkMember(res, conversationId, me, client))) return;

    await client.query("BEGIN");
    const result = await client.query(createMessageQuery, [conversationId, me, body]);
    const message = result.rows[0];
    await client.query(touchConversationQuery, [conversationId, message.createdAt]);
    await client.query(markReadUpToQuery, [conversationId, me, message.createdAt]);
    await client.query("COMMIT");
    res.status(201).json(message);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("sendMessage:", error);
    res.status(500).send("Server error");
  } finally {
    client.release();
  }
}

// POST /api/messages/conversations/:id/read -> 204
export async function markConversationRead(req, res) {
  const conversationId = req.params.id;
  try {
    if (!(await checkMember(res, conversationId, req.userInfo.id))) return;
    await pool.query(markReadQuery, [conversationId, req.userInfo.id]);
    res.status(204).send();
  } catch (error) {
    console.error("markConversationRead:", error);
    res.status(500).send("Server error");
  }
}
