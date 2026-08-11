// utils/eventLogger.js
//
// Keeps a small rolling history of "things that happened" (new campaign,
// removed campaign, status change, error) so the dashboard can show a
// timeline. Capped at MAX_EVENTS so the file never grows forever.

import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";

const EVENTS_FILE = path.join(process.cwd(), "data", "events.json");
const MAX_EVENTS = 100;

async function readEvents() {
  try {
    const raw = await readFile(EVENTS_FILE, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    // Missing or corrupted file -> just start with an empty list.
    return [];
  }
}

/**
 * Add a new event to the top of the history and trim old ones.
 * type: "NEW_CAMPAIGN" | "REMOVED_CAMPAIGN" | "STATUS_CHANGED" | "ERROR"
 */
export async function logEvent(type, data = {}) {
  const events = await readEvents();

  const event = {
    type,
    timestamp: new Date().toISOString(),
    ...data,
  };

  // Newest first, so the dashboard doesn't have to reverse the array.
  events.unshift(event);

  const trimmed = events.slice(0, MAX_EVENTS);

  try {
    await mkdir(path.dirname(EVENTS_FILE), { recursive: true });
    await writeFile(EVENTS_FILE, JSON.stringify(trimmed, null, 2), "utf-8");
  } catch (err) {
    console.error("[ERROR] Failed to save events.json:", err.message);
  }

  return event;
}

/**
 * Get recent events, most recent first. Optionally limit the count.
 */
export async function getEvents(limit = MAX_EVENTS) {
  const events = await readEvents();
  return events.slice(0, limit);
}
