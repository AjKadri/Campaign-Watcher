import { chromium } from "playwright";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, "..");
const dataDir = path.join(projectRoot, "data");
const statePath = path.join(dataDir, "browser-state.json");

export async function createAuthenticatedSession() {
  await fs.mkdir(dataDir, { recursive: true });

  const browser = await chromium.launch({
    headless: false
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  console.log("[AUTH] Opening login page...");

  await page.goto(process.env.LOGIN_URL, {
    waitUntil: "domcontentloaded"
  });

  console.log("[AUTH] Log in manually in the browser window.");
  console.log("[AUTH] After logging in, return to this terminal.");
  console.log("[AUTH] Press ENTER when you're logged in.");

  await new Promise((resolve) => {
    process.stdin.resume();
    process.stdin.once("data", resolve);
  });

  await context.storageState({
    path: statePath
  });

  console.log(`[AUTH] Authentication state saved to: ${statePath}`);

  await browser.close();

  return statePath;
}