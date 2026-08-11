// utils/stateManager.js
//
// Responsible for ONE thing: remembering what campaigns we saw last time.
// This is what lets the app survive a restart without treating every
// campaign as "new" again.

import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";

const STATE_FILE = path.join(process.cwd(), "data", "state.json");

// The shape of an "empty" state, used the very first time the app runs
// (before data/state.json exists).
const EMPTY_STATE = {
  campaigns: [],
  lastChecked: null,
};

/**
 * Load the previously saved campaign state from disk.
 * If the file doesn't exist yet (first run), return an empty state
 * instead of throwing an error.
 */
export async function loadState() {
  try {
    const raw = await readFile(STATE_FILE, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") {
      // File simply doesn't exist yet — that's fine, this is the first run.
      return { ...EMPTY_STATE };
    }
    // Any other error (e.g. corrupted JSON) — log it and fall back safely
    // rather than crashing the whole app.
    console.error("[ERROR] Failed to read state.json, starting fresh:", err.message);
    return { ...EMPTY_STATE };
  }
}

/**
 * Save the current campaign list to disk, along with a timestamp.
 * Creates the /data folder if it doesn't exist yet.
 */
export async function saveState(campaigns) {
  const state = {
    campaigns,
    lastChecked: new Date().toISOString(),
  };

  try {
    await mkdir(path.dirname(STATE_FILE), { recursive: true });
    await writeFile(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
  } catch (err) {
    console.error("[ERROR] Failed to save state.json:", err.message);
  }

  return state;
}

/**
 * Compare the previous campaign list with the current one.
 * Returns an object describing what changed:
 *   { newCampaigns, removedCampaigns, statusChanges }
 *
 * Campaigns are matched by their `id`. This function does NOT care
 * where the campaigns came from (API or HTML) — it just works on the
 * normalized { id, title, url, status } shape.
 */
export function compareCampaigns(previousCampaigns, currentCampaigns) {
  const previousById = new Map(previousCampaigns.map((c) => [c.id, c]));
  const currentById = new Map(currentCampaigns.map((c) => [c.id, c]));

  const newCampaigns = [];
  const removedCampaigns = [];
  const statusChanges = [];

  // Anything in "current" that wasn't in "previous" is new,
  // or has a status that differs from before.
  for (const campaign of currentCampaigns) {
    const previous = previousById.get(campaign.id);

    if (!previous) {
      newCampaigns.push(campaign);
    } else if (previous.status !== campaign.status) {
      statusChanges.push({
        campaign,
        previousStatus: previous.status,
        currentStatus: campaign.status,
      });
    }
  }

  // Anything in "previous" that's no longer in "current" was removed.
  for (const campaign of previousCampaigns) {
    if (!currentById.has(campaign.id)) {
      removedCampaigns.push(campaign);
    }
  }

  return { newCampaigns, removedCampaigns, statusChanges };
}
