// Responsible for ONE thing: sending notifications. The watcher never
// talks to Telegram directly — it calls these functions. That means
// adding a second provider (email, Discord, etc.) later only means
// adding a function here, not touching watcher.js.

const TELEGRAM_API = "https://api.telegram.org";

function formatTime(date = new Date()) {
  return date.toLocaleTimeString("en-US", { hour12: false });
}

/**
 * Low-level: send a plain text message via the Telegram Bot API.
 * Returns true/false instead of throwing, so a failed notification
 * never crashes the watcher.
 */
async function sendTelegramMessage(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn("[WARN] Telegram not configured — skipping notification.");
    return false;
  }

  try {
    const response = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: false,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[ERROR] Telegram notification failed (${response.status}):`, errorBody);
      return false;
    }

    return true;
  } catch (err) {
    console.error("[ERROR] Telegram notification failed:", err.message);
    return false;
  }
}

export async function notifyNewCampaign(campaign) {
  const text =
    `🚨 NEW CAMPAIGN DETECTED\n\n` +
    `Name: ${campaign.title}\n` +
    `Status: ${campaign.status}\n\n` +
    `🔗 ${campaign.url}\n\n` +
    `Time detected:\n${formatTime()}`;

  return sendTelegramMessage(text);
}

export async function notifyRemovedCampaign(campaign) {
  const text =
    `❌ CAMPAIGN REMOVED\n\n` +
    `Name: ${campaign.title}\n` +
    `🔗 ${campaign.url}\n\n` +
    `Time detected:\n${formatTime()}`;

  return sendTelegramMessage(text);
}

export async function notifyStatusChange(campaign, previousStatus, currentStatus) {
  const text =
    `🔄 CAMPAIGN STATUS CHANGED\n\n` +
    `Name: ${campaign.title}\n\n` +
    `Previous: ${previousStatus}\n` +
    `Current: ${currentStatus}\n\n` +
    `🔗 ${campaign.url}\n\n` +
    `Time detected:\n${formatTime()}`;

  return sendTelegramMessage(text);
}

export async function notifyError(message) {
  const text = `⚠️ CAMPAIGN WATCHER ERROR\n\n${message}\n\nTime:\n${formatTime()}`;
  return sendTelegramMessage(text);
}