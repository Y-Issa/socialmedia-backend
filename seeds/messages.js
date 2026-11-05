// Seeds demo direct-message conversations (see migrations/005_messages.sql).
//
//   await seedMessages(client, users)
//
// `client` is a connected pg client (inside the seed's transaction) and
// `users` maps seed keys (test, sara, omar, lina, james, mona) to userIds.
// Returns the number of messages inserted.

// Each message: [sender key, minutes ago, body]. `read` lists who has read
// the whole conversation; anyone else has read up to their own last message.
const CONVERSATIONS = [
  {
    members: ["test", "sara"],
    read: ["test", "sara"],
    messages: [
      ["sara", 26 * 60, "Hey! Loved your city lights post. Where was that taken?"],
      ["test", 26 * 60 - 12, "Thanks! It's from the rooftop near Tahrir, right after sunset."],
      ["sara", 26 * 60 - 15, "So pretty. I'm in Cairo next weekend, any coffee spots you'd recommend?"],
      ["test", 3 * 60, "Definitely try the little place on Champollion street. Great flat whites."],
      ["test", 3 * 60 - 1, "And they have a good book corner too, you'd like it."],
      ["sara", 2 * 60, "Perfect, adding it to the list. See you at Book Club Thursday?"],
    ],
  },
  {
    members: ["test", "omar"],
    read: ["omar"],
    messages: [
      ["test", 5 * 60, "Your golden hour shot is unreal. What lens did you use?"],
      ["omar", 40, "A 24-70 at 35mm, f/8. Happy to show you the edit sometime!"],
    ],
  },
  {
    members: ["sara", "lina"],
    read: ["sara", "lina"],
    messages: [
      ["lina", 30 * 60, "Did you finish The Midnight Library yet?"],
      ["sara", 29 * 60, "Two chapters left! No spoilers please 😄"],
      ["lina", 29 * 60 - 5, "My lips are sealed. Let's discuss on Thursday."],
    ],
  },
];

export async function seedMessages(client, users) {
  // One clock for the whole run so read markers line up with message times.
  const now = Date.now();
  const ago = (minutes) => new Date(now - minutes * 60 * 1000);
  let count = 0;

  for (const convo of CONVERSATIONS) {
    const [a, b] = convo.members.map((key) => users[key]);
    const [userA, userB] = [a, b].sort();
    const last = convo.messages[convo.messages.length - 1];
    const first = convo.messages[0];

    const { rows } = await client.query(
      `INSERT INTO conversations ("createdAt", "lastMessageAt") VALUES ($1, $2) RETURNING "conversationId"`,
      [ago(first[1] + 1), ago(last[1])]
    );
    const { conversationId } = rows[0];

    await client.query(
      `INSERT INTO conversation_pairs ("userA", "userB", "conversationId") VALUES ($1, $2, $3)`,
      [userA, userB, conversationId]
    );

    for (const key of convo.members) {
      let lastReadAt = null;
      if (convo.read.includes(key)) {
        lastReadAt = ago(last[1]);
      } else {
        const own = convo.messages.filter(([sender]) => sender === key).pop();
        lastReadAt = own ? ago(own[1]) : null;
      }
      await client.query(
        `INSERT INTO conversation_members ("conversationId", "userId", "lastReadAt") VALUES ($1, $2, $3)`,
        [conversationId, users[key], lastReadAt]
      );
    }

    for (const [sender, minutes, body] of convo.messages) {
      await client.query(
        `INSERT INTO messages ("conversationId", "senderId", body, "createdAt") VALUES ($1, $2, $3, $4)`,
        [conversationId, users[sender], body, ago(minutes)]
      );
      count++;
    }
  }

  return count;
}
