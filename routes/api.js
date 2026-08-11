import { Router } from "express";
import { getStatus, runCheck, startWatching, stopWatching } from "../services/watcher.js";
import { getEvents } from "../utils/eventLogger.js";

const router = Router();

// GET /api/status — current watcher status for the dashboard
router.get("/status", (req, res) => {
  const status = getStatus();
  res.json({
    running: status.running,
    checking: status.checking,
    campaignCount: status.campaignCount,
    lastChecked: status.lastChecked,
    nextCheckAt: status.nextCheckAt,
    consecutiveErrors: status.consecutiveErrors,
    lastError: status.lastError,
    targetUrl: process.env.TARGET_URL,
    checkIntervalMs: Number(process.env.CHECK_INTERVAL) || 10000,
  });
});

// GET /api/campaigns — the currently known campaign list
router.get("/campaigns", (req, res) => {
  const status = getStatus();
  res.json({ campaigns: status.campaigns });
});

// GET /api/events — recent detection history
router.get("/events", async (req, res) => {
  const limit = Number(req.query.limit) || 50;
  const events = await getEvents(limit);
  res.json({ events });
});

// POST /api/check — trigger an immediate check (the "Check Now" button)
router.post("/check", async (req, res) => {
  const status = await runCheck();
  res.json({ message: "Check complete", status });
});

// POST /api/start — start the recurring monitoring loop
router.post("/start", (req, res) => {
  const status = startWatching();
  res.json({ message: "Watcher started", status });
});

// POST /api/stop — stop the recurring monitoring loop
router.post("/stop", (req, res) => {
  const status = stopWatching();
  res.json({ message: "Watcher stopped", status });
});

export default router;
