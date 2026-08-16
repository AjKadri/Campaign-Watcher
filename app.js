import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

import apiRoutes from "./routes/api.js";
import { startWatching, stopWatching } from "./services/watcher.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3000;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

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


const server = app.listen(PORT, "0.0.0.0", () => {
  console.log("================================");
  console.log("Campaign Watcher");
  console.log("================================\n");
  console.log(`Dashboard running on port ${PORT}`);
  console.log(`Target:           ${process.env.TARGET_URL || "(not set — check your .env)"}`);
  console.log(`Check interval:   ${(Number(process.env.CHECK_INTERVAL) || 30000) / 1000} seconds\n`);

  if (!process.env.TARGET_URL) {
    console.warn("[WARN] TARGET_URL is not set in .env — the watcher won't have anything to check.");
  }
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
    console.warn("[WARN] Telegram isn't fully configured — notifications will be skipped.");
  }

  startWatching();
});

async function shutdown(signal) {
  console.log(`\n[INFO] Received ${signal}. Shutting down gracefully...`);

  await stopWatching();

  server.close(() => {
    console.log("[INFO] HTTP server stopped.");
    process.exit(0);
  });

  setTimeout(() => {
    console.warn("[WARN] Shutdown timed out. Forcing exit.");
    process.exit(1);
  }, 10000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
