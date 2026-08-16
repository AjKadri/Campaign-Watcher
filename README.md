# Campaign Watcher

Campaign Watcher monitors a campaign website on a configurable schedule, detects changes, and sends Telegram notifications when relevant events occur.

It supports authenticated websites through a saved Playwright browser session and includes a web dashboard for monitoring the watcher.

The watcher can detect:

- New campaigns
- Removed campaigns
- Campaign status changes
- Available slot changes
- Campaign updates
- Authentication/session expiration
- Network and HTTP failures
- Rate limiting

This is a monitoring and notification tool only. It does not submit campaign applications, bypass CAPTCHA, bypass authentication, or attempt to circumvent rate limits.

## Quick start

Install dependencies:

```bash
npm install
```

Create the environment file:

```bash
nano .env
```

Add the required configuration:

```env
TARGET_URL=
LOGIN_URL=

TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=

CHECK_INTERVAL=30000
REQUEST_TIMEOUT=10000
PORT=3000
```

Start the application:

```bash
npm run dev
```

The dashboard is available at:

```text
http://localhost:3000
```

Monitoring starts automatically when the server boots.

The dashboard provides controls for starting and stopping monitoring and viewing the current watcher status, campaigns, and event history.

## Authentication

The watcher uses Playwright to access authenticated pages.

Authentication state is stored locally in:

```text
data/browser-state.json
```

This file contains browser session information and must never be committed to Git or shared publicly.

### Creating an authentication session

Run:

```bash
node scripts/login.js
```

The authentication script opens the configured login page in a visible browser.

Log in manually, then return to the terminal and press `ENTER`.

The authenticated browser state is saved to:

```text
data/browser-state.json
```

The watcher can then reuse this session when fetching the target website.

### Server authentication

The current login script launches Playwright with a visible browser.

A normal headless VPS doesn't have a graphical display, so `node scripts/login.js` cannot currently be run directly on the VPS without a display server.

The authentication session can instead be created on a machine with a graphical environment and the resulting `data/browser-state.json` can be transferred securely to the VPS.

Never commit this file to Git.

### Authentication expiration

If the saved session is no longer valid, the fetcher detects when the target redirects to a login page and returns:

```text
LOGIN_REQUIRED
```

The watcher records the failure and reports that authentication needs to be refreshed.

To create a new session:

```bash
node scripts/login.js
```

## Telegram notifications

The watcher sends notifications through a Telegram bot.

### Setting up Telegram

1. Message `@BotFather` on Telegram.
2. Run `/newbot`.
3. Copy the bot token into `TELEGRAM_BOT_TOKEN`.
4. Send your new bot a message.
5. Open:

```text
https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates
```

6. Find the chat ID and put it in `TELEGRAM_CHAT_ID`.

If Telegram isn't configured, the watcher continues running and skips notifications.

## Monitoring configuration

The monitoring interval is controlled by:

```env
CHECK_INTERVAL=30000
```

The value is in milliseconds.

For example, `30000` means the watcher checks every 30 seconds.

The request timeout is controlled by:

```env
REQUEST_TIMEOUT=10000
```

The application port is controlled by:

```env
PORT=3000
```

## How monitoring works

Each monitoring cycle follows this flow:

```text
Watcher
   ↓
Playwright browser
   ↓
Authenticated target request
   ↓
Authentication / HTTP checks
   ↓
Campaign parser
   ↓
Compare with previous state
   ↓
Detect changes
   ↓
Send notifications
   ↓
Save current state
```

The watcher prevents overlapping checks. If a previous check is still running, another scheduled check is skipped.

## Campaign parsing

The campaign parser is located at:

```text
services/campaignParser.js
```

It converts the target website's response into the normalized campaign structure used by the rest of the application.

The parser supports JSON and HTML responses.

The normalized campaign data is used by the watcher to compare the current state with the previous state.

## Campaign change detection

The watcher compares the current campaign state with the previously saved state.

It can detect:

### New campaigns

A campaign that wasn't present during the previous successful check is reported as a new campaign.

### Removed campaigns

A previously detected campaign that disappears from the target is reported as removed.

### Campaign updates

Changes to tracked campaign fields are detected and reported.

Tracked fields can include:

- Status
- Filled slots
- Capacity
- Available slots
- Reward
- Campaign type
- Payment type

### Slot availability

The watcher has specific handling for a campaign whose available slots change from:

```text
0 → 1+
```

This generates a dedicated slot-available notification.

### Join detection

The project retains functionality related to detecting campaign participation and joins.

The join notification can be disabled without removing the underlying functionality. This allows the detection logic to remain available for future use.

## First-run behavior

The first successful check creates a baseline.

No campaign-change notifications are sent during the initial baseline creation.

This prevents the watcher from treating every existing campaign as a new campaign when it first starts.

## State persistence

Campaign state is stored in:

```text
data/state.json
```

Event history is stored in:

```text
data/events.json
```

These files allow the watcher to preserve its state across restarts.

Runtime state files are excluded from Git.

## Error handling

The watcher handles several failure conditions.

### Missing authentication

```text
AUTH_FILE_MISSING
```

This means:

```text
data/browser-state.json
```

doesn't exist.

The authentication setup needs to be completed before the watcher can access the target.

### Expired authentication

```text
LOGIN_REQUIRED
```

The saved browser session is no longer authenticated.

Create a new authentication session with:

```bash
node scripts/login.js
```

### Rate limiting

```text
RATE_LIMITED
```

HTTP 429 responses trigger a temporary backoff before another check is attempted.

### Server errors

HTTP 5xx responses are treated as target server errors.

### Network errors

Connection failures and other unexpected fetch errors are recorded as network errors.

### Request timeouts

Requests that exceed `REQUEST_TIMEOUT` are reported as timeouts.

## Error notification behavior

The watcher doesn't send a Telegram message for every failed check.

It sends an error notification:

- On the first consecutive failure
- Every 10th consecutive failure afterward

This prevents a temporary outage from flooding Telegram.

## Web dashboard

The application includes a dashboard for viewing:

- Watcher status
- Current campaign count
- Current campaigns
- Last successful check
- Next scheduled check
- Consecutive errors
- Recent events

The dashboard also provides controls for starting and stopping monitoring.

Open:

```text
http://localhost:3000
```

after starting the application.

## API endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/status` | Watcher status, counts, timing, and errors |
| GET | `/api/campaigns` | Current campaign list |
| GET | `/api/events` | Recent detection history |
| POST | `/api/check` | Trigger an immediate check |
| POST | `/api/start` | Start monitoring |
| POST | `/api/stop` | Stop monitoring |

## Project structure

```text
app.js

services/
  auth.js                  Authentication and browser-state creation
  campaignFetcher.js       Playwright fetching and authentication checks
  campaignParser.js        Raw responses → normalized campaign objects
  watcher.js               Fetch → compare → notify → save orchestration
  notificationService.js   Telegram notifications

scripts/
  login.js                 Creates a saved authenticated browser session

utils/
  stateManager.js          Persist/load/compare campaign state
  eventLogger.js            Rolling history of detected events

routes/
  api.js                   JSON API used by the dashboard

views/
  Dashboard and settings pages

public/
  Dashboard CSS and JavaScript

data/
  state.json               Saved campaign state
  events.json              Event history
  browser-state.json       Saved Playwright authentication state
```

## Environment variables

The application currently uses:

| Variable | Purpose | Example |
|---|---|---|
| `TARGET_URL` | Campaign page to monitor | `https://example.com/campaigns` |
| `LOGIN_URL` | Login page used to create the saved session | `https://example.com/login` |
| `TELEGRAM_BOT_TOKEN` | Telegram bot authentication token | `123456:ABC...` |
| `TELEGRAM_CHAT_ID` | Telegram destination chat ID | `123456789` |
| `CHECK_INTERVAL` | Time between checks in milliseconds | `30000` |
| `REQUEST_TIMEOUT` | Maximum request time in milliseconds | `10000` |
| `PORT` | Dashboard/server port | `3000` |

## Security

The following files contain secrets or runtime data and should not be committed:

```text
.env
data/browser-state.json
data/state.json
data/events.json
*.log
```

The authentication state in `data/browser-state.json` should be treated like a credential because it may contain valid session cookies.

The current `.gitignore` excludes these files from Git.

## Running on a VPS

The watcher can run as a background service on a VPS.

The production fetcher uses a headless Playwright browser because a typical VPS doesn't have a graphical display.

Authentication is currently performed separately using a visible browser session.

After authentication, securely transfer:

```text
data/browser-state.json
```

to the VPS.

Do not expose the authentication state publicly.

## Design principles

The project follows several principles:

- Keep fetching separate from parsing.
- Keep notification logic separate from the watcher.
- Persist state instead of relying only on memory.
- Never overlap monitoring checks.
- Handle authentication failures explicitly.
- Back off after rate limits.
- Avoid notification spam during outages.
- Keep optional functionality available so it can be enabled again without rebuilding it.