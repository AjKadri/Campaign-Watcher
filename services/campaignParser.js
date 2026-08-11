// services/campaignParser.js
//
// Turns a raw response body (JSON or HTML) into a NORMALIZED array of
// campaign objects:
//
//   { id, title, url, status, timestamp, meta }
//
// Everything downstream (comparison, notifications, dashboard) only ever
// deals with this normalized shape — it never knows or cares whether the
// data came from an API or scraped HTML.
//
// >>> THIS IS THE FILE YOU'LL EDIT to match your friend's real site. <<<
// Look for the "CUSTOMIZE HERE" comments below.

import * as cheerio from "cheerio";

/**
 * Entry point: decides whether to parse as JSON or HTML based on the
 * content-type header, then delegates to the right parser.
 */
export function parseCampaigns(contentType, body) {
  if (contentType.includes("application/json")) {
    return parseFromJson(body);
  }
  return parseFromHtml(body);
}

/**
 * --- OPTION B: HTML SCRAPING (fallback) ---
 *
 * Used when the target doesn't expose a JSON API and we have to read
 * campaign info directly out of the rendered HTML using CSS selectors.
 *
 * CUSTOMIZE HERE: the selectors below (".campaign-card", ".title", etc.)
 * are PLACEHOLDERS. Open the real page, inspect its HTML, and replace
 * these with the actual selectors that wrap each campaign.
 */
function parseFromHtml(body) {
  const $ = cheerio.load(body);
  const campaigns = [];

  // PLACEHOLDER SELECTOR — replace ".campaign-card" with whatever
  // element actually wraps one campaign on the real page.
  $("article").each((_, el) => {
    const $el = $(el);

    const title = $el.find("h3").first().text().trim();
    const relativeUrl = $el.find('a[aria-label^="Open"]').first().attr("href") || "";
    const status = $el.find("span").map((i, el) => $(el).first().text().trim().toLowerCase() || "unknown").get();

    if (!title) return; // skip anything that didn't actually match

    campaigns.push({
      id: relativeUrl || title, // prefer URL as a stable id; falls back to title
      title,
      url: relativeUrl,
      status,
      timestamp: null,
      meta: {},
    });
  });

  if (campaigns.length === 0) {
    console.warn(
      "[WARN] HTML parser found 0 campaigns. The selectors in " +
        "services/campaignParser.js probably need to be updated for this site."
    );
  }

  return campaigns;
}
