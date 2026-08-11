const REQUEST_TIMEOUT = Number(process.env.REQUEST_TIMEOUT) || 10000;

/**
 * Fetch the target URL with a timeout and basic error classification.
 * Returns a result object instead of throwing, so callers don't need
 * try/catch everywhere — one predictable shape either way.
 */
export async function fetchTarget(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        // A descriptive user-agent is polite and transparent about what's
        // making the request — this is a monitoring tool, not a scraper
        // trying to hide.
        "User-Agent": "CampaignWatcher/1.0 (personal monitoring tool)",
        Accept: "application/json, text/html;q=0.9, */*;q=0.8",
      },
    });

    clearTimeout(timeoutId);

    if (response.status === 429) {
      const retryAfterHeader = response.headers.get("retry-after");
      const retryAfterMs = retryAfterHeader
        ? Number(retryAfterHeader) * 1000
        : 60000; // default to backing off 1 minute if not specified
      return { ok: false, reason: "RATE_LIMITED", retryAfterMs };
    }

    if (response.status === 404) {
      return { ok: false, reason: "NOT_FOUND" };
    }

    if (response.status >= 500) {
      return { ok: false, reason: "SERVER_ERROR", status: response.status };
    }

    if (!response.ok) {
      return { ok: false, reason: "HTTP_ERROR", status: response.status };
    }

    const contentType = response.headers.get("content-type") || "";
    const body = await response.text();

    return { ok: true, contentType, body };
  } catch (err) {
    clearTimeout(timeoutId);

    if (err.name === "AbortError") {
      return { ok: false, reason: "TIMEOUT" };
    }
    // Covers DNS failures, connection refused, etc.
    return { ok: false, reason: "NETWORK_ERROR", message: err.message };
  }
}
