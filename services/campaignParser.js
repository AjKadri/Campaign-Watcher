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

// /**
//  * --- OPTION A: API MONITORING ---
//  *
//  * If the target exposes a JSON API, this is where you map its fields
//  * onto our normalized shape. Right now this assumes a response like:
//  *
//  *   { "campaigns": [ { "id": "1", "name": "...", "url": "...", "status": "..." } ] }
//  *
//  * CUSTOMIZE HERE: adjust the field names below (e.g. item.name vs
//  * item.title, item.slug vs item.id) to match the real API response.
//  */
// function parseFromJson(body) {
//   let data;
//   try {
//     data = JSON.parse(body);
//   } catch (err) {
//     console.error("[ERROR] Invalid JSON response from target API:", err.message);
//     return [];
//   }

//   // Handle either a bare array or an object with a "campaigns" field —
//   // adjust this if the real API wraps data differently
//   // (e.g. data.results, data.data, etc.)
//   const items = Array.isArray(data) ? data : data.campaigns || [];

//   return items.map((item) => ({
//     id: String(item.id ?? item.slug ?? item.url), // fall back to url if no id
//     title: item.name ?? item.title ?? "Untitled campaign",
//     url: item.url ?? item.link ?? "",
//     status: item.status ?? "unknown",
//     timestamp: item.updatedAt ?? item.timestamp ?? null,
//     meta: item, // keep the original object around in case you need more fields later
//   }));
// }

/**
 * --- OPTION B: HTML SCRAPING ---
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
