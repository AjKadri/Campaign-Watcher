// services/watcher.js
//
// The orchestrator. This is the only file that knows the full sequence:
//   fetch -> parse -> compare -> notify -> save state
//
// It also holds the watcher's live status (running/checking/error) in
// memory, which routes/api.js reads to answer GET /api/status.

import { fetchTarget } from "./campaignFetcher.js";
import { parseCampaigns } from "./campaignParser.js";
import { loadState, saveState, compareCampaigns } from "../utils/stateManager.js";
import { logEvent } from "../utils/eventLogger.js";
import {
  notifyNewCampaign,
  notifyRemovedCampaign,
  notifyStatusChange,
  notifyError,
} from "./notificationService.js";

// --- In-memory status, read by the dashboard/API ---
// (The campaign list itself is also persisted to disk via stateManager,
// this is just a fast in-memory mirror for the dashboard.)
const status = {
  running: false,
  checking: false,
  campaigns: [],
  campaignCount: 0,
  lastChecked: null,
  nextCheckAt: null,
  consecutiveErrors: 0,
  lastError: null,
  isFirstRun: true,
};

let intervalHandle = null;
let extraBackoffUntil = 0; // used when we get a 429 with Retry-After

export function getStatus() {
  return { ...status, campaigns: status.campaigns }; // shallow copy is enough here
}

/**
 * Perform a single check: fetch, parse, compare, notify, persist.
 * Safe to call directly (e.g. from the "Check Now" button) even if
 * the interval loop isn't running.
 */
export async function runCheck() {
  // Guard against overlapping checks (e.g. a slow request plus a
  // manual "Check Now" click at the same time).
  if (status.checking) {
    console.log("[INFO] Check already in progress, skipping this trigger.");
    return status;
  }

  if (Date.now() < extraBackoffUntil) {
    console.log("[INFO] Still backing off after a rate limit, skipping this check.");
    return status;
  }

  status.checking = true;
  const targetUrl = process.env.TARGET_URL;
  const time = new Date().toLocaleTimeString("en-US", { hour12: false });
  console.log(`\n[${time}] Checking campaigns...`);

  const result = await fetchTarget(targetUrl);

  if (!result.ok) {
    await handleFetchFailure(result);
    status.checking = false;
    return status;
  }

  // Fetch succeeded — reset error tracking.
  status.consecutiveErrors = 0;
  status.lastError = null;

  let currentCampaigns;
  try {
    currentCampaigns = parseCampaigns(result.contentType, result.body);
  } catch (err) {
    console.error("[ERROR] Failed to parse campaigns:", err.message);
    await logEvent("ERROR", { message: `Parse failure: ${err.message}` });
    status.checking = false;
    return status;
  }

  console.log(`[${time}] Found ${currentCampaigns.length} campaigns`);

  const previousState = await loadState();

  if (status.isFirstRun && previousState.campaigns.length === 0) {
    // Very first run ever: just record the baseline, no notifications.
    // This prevents a flood of "new campaign" alerts on first startup.
    console.log(`[${time}] First run — saving baseline, no notifications sent.`);
    await saveState(currentCampaigns);
    status.isFirstRun = false;
  } else {
    status.isFirstRun = false;
    const { newCampaigns, removedCampaigns, statusChanges } = compareCampaigns(
      previousState.campaigns,
      currentCampaigns
    );

    if (newCampaigns.length === 0 && removedCampaigns.length === 0 && statusChanges.length === 0) {
      console.log(`[${time}] No changes detected`);
    }

    for (const campaign of newCampaigns) {
      console.log(`\n🚨 NEW CAMPAIGN\nTitle: ${campaign.title}\nURL: ${campaign.url}\n`);
      await logEvent("NEW_CAMPAIGN", { campaign: campaign.title, url: campaign.url });
      await notifyNewCampaign(campaign);
    }

    for (const campaign of removedCampaigns) {
      console.log(`\n❌ CAMPAIGN REMOVED\nTitle: ${campaign.title}\n`);
      await logEvent("REMOVED_CAMPAIGN", { campaign: campaign.title, url: campaign.url });
      await notifyRemovedCampaign(campaign);
    }

    for (const { campaign, previousStatus, currentStatus } of statusChanges) {
      console.log(`\n🔄 STATUS CHANGED\nTitle: ${campaign.title}\n${previousStatus} -> ${currentStatus}\n`);
      await logEvent("STATUS_CHANGED", {
        campaign: campaign.title,
        url: campaign.url,
        previousStatus,
        currentStatus,
      });
      await notifyStatusChange(campaign, previousStatus, currentStatus);
    }

    await saveState(currentCampaigns);
  }

  status.campaigns = currentCampaigns;
  status.campaignCount = currentCampaigns.length;
  status.lastChecked = new Date().toISOString();
  status.checking = false;

  return status;
}

async function handleFetchFailure(result) {
  status.consecutiveErrors += 1;
  status.lastError = result.reason;

  console.error(`[ERROR] Failed to fetch campaigns (${result.reason})`);

  if (result.reason === "RATE_LIMITED") {
    console.error(`[ERROR] HTTP status: 429 — backing off for ${result.retryAfterMs}ms`);
    extraBackoffUntil = Date.now() + result.retryAfterMs;
  }

  await logEvent("ERROR", { message: `Fetch failed: ${result.reason}` });

  // Don't spam a notification on every single failed check — only alert
  // on the FIRST failure in a streak, and then again every 10th failure
  // as a "still down" reminder. This avoids flooding Telegram if the
  // target site has an extended outage.
  if (status.consecutiveErrors === 1 || status.consecutiveErrors % 10 === 0) {
    await notifyError(
      `Failed to reach target (${result.reason}). This is failure #${status.consecutiveErrors} in a row.`
    );
  }
}

/**
 * Start the recurring check loop. Does nothing if already running,
 * so it's safe to call multiple times (e.g. from the dashboard button).
 */
export function startWatching() {
  if (status.running) {
    console.log("[INFO] Watcher is already running.");
    return status;
  }

  const intervalMs = Number(process.env.CHECK_INTERVAL) || 10000;

  status.running = true;
  console.log(`[INFO] Watcher started. Checking every ${intervalMs / 1000}s.`);

  // Run one check immediately, then on the interval.
  runCheck();
  status.nextCheckAt = new Date(Date.now() + intervalMs).toISOString();

  intervalHandle = setInterval(() => {
    runCheck();
    status.nextCheckAt = new Date(Date.now() + intervalMs).toISOString();
  }, intervalMs);

  return status;
}

export function stopWatching() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  status.running = false;
  status.nextCheckAt = null;
  console.log("[INFO] Watcher stopped.");
  return status;
}
