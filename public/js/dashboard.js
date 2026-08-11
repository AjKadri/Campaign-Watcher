const POLL_INTERVAL_MS = 3000;

const el = {
  statusIndicator: document.getElementById("status-indicator"),
  targetUrl: document.getElementById("target-url"),
  statCount: document.getElementById("stat-count"),
  statLast: document.getElementById("stat-last"),
  statNext: document.getElementById("stat-next"),
  statInterval: document.getElementById("stat-interval"),
  campaignRows: document.getElementById("campaign-rows"),
  campaignsSub: document.getElementById("campaigns-sub"),
  eventList: document.getElementById("event-list"),
  btnCheck: document.getElementById("btn-check"),
  btnStart: document.getElementById("btn-start"),
  btnStop: document.getElementById("btn-stop"),
};

function formatTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-US", { hour12: false });
}

function statusBadgeClass(status) {
  const key = (status || "").toLowerCase();
  if (key === "available") return "badge badge-available";
  if (key === "full" || key === "closed") return "badge badge-full";
  return "badge badge-default";
}

function eventEmoji(type) {
  return {
    NEW_CAMPAIGN: "🚨",
    REMOVED_CAMPAIGN: "❌",
    STATUS_CHANGED: "🔄",
    ERROR: "⚠️",
  }[type] || "•";
}

async function refreshStatus() {
  try {
    const res = await fetch("/api/status");
    const data = await res.json();

    el.targetUrl.textContent = data.targetUrl || "not set";
    el.statCount.textContent = data.campaignCount ?? "0";
    el.statLast.textContent = formatTime(data.lastChecked);
    el.statNext.textContent = data.running ? formatTime(data.nextCheckAt) : "—";
    el.statInterval.textContent = `${Math.round((data.checkIntervalMs || 0) / 1000)}s`;

    // Status pill: priority is error > checking > running > stopped
    el.statusIndicator.className = "status-pill";
    if (data.consecutiveErrors > 0) {
      el.statusIndicator.classList.add("status-error");
      el.statusIndicator.textContent = `⚠️ Error (${data.lastError || "unknown"})`;
    } else if (data.checking) {
      el.statusIndicator.classList.add("status-checking");
      el.statusIndicator.textContent = "🟡 Checking…";
    } else if (data.running) {
      el.statusIndicator.classList.add("status-running");
      el.statusIndicator.textContent = "🟢 Monitoring";
    } else {
      el.statusIndicator.classList.add("status-stopped");
      el.statusIndicator.textContent = "🔴 Stopped";
    }

    el.btnStart.disabled = data.running;
    el.btnStop.disabled = !data.running;
  } catch (err) {
    el.statusIndicator.className = "status-pill status-error";
    el.statusIndicator.textContent = "⚠️ Dashboard can't reach the server";
  }
}

async function refreshCampaigns() {
  try {
    const res = await fetch("/api/campaigns");
    const data = await res.json();
    const campaigns = data.campaigns || [];

    el.campaignsSub.textContent = `${campaigns.length} tracked`;

    if (campaigns.length === 0) {
      el.campaignRows.innerHTML = `<tr><td colspan="3" class="empty-row">No campaigns detected yet</td></tr>`;
      return;
    }

    el.campaignRows.innerHTML = campaigns
      .map(
        (c) => `
      <tr>
        <td>${escapeHtml(c.title)}</td>
        <td><span class="${statusBadgeClass(c.status)}">${escapeHtml(c.status)}</span></td>
        <td>${c.url ? `<a href="${escapeAttr(c.url)}" target="_blank" rel="noopener">visit ↗</a>` : "—"}</td>
      </tr>`
      )
      .join("");
  } catch (err) {
    el.campaignRows.innerHTML = `<tr><td colspan="3" class="empty-row">Failed to load campaigns</td></tr>`;
  }
}

async function refreshEvents() {
  try {
    const res = await fetch("/api/events?limit=25");
    const data = await res.json();
    const events = data.events || [];

    if (events.length === 0) {
      el.eventList.innerHTML = `<li class="empty-row">No events yet</li>`;
      return;
    }

    el.eventList.innerHTML = events
      .map(
        (e) => `
      <li>
        <span class="event-time">${formatTime(e.timestamp)}</span>
        <span class="event-type">${eventEmoji(e.type)} ${e.type.replace("_", " ")}</span>
        ${e.campaign ? `<span class="event-title">${escapeHtml(e.campaign)}</span>` : ""}
        ${e.message ? `<span class="event-title">${escapeHtml(e.message)}</span>` : ""}
      </li>`
      )
      .join("");
  } catch (err) {
    el.eventList.innerHTML = `<li class="empty-row">Failed to load events</li>`;
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function escapeAttr(str) {
  return (str || "").replace(/"/g, "&quot;");
}

async function refreshAll() {
  await Promise.all([refreshStatus(), refreshCampaigns(), refreshEvents()]);
}

// --- Button wiring ---
el.btnCheck.addEventListener("click", async () => {
  el.btnCheck.disabled = true;
  el.btnCheck.textContent = "Checking…";
  try {
    await fetch("/api/check", { method: "POST" });
  } finally {
    el.btnCheck.disabled = false;
    el.btnCheck.textContent = "Check now";
    refreshAll();
  }
});

el.btnStart.addEventListener("click", async () => {
  await fetch("/api/start", { method: "POST" });
  refreshAll();
});

el.btnStop.addEventListener("click", async () => {
  await fetch("/api/stop", { method: "POST" });
  refreshAll();
});

// Initial load + polling
refreshAll();
setInterval(refreshAll, POLL_INTERVAL_MS);
