import * as cheerio from "cheerio";

export function parseCampaigns(contentType, body) {
  if (contentType.includes("application/json")) {
    return parseFromJson(body);
  }

  return parseFromHtml(body);
}

function parseFromJson(body) {
  let data;

  try {
    data = JSON.parse(body);
  } catch (err) {
    console.error("[ERROR] Invalid JSON response:", err.message);
    return [];
  }

  const items = Array.isArray(data)
    ? data
    : data.campaigns || data.data || data.results || [];

  return items.map((item) => ({
    id: String(item.id ?? item.slug ?? item.url),
    title: item.name ?? item.title ?? "Untitled campaign",
    url: item.url ?? item.link ?? "",
    type: item.type ?? "unknown",
    status: item.status ?? "unknown",
    filled: item.filled ?? null,
    capacity: item.capacity ?? item.total ?? null,
    remaining: item.remaining ?? null,
    reward: item.reward ?? null,
    paymentType: item.paymentType ?? null,
    timestamp: item.updatedAt ?? item.timestamp ?? null,
    meta: item
  }));
}

function parseFromHtml(body) {
  const $ = cheerio.load(body);
  const campaigns = [];

  $("article").each((_, el) => {
    const $el = $(el);

    const title = $el.find("h3").first().text().trim();

    if (!title) {
      return;
    }

    const relativeUrl =
      $el.find('a[aria-label^="Open"]').first().attr("href") || "";

    const texts = $el
      .find("span")
      .map((_, span) => {
        return $(span)
          .text()
          .replace(/\s+/g, " ")
          .trim();
      })
      .get()
      .filter(Boolean);

    const uniqueTexts = [...new Set(texts)];

    const type =
      uniqueTexts.find((text) =>
        /^(direct submission|application required)$/i.test(text)
      ) || "unknown";

    const status =
      uniqueTexts.find((text) =>
        /^(live|closed|paused|upcoming|ended|draft|full)$/i.test(text)
      ) || "unknown";

    const filledText =
      uniqueTexts.find((text) =>
        /^\d+\s*\/\s*\d+\s*filled$/i.test(text)
      ) || null;

    const remainingText =
      uniqueTexts.find((text) =>
        /^\d+\s*left$/i.test(text)
      ) || null;

    const rewardText =
      uniqueTexts.find((text) =>
        /^\$\d+(?:\.\d+)?$/i.test(text)
      ) || null;

    const paymentType =
      uniqueTexts.find((text) =>
        /^per\s+/i.test(text)
      ) || null;

    const filledMatch = filledText?.match(
      /^(\d+)\s*\/\s*(\d+)\s*filled$/i
    );

    const remainingMatch = remainingText?.match(
      /^(\d+)\s*left$/i
    );

    const filled = filledMatch
      ? Number(filledMatch[1])
      : null;

    const capacity = filledMatch
      ? Number(filledMatch[2])
      : null;

    const remaining = remainingMatch
      ? Number(remainingMatch[1])
      : null;

    const reward = rewardText
      ? Number(rewardText.replace("$", ""))
      : null;

    campaigns.push({
      id: relativeUrl || title,
      title,
      url: relativeUrl,
      type: type.toLowerCase(),
      status: status.toLowerCase(),
      filled,
      capacity,
      remaining,
      reward,
      paymentType,
      timestamp: null,
      meta: {
        rawTexts: uniqueTexts
      }
    });
  });

  if (campaigns.length === 0) {
    console.warn(
      "[WARN] HTML parser found 0 campaigns. Check the selectors in services/campaignParser.js."
    );
  }

  return campaigns;
}