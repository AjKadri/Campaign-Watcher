import { chromium } from "playwright";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const AUTH_FILE = path.join(projectRoot, "data", "browser-state.json");
const REQUEST_TIMEOUT = Number(process.env.REQUEST_TIMEOUT) || 10000;

let browser;
let context;

async function getBrowserContext() {
  if (!browser) {
    browser = await chromium.launch({
      headless: true
    });
  }

  if (!context) {
    try {
      await fs.access(AUTH_FILE);
    } catch {
      throw new Error(`Authentication file not found: ${AUTH_FILE}`);
    }

    context = await browser.newContext({
      storageState: AUTH_FILE
    });
  }

  return context;
}

export async function fetchTarget(url) {
  let page;

  try {
    const browserContext = await getBrowserContext();
    page = await browserContext.newPage();

    const response = await page.goto(url, {
      waitUntil: "networkidle",
      timeout: REQUEST_TIMEOUT
    });

    const finalUrl = page.url();
    const body = await page.content();
    const status = response?.status() || 200;
    const contentType = response?.headers()["content-type"] || "text/html";

    console.log("[FETCH] Status:", status);
    console.log("[FETCH] Requested URL:", url);
    console.log("[FETCH] Final URL:", finalUrl);
    console.log(
      "[FETCH] Contains login page:",
      /log\s*in|sign\s*in/i.test(body)
    );

    if (/login|signin|sign-in/i.test(finalUrl)) {
      console.error("[AUTH] Saved session is no longer authenticated.");

      return {
        ok: false,
        reason: "LOGIN_REQUIRED",
        status
      };
    }

    if (status === 429) {
      return {
        ok: false,
        reason: "RATE_LIMITED",
        retryAfterMs: 60000,
        status
      };
    }

    if (status === 404) {
      return {
        ok: false,
        reason: "NOT_FOUND",
        status
      };
    }

    if (status >= 500) {
      return {
        ok: false,
        reason: "SERVER_ERROR",
        status
      };
    }

    if (!response?.ok()) {
      return {
        ok: false,
        reason: "HTTP_ERROR",
        status
      };
    }

    return {
      ok: true,
      contentType,
      body,
      finalUrl,
      status
    };
  } catch (err) {
    console.error("[FETCH] Error:", err.message);

    if (err.message.includes("Authentication file not found")) {
      return {
        ok: false,
        reason: "AUTH_FILE_MISSING",
        message: err.message
      };
    }

    if (err.name === "TimeoutError") {
      return {
        ok: false,
        reason: "TIMEOUT"
      };
    }

    return {
      ok: false,
      reason: "NETWORK_ERROR",
      message: err.message
    };
  } finally {
    if (page) {
      await page.close();
    }
  }
}