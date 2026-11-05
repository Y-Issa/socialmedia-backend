// Seeds a few group events (three upcoming, one past) with some RSVPs.
//
//   await seedEvents(client, users, groups)
//     users:  { test, sara, omar, lina, james, mona } -> userId
//     groups: { photo, dev, books } -> groupId

const EVENTS = [
  {
    group: "photo",
    by: "omar",
    title: "Golden hour photo walk",
    description:
      "An easy two-hour loop along the river. Bring any camera — phones welcome. We'll stop for coffee halfway.",
    location: "Riverside Park, north gate",
    daysFromNow: 3,
    hour: 16,
    hours: 2,
    rsvps: { omar: "going", sara: "going", lina: "interested" },
  },
  {
    group: "dev",
    by: "test",
    title: "Monthly meetup: shipping side projects",
    description:
      "Three short talks, then open demos. Show what you've built this month, finished or not.",
    location: "The Loft, 2nd floor",
    daysFromNow: 7,
    hour: 18,
    hours: 3,
    rsvps: { test: "going", james: "going", mona: "interested" },
  },
  {
    group: "books",
    by: "sara",
    title: "Book Club: The Remains of the Day",
    description: "We'll discuss the whole book. Spoilers expected.",
    location: "Corner Café",
    daysFromNow: 10,
    hour: 19,
    hours: null,
    rsvps: { sara: "going", lina: "going" },
  },
  {
    group: "photo",
    by: "omar",
    title: "Night photography basics",
    description: "Tripods, long exposures and a lot of standing still.",
    location: "Old harbour",
    daysFromNow: -6,
    hour: 20,
    hours: 2,
    rsvps: { omar: "going", test: "going", sara: "interested" },
  },
];

export async function seedEvents(client, users, groups) {
  for (const event of EVENTS) {
    const { rows } = await client.query(
      `INSERT INTO events ("groupId", "createdBy", title, description, location, "startsAt", "endsAt", "createdAt")
       VALUES ($1, $2, $3, $4, $5,
               date_trunc('day', now()) + make_interval(days => $6, hours => $7),
               CASE WHEN $8::int IS NULL THEN NULL
                    ELSE date_trunc('day', now()) + make_interval(days => $6, hours => $7 + $8::int) END,
               now() - INTERVAL '2 days')
       RETURNING "eventId"`,
      [
        groups[event.group],
        users[event.by],
        event.title,
        event.description,
        event.location,
        event.daysFromNow,
        event.hour,
        event.hours,
      ]
    );
    for (const [who, status] of Object.entries(event.rsvps)) {
      await client.query(
        `INSERT INTO event_rsvps ("eventId", "userId", status) VALUES ($1, $2, $3)`,
        [rows[0].eventId, users[who], status]
      );
    }
  }
}
