import { fetchTarget, closeBrowser, resetBrowserContext, } from "./campaignFetcher.js";
import { parseCampaigns } from "./campaignParser.js";
import { loadState, saveState, compareCampaigns } from "../utils/stateManager.js";
import { logEvent } from "../utils/eventLogger.js";
import {
  notifyNewCampaign,
  notifyRemovedCampaign,
  notifyCampaignUpdate,
  notifySlotOpened,
  notifyError,
  notifySessionExpired,
  notifyReauthenticated,
} from "./notificationService.js";

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
let extraBackoffUntil = 0;

let authenticationRecoveryActive = false;
let authenticationNotificationSent = false;

export function getStatus() {
  return { ...status, campaigns: status.campaigns };
}

export async function runCheck() {
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
  console.log(`[INFO] Target: ${targetUrl}`);

  const result = await fetchTarget(targetUrl);

  if (
  authenticationRecoveryActive &&
  result.ok
  ) {
  authenticationRecoveryActive = false;
  authenticationNotificationSent = false;

  console.log("[AUTH] Authentication restored.");

  await notifyReauthenticated();
  }

  if (!result.ok) {
    await handleFetchFailure(result);
    status.checking = false;
    return status;
  }

  console.log(`[INFO] Fetch successful`);
  console.log(`[INFO] Content type: ${result.contentType}`);

  if (typeof result.body === "string") {
    const bodyLower = result.body.toLowerCase();
    const loginIndicators = [
      "log in",
      "login",
      "sign in",
      "sign up",
      "create an account",
    ];

    const looksLikeLoginPage = loginIndicators.some((text) =>
      bodyLower.includes(text)
    );

    console.log(
      `[INFO] Possible login page detected: ${looksLikeLoginPage ? "YES" : "NO"}`
    );
  }

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
    console.log(`[${time}] First run — saving baseline, no notifications sent.`);
    await saveState(currentCampaigns);
    status.isFirstRun = false;
  } else {
    status.isFirstRun = false;

    const { newCampaigns, removedCampaigns, changes } = compareCampaigns(
      previousState.campaigns,
      currentCampaigns
    );

    if (
      newCampaigns.length === 0 &&
      removedCampaigns.length === 0 &&
      changes.length === 0
    ) {
      console.log(`[${time}] No changes detected`);
    }

    for (const campaign of newCampaigns) {
      console.log(
        `\n🚨 NEW CAMPAIGN\nTitle: ${campaign.title}\nURL: ${campaign.url}\n`
      );

      await logEvent("NEW_CAMPAIGN", {
        campaign: campaign.title,
        url: campaign.url,
      });

      await notifyNewCampaign(campaign);
    }

    for (const campaign of removedCampaigns) {
      console.log(`\n❌ CAMPAIGN REMOVED\nTitle: ${campaign.title}\n`);

      await logEvent("REMOVED_CAMPAIGN", {
        campaign: campaign.title,
        url: campaign.url,
      });

      await notifyRemovedCampaign(campaign);
    }

    for (const change of changes) {
      const {
        campaign,
        previous,
        changedFields,
      } = change;

      console.log(`\n🔄 CAMPAIGN UPDATED`);
      console.log(`Title: ${campaign.title}`);

      for (const field of changedFields) {
        console.log(
          `${field.field}: ${field.previous} -> ${field.current}`
        );
      }

      const slotOpened =
        previous.remaining === 0 &&
        campaign.remaining > 0;

      await logEvent("CAMPAIGN_UPDATED", {
        campaign: campaign.title,
        url: campaign.url,
        changes: changedFields,
      });

      if (slotOpened) {
        await notifySlotOpened(campaign);
      } else {
        await notifyCampaignUpdate(
          campaign,
          previous,
          changedFields
        );
      }
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

  if (result.reason === "AUTH_FILE_MISSING") {
    console.error("[AUTH] No saved authentication session found.");
    console.error("[AUTH] Run: node scripts/login.js");
  }

  if (result.reason === "LOGIN_REQUIRED") {
  console.error("[AUTH] Your saved login session has expired.");

  await resetBrowserContext();

  if (!authenticationNotificationSent) {
    authenticationNotificationSent = true;
    authenticationRecoveryActive = true;

    await notifySessionExpired();

    console.error(
      "[AUTH] Run: node scripts/login.js to authenticate again."
    );
  }
}

  if (result.reason === "RATE_LIMITED") {
    console.error(`[ERROR] HTTP status: 429 — backing off for ${result.retryAfterMs}ms`);
    extraBackoffUntil = Date.now() + result.retryAfterMs;
  }
  await logEvent("ERROR", {
    message: `Fetch failed: ${result.reason}`
  });
  if (status.consecutiveErrors === 1 || status.consecutiveErrors % 10 === 0) {
    await notifyError(
      `Failed to reach target (${result.reason}). This is failure #${status.consecutiveErrors} in a row.`
    );
  }
}

export function startWatching() {
  if (status.running) {
    console.log("[INFO] Watcher is already running.");
    return status;
  }

  const intervalMs = Number(process.env.CHECK_INTERVAL) || 30000;

  status.running = true;

  console.log(
    `[INFO] Watcher started. Checking every ${intervalMs / 1000}s.`
  );

  runCheck();

  status.nextCheckAt = new Date(
    Date.now() + intervalMs
  ).toISOString();

  intervalHandle = setInterval(() => {
    runCheck();

    status.nextCheckAt = new Date(
      Date.now() + intervalMs
    ).toISOString();
  }, intervalMs);

  return status;
}

export async function stopWatching() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }

  status.running = false;
  status.nextCheckAt = null;

  await closeBrowser();

  console.log("[INFO] Watcher stopped.");
  return status;
}
