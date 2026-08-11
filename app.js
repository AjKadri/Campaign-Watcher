import "dotenv/config"; // loads .env into process.env
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

import apiRoutes from "./routes/api.js";
import { startWatching } from "./services/watcher.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3000;

// --- View engine ---
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// --- Static files (CSS/JS) ---
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

// --- Pages ---
app.get("/", (req, res) => {
  res.render("index");
});

app.get("/settings", (req, res) => {
  res.render("settings", {
    targetUrl: process.env.TARGET_URL || "not set",
    checkIntervalMs: Number(process.env.CHECK_INTERVAL) || 10000,
    requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT) || 10000,
    telegramConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    telegramChatConfigured: Boolean(process.env.TELEGRAM_CHAT_ID),
    port: PORT,
  });
});

// --- JSON API ---
app.use("/api", apiRoutes);

// --- Start server ---
app.listen(PORT, () => {
  console.log("================================");
  console.log("Campaign Watcher");
  console.log("================================\n");
  console.log(`Dashboard:        http://localhost:${PORT}`);
  console.log(`Target:           ${process.env.TARGET_URL || "(not set — check your .env)"}`);
  console.log(`Check interval:   ${(Number(process.env.CHECK_INTERVAL) || 10000) / 1000} seconds\n`);

  if (!process.env.TARGET_URL) {
    console.warn("[WARN] TARGET_URL is not set in .env — the watcher won't have anything to check.");
  }
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
    console.warn("[WARN] Telegram isn't fully configured — notifications will be skipped until you set");
    console.warn("       TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env.");
  }

  // Monitoring starts automatically on boot. Use the dashboard's
  // Start/Stop buttons (or POST /api/stop) if you'd rather control
  // this manually.
  startWatching();
});
