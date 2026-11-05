// Seeds a few live stories (posted within the last few hours) for sara,
// omar and lina, using images that already exist in public/upload.
//
//   await seedStories(client, users)   // users: { test, sara, ... } -> userId

const STORIES = [
  { by: "sara", hoursAgo: 5, image: "1718914059518-3900252.jpg", caption: "Morning in the fields" },
  { by: "sara", hoursAgo: 2, image: "1719326677927-inspire-wallpaper-2560x1080_14.jpg", caption: null },
  { by: "omar", hoursAgo: 4, image: "1719265621433-9924042.jpg", caption: "Up before sunrise for this one" },
  { by: "omar", hoursAgo: 3, image: "1719062407749-2943466.jpg", caption: null },
  { by: "omar", hoursAgo: 1, image: "1719326481601-2943466.jpg", caption: "Back in the city" },
  { by: "lina", hoursAgo: 6, image: "1719268078300-lonely_tree_by_samuel_one_dea301s.png", caption: "Still standing" },
];

export async function seedStories(client, users) {
  for (const story of STORIES) {
    await client.query(
      `INSERT INTO stories ("userId", image, caption, "createdAt", "expiresAt")
       VALUES ($1, $2, $3,
               now() - make_interval(hours => $4),
               now() - make_interval(hours => $4) + INTERVAL '24 hours')`,
      [users[story.by], story.image, story.caption, story.hoursAgo]
    );
  }
}
