import pool from "../../db.js";

// Runs a notification insert/delete. Notifications are a side effect: a
// failure is logged but never fails the like / comment / follow / join
// that triggered it.
export async function notify(query, params) {
  try {
    await pool.query(query, params);
  } catch (error) {
    console.error("notify:", error);
  }
}
