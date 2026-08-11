# Campaign Watcher

Monitors a publicly accessible campaign website (API or HTML) on a schedule,
detects new campaigns, removed campaigns, and status changes, and sends you
a Telegram alert when something changes. Includes a small web dashboard.

This is a monitoring/notification tool only — it does not submit forms,
bypass rate limits, or work around authentication/CAPTCHA.

## Quick start

```bash
npm install
cp .env.example .env
# edit .env — set TARGET_URL, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
npm run dev
```

Then open **http://localhost:3000**.

Monitoring starts automatically when the server boots. Use the dashboard's
Start/Stop buttons, or `POST /api/stop`, to control it manually.

## Setting up Telegram

1. Message [@BotFather](https://t.me/BotFather) on Telegram, run `/newbot`,
   and copy the token it gives you into `TELEGRAM_BOT_TOKEN`.
2. Send your new bot any message (so it can find your chat).
3. Visit `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates` in a browser
   and find `"chat":{"id": ...}` — that number goes in `TELEGRAM_CHAT_ID`.

## Pointing it at the real site — the one file you'll edit

Open **`services/campaignParser.js`**. It has two functions:

- `parseFromJson(body)` — used automatically if the target responds with
  `content-type: application/json`. Adjust the field names (`item.name`,
  `item.id`, etc.) to match the real API's response shape.
- `parseFromHtml(body)` — used as a fallback for regular HTML pages, via
  the `cheerio` library (jQuery-style selectors). Replace the placeholder
  `.campaign-card` / `.title` / `.status` selectors with whatever actually
  wraps each campaign on the real page (right-click → Inspect in your
  browser to find them).

Nothing else in the app needs to change — `watcher.js`, the comparison
logic, notifications, and the dashboard all work off the normalized
`{ id, title, url, status }` shape these functions produce.

## How it avoids common problems

- **No false alerts on first run** — the first check just saves a
  baseline; nothing is compared against yet.
- **No duplicate alerts** — state is only saved after processing, and
  comparisons are always against the last saved state.
- **Survives restarts** — state lives in `data/state.json`, not memory.
- **Won't overlap checks** — a new check is skipped if one is still in
  flight.
- **Backs off on HTTP 429** — respects `Retry-After` if the target sends
  one, otherwise waits 60s before trying again.
- **Won't spam you during an outage** — only alerts on the first failure
  in a streak, then every 10th failure after that as a reminder.

## Project structure

```
app.js                    Express server bootstrap
services/
  campaignFetcher.js       All network requests (timeout, error handling)
  campaignParser.js         Raw response -> normalized campaign objects
  watcher.js                 Orchestrates fetch -> compare -> notify -> save
  notificationService.js      Telegram sending
utils/
  stateManager.js            Persist/load/compare campaign state
  eventLogger.js              Rolling history of detected events
routes/api.js               JSON API used by the dashboard
views/                      Dashboard + settings pages (EJS)
public/                     Dashboard CSS/JS
data/                       state.json + events.json (gitignored)
```

## API endpoints

| Method | Path            | Purpose                          |
|--------|-----------------|-----------------------------------|
| GET    | /api/status     | Running state, counts, timing     |
| GET    | /api/campaigns  | Current campaign list             |
| GET    | /api/events     | Recent detection history          |
| POST   | /api/check      | Trigger an immediate check        |
| POST   | /api/start      | Start the monitoring loop         |
| POST   | /api/stop       | Stop the monitoring loop          |

## Environment variables

See `.env.example` — every variable is documented there.
