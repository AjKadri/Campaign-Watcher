// Responsible for ONE thing: sending notifications.
// The watcher never talks to Telegram directly.

const TELEGRAM_API = "https://api.telegram.org";

function formatTime(date = new Date()) {
  return date.toLocaleTimeString("en-US", { hour12: false });
}

function getCampaignUrl(campaign) {
  if (!campaign.url) {
    return process.env.TARGET_URL || "";
  }
  if (/^https?:\/\//i.test(campaign.url)) {
    return campaign.url;
  }
  try {
    return new URL(
      campaign.url,
      process.env.TARGET_URL
    ).href;
  } catch (err) {
    console.error(
      "[WARN] Could not build campaign URL:",
      err.message
    );
    return campaign.url;
  }
}

/**
 * Low-level Telegram sender.
 */
async function sendTelegramMessage(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn(
      "[WARN] Telegram not configured — skipping notification."
    );
    return false;
  }

  try {
    const response = await fetch(
      `${TELEGRAM_API}/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: "HTML",
          disable_web_page_preview: false,
        }),
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();

      console.error(
        `[ERROR] Telegram notification failed (${response.status}):`,
        errorBody
      );

      return false;
    }

    return true;
  } catch (err) {
    console.error(
      "[ERROR] Telegram notification failed:",
      err.message
    );

    return false;
  }
}

/**
 * New campaign detected.
 */
export async function notifyNewCampaign(campaign) {
  const text =
    `🚨 NEW CAMPAIGN\n\n` +
    `${campaign.title}\n\n` +
    `📊 Status: ${campaign.status}\n` +
    `🏷️ Type: ${campaign.type}\n` +
    `💰 Reward: $${Number(campaign.reward).toFixed(2)}\n` +
    `📈 Slots: ${campaign.remaining} available\n` +
    `👥 Filled: ${campaign.filled}/${campaign.capacity}\n` +
    `💵 Payment: ${campaign.paymentType}\n\n` +
    `🔗 ${getCampaignUrl(campaign)}\n\n` +
    `Detected: ${formatTime()}`;

  return sendTelegramMessage(text);
}

/**
 * Notify removed campaign.
 */
export async function notifyRemovedCampaign(campaign) {
  const text =
    `❌ CAMPAIGN REMOVED\n\n` +
    `${campaign.title}\n\n` +
    `📊 Last status: ${campaign.status}\n` +
    `💰 Reward: $${Number(campaign.reward).toFixed(2)}\n\n` +
    `🔗 ${getCampaignUrl(campaign)}\n\n` +
    `Detected: ${formatTime()}`;

  return sendTelegramMessage(text);
}

export async function notifyCampaignUpdate(
  campaign,
  previous,
  changedFields
) {
  const changes = changedFields
    .map((change) => {
      const fieldName = formatFieldName(change.field);

      return (
        `${fieldName}: ` +
        `${formatValue(change.previous)} → ` +
        `${formatValue(change.current)}`
      );
    })
    .join("\n");

  const text =
    `🔄 CAMPAIGN UPDATED\n\n` +
    `${campaign.title}\n\n` +
    `${changes}\n\n` +
    `📊 Status: ${campaign.status}\n` +
    `📈 Slots: ${campaign.remaining} available\n` +
    `👥 Filled: ${campaign.filled}/${campaign.capacity}\n` +
    `💰 Reward: $${Number(campaign.reward).toFixed(2)}\n` +
    `🏷️ Type: ${campaign.type}\n` +
    `💵 Payment: ${campaign.paymentType}\n\n` +
    `🔗 ${getCampaignUrl(campaign)}\n\n` +
    `Detected: ${formatTime()}`;

  return sendTelegramMessage(text);
}

/**
 * Special notification when a campaign goes from
 * zero available spots to one or more available spots.
 */
export async function notifySlotOpened(campaign) {
  const text =
    `🚨 SLOT AVAILABLE\n\n` +
    `${campaign.title}\n\n` +
    `A spot has just opened.\n\n` +
    `📈 Available: ${campaign.remaining}\n` +
    `👥 Filled: ${campaign.filled}/${campaign.capacity}\n` +
    `💰 Reward: $${Number(campaign.reward).toFixed(2)}\n` +
    `🏷️ Type: ${campaign.type}\n` +
    `💵 Payment: ${campaign.paymentType}\n\n` +
    `🔗 ${getCampaignUrl(campaign)}\n\n` +
    `Detected: ${formatTime()}`;

  return sendTelegramMessage(text);
}

/**
 * Watcher error notification.
 */
export async function notifyError(message) {
  const text =
    `⚠️ CAMPAIGN WATCHER ERROR\n\n` +
    `${message}\n\n` +
    `Time: ${formatTime()}`;

  return sendTelegramMessage(text);
}

/**
 * Convert internal field names into readable names.
 */
function formatFieldName(field) {
  const names = {
    type: "Type",
    status: "Status",
    filled: "Filled",
    capacity: "Capacity",
    remaining: "Available",
    reward: "Reward",
    paymentType: "Payment",
  };

  return names[field] || field;
}

/**
 * Format values for change messages.
 */
function formatValue(value) {
  if (value === null || value === undefined) {
    return "—";
  }

  if (typeof value === "number") {
    return value.toString();
  }

  return String(value);
}

// Escape HTML special characters to prevent Telegram from misinterpreting them.
function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}