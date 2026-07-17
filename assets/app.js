import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

const STAGES = ["New", "Screen", "Founder/HM", "Offer", "Pass", "Rejected"];
const forceDemo = new URLSearchParams(location.search).has("demo");
const convexUrl = import.meta.env?.VITE_CONVEX_URL;
const client = !forceDemo && convexUrl ? new ConvexHttpClient(convexUrl) : null;

const demo = [
  { _id: "demo-1", company: "Northstar AI", role: "Head of Agent GTM", stage: "Founder/HM", source: "LinkedIn", contact: "Maya Chen", priority: "High", lastTouch: "2026-06-26", nextStep: "Prep founder narrative", subject: "Maya sent you a message on LinkedIn", url: "", notes: "Agentic workflow infra startup. Strong fit for GTM + technical storytelling." },
  { _id: "demo-2", company: "Orbital Labs", role: "VP Marketing", stage: "Screen", source: "Email", contact: "Eli / Talent", priority: "Medium", lastTouch: "2026-06-24", nextStep: "Reply with availability", subject: "Following up on VP Marketing intro", url: "", notes: "Need to validate ICP and sales motion." },
  { _id: "demo-3", company: "LocalStack AI", role: "Developer Relations Lead", stage: "New", source: "LinkedIn", contact: "Recruiter", priority: "High", lastTouch: "2026-06-21", nextStep: "Find JD/history in LinkedIn", subject: "You have a new message about Developer Relations", url: "", notes: "Local model tooling angle; worth investigating." },
  { _id: "demo-4", company: "Quiet Compute", role: "Fractional CMO", stage: "Pass", source: "Referral", contact: "Founder", priority: "Low", lastTouch: "2026-06-11", nextStep: "No action", subject: "Intro to Quiet Compute", url: "", notes: "Interesting company, but scope/budget mismatch." },
];

let opportunities = [];
let activeFilter = "all";
let query = "";
let editingId = null;
let loading = true;
let loadError = "";
let selectedIds = new Set();
let lasso = null;

async function load() {
  loading = true;
  loadError = "";
  render();
  if (!client) {
    opportunities = demo;
    loadError = "Missing VITE_CONVEX_URL; showing demo data.";
    loading = false;
    render();
    return;
  }
  try {
    opportunities = await client.query(anyApi.opportunities.list, {});
  } catch (err) {
    console.error(err);
    opportunities = demo;
    loadError = `Convex load failed; showing demo data. ${err.message || err}`;
  } finally {
    loading = false;
    render();
  }
  renderSyncBanner();
}

function timeAgo(ms) {
  const mins = Math.round(ms / 60000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 36) return `${hours}h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

async function renderSyncBanner() {
  const el = document.getElementById("syncBanner");
  if (!el || !client) return;
  try {
    const run = await client.query(anyApi.opportunities.lastSyncRun, {});
    if (!run) return;
    const ago = timeAgo(Date.now() - run.finishedAt);
    el.hidden = false;
    if (run.status === "error") {
      el.className = "sync-banner err";
      el.textContent = `⚠ Sync failing — last attempt ${ago}: ${(run.error || "unknown error").slice(0, 140)}`;
    } else if (Date.now() - run.finishedAt > 2.5 * 3600000) {
      el.className = "sync-banner warn";
      el.textContent = `⚠ Last sync ${ago} — the hourly sync appears to be stuck.`;
    } else {
      el.className = "sync-banner ok";
      el.textContent = `Synced ${ago} · ${run.found} emails scanned`;
    }
  } catch (err) {
    console.error("sync banner", err);
  }
}

function localDateStr(offsetDays = 0) {
  const d = new Date(Date.now() - offsetDays * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function filtered() {
  const today = localDateStr(0);
  const yesterday = localDateStr(1);
  const weekAgo = localDateStr(7);
  return opportunities.filter((o) => {
    const hay = Object.values(o).join(" ").toLowerCase();
    const matchesQuery = hay.includes(query.toLowerCase());
    const days = o.lastTouch ? (Date.now() - new Date(o.lastTouch).getTime()) / 86400000 : 999;
    const touch = o.lastTouch || "";
    const matchesFilter =
      activeFilter === "all" ||
      (activeFilter === "today" && touch === today) ||
      (activeFilter === "yesterday" && touch === yesterday) ||
      (activeFilter === "week" && touch >= weekAgo) ||
      (activeFilter === "linkedin" && o.source === "LinkedIn") ||
      (activeFilter === "stale" && days > 7 && !["Pass", "Rejected"].includes(o.stage)) ||
      (activeFilter === "high" && o.priority === "High");
    return matchesQuery && matchesFilter;
  });
}

function formatShortDate(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || "")) return iso || "";
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function render() {
  selectedIds = new Set([...selectedIds].filter((id) => opportunities.some((o) => o._id === id)));
  renderMetrics();
  renderBulkBar();
  renderBoard();
}

function renderMetrics() {
  const el = document.getElementById("metrics");
  const live = opportunities.filter((o) => !["Pass", "Rejected"].includes(o.stage)).length;
  const linkedin = opportunities.filter((o) => o.source === "LinkedIn").length;
  const interviews = opportunities.filter((o) => ["Screen", "Founder/HM"].includes(o.stage)).length;
  const stale = opportunities.filter((o) => o.lastTouch && (Date.now() - new Date(o.lastTouch).getTime()) / 86400000 > 7 && !["Pass", "Rejected"].includes(o.stage)).length;
  const metrics = [[opportunities.length, "Total"], [live, "Active"], [linkedin, "LinkedIn"], [interviews, "In process"], [stale, "Stale 7d+"]];
  el.innerHTML = metrics.map(([n, l]) => `<div class="metric"><b>${n}</b><span>${l}</span></div>`).join("");
}

function renderBulkBar() {
  const bar = document.getElementById("bulkBar");
  if (!bar) return;
  const count = selectedIds.size;
  bar.hidden = count === 0;
  document.getElementById("selectedCount").textContent = `${count} selected`;
}

function card(o) {
  const priority = o.priority === "High" ? `<span class="pill high">High priority</span>` : `<span class="pill">${o.priority || "Medium"}</span>`;
  const source = o.source === "LinkedIn" ? `<span class="pill linkedin">LinkedIn message/email</span>` : `<span class="pill">${o.source || "Email"}</span>`;
  const outcome = ["Pass", "Rejected"].includes(o.stage) ? `<span class="pill ${o.stage.toLowerCase()}">${o.stage}</span>` : "";
  const enriched = o.gdocMatched ? `<span class="pill">GDoc enriched</span>` : "";
  const selected = selectedIds.has(o._id) ? " selected" : "";
  return `<article class="card${selected}" draggable="true" data-id="${o._id}" tabindex="0" aria-selected="${selectedIds.has(o._id)}">
    <div class="meta">${source}${priority}${outcome}${enriched}</div>
    <h3>${escapeHtml(o.company || "Unknown company")}</h3>
    <div class="role">${escapeHtml(o.role || "Unknown role")}</div>
    ${o.contact ? `<div class="contact">${escapeHtml(o.contact)}</div>` : ""}
    ${o.subject ? `<div class="snippet">${escapeHtml(o.subject)}</div>` : ""}
    ${o.nextStep ? `<div class="next">Next: ${escapeHtml(o.nextStep)}</div>` : ""}
    <div class="cardfoot">
      <span class="msgs">${o.messageCount || 1} msg${(o.messageCount || 1) === 1 ? "" : "s"}</span>
      ${o.lastTouch ? `<span class="touch">${o.lastTouch === localDateStr(0) ? `<span class="fresh-dot" title="Activity today"></span>` : ""}${escapeHtml(formatShortDate(o.lastTouch))}</span>` : ""}
    </div>
  </article>`;
}

function renderBoard() {
  const rows = filtered();
  const board = document.getElementById("board");
  if (loading) {
    board.innerHTML = `<div class="empty">Loading opportunities from Convex…</div>`;
    return;
  }
  const notice = loadError ? `<div class="empty" style="grid-column: 1 / -1;">${escapeHtml(loadError)}</div>` : "";
  board.innerHTML = notice + STAGES.map((stage) => {
    const items = rows.filter((o) => o.stage === stage);
    return `<section class="column" data-stage="${stage}"><div class="col-head"><h2>${stage}</h2><span class="count">${items.length}</span></div><div class="dropzone">${items.length ? items.map(card).join("") : `<div class="empty">Drop opportunities here</div>`}</div></section>`;
  }).join("");

  document.querySelectorAll(".card").forEach((c) => {
    c.addEventListener("dragstart", (e) => e.dataTransfer.setData("text/plain", c.dataset.id));
    c.addEventListener("click", (e) => {
      if (e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) {
        toggleSelected(c.dataset.id);
      } else {
        openEditor(c.dataset.id);
      }
    });
    c.addEventListener("keydown", (e) => {
      if (e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        toggleSelected(c.dataset.id);
      } else if (e.key === "Enter") openEditor(c.dataset.id);
    });
  });
  document.querySelectorAll(".column").forEach((col) => {
    col.addEventListener("dragover", (e) => e.preventDefault());
    col.addEventListener("drop", async (e) => {
      e.preventDefault();
      const id = e.dataTransfer.getData("text/plain");
      await updateOpportunity(id, { stage: col.dataset.stage });
    });
  });
}

function toggleSelected(id, force) {
  if (!id) return;
  const shouldSelect = force ?? !selectedIds.has(id);
  if (shouldSelect) selectedIds.add(id);
  else selectedIds.delete(id);
  renderBulkBar();
  document.querySelector(`.card[data-id="${CSS.escape(id)}"]`)?.classList.toggle("selected", selectedIds.has(id));
}

function clearSelection() {
  selectedIds.clear();
  document.querySelectorAll(".card.selected").forEach((card) => card.classList.remove("selected"));
  renderBulkBar();
}

async function deleteSelected() {
  const ids = [...selectedIds];
  if (!ids.length) return;
  if (!confirm(`Delete ${ids.length} selected opportunity${ids.length === 1 ? "" : "ies"}?`)) return;
  if (!client) {
    opportunities = opportunities.filter((o) => !selectedIds.has(o._id));
    selectedIds.clear();
    render();
    return;
  }
  for (const id of ids) {
    await client.mutation(anyApi.opportunities.remove, { id });
  }
  selectedIds.clear();
  await load();
}

function rectsOverlap(a, b) {
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
}

function lassoRect() {
  return {
    left: Math.min(lasso.startX, lasso.x),
    right: Math.max(lasso.startX, lasso.x),
    top: Math.min(lasso.startY, lasso.y),
    bottom: Math.max(lasso.startY, lasso.y),
  };
}

function updateLassoBox() {
  const box = document.getElementById("lassoBox");
  if (!box || !lasso) return;
  const r = lassoRect();
  box.style.left = `${r.left}px`;
  box.style.top = `${r.top}px`;
  box.style.width = `${r.right - r.left}px`;
  box.style.height = `${r.bottom - r.top}px`;
}

function applyLassoSelection() {
  const r = lassoRect();
  document.querySelectorAll(".card").forEach((card) => {
    const cardRect = card.getBoundingClientRect();
    if (rectsOverlap(r, cardRect)) selectedIds.add(card.dataset.id);
  });
}

function openEditor(id) {
  editingId = id || null;
  const form = document.getElementById("editorForm");
  form.reset();
  form.stage.innerHTML = STAGES.map((s) => `<option>${s}</option>`).join("");
  document.getElementById("deleteBtn").style.visibility = id ? "visible" : "hidden";
  document.getElementById("blockBtn").style.visibility = id ? "visible" : "hidden";
  document.getElementById("modalTitle").textContent = id ? "Edit opportunity" : "Add opportunity";
  if (id) {
    const o = opportunities.find((x) => x._id === id);
    Object.keys(o || {}).forEach((k) => { if (form[k]) form[k].value = o[k] || ""; });
  }
  renderTimeline(id);
  document.getElementById("editor").showModal();
}

async function renderTimeline(id) {
  const section = document.getElementById("timeline");
  const list = document.getElementById("timelineList");
  section.hidden = true;
  list.innerHTML = "";
  if (!id || !client || id.startsWith("demo-")) return;
  try {
    const msgs = await client.query(anyApi.opportunities.messagesFor, { id });
    if (!msgs.length) return;
    list.innerHTML = msgs
      .map(
        (m) => `<div class="tl-item">
          <div class="tl-head"><span class="tl-date">${escapeHtml(formatShortDate(m.date) || "earlier")}</span><span class="tl-from">${escapeHtml(m.from || "")}</span></div>
          ${m.subject ? `<div class="tl-subject">${escapeHtml(m.subject)}</div>` : ""}
          ${m.snippet ? `<div class="tl-snippet">${escapeHtml(m.snippet)}</div>` : ""}
        </div>`,
      )
      .join("");
    section.hidden = false;
  } catch (err) {
    console.error("timeline", err);
  }
}

function senderEmail(contact) {
  const m = (contact || "").match(/<([^>]+@[^>]+)>/) || (contact || "").match(/([\w.+-]+@[\w.-]+)/);
  return m ? m[1].toLowerCase() : "";
}

async function blockSenderFor(id) {
  const o = opportunities.find((x) => x._id === id);
  const email = senderEmail(o?.contact);
  if (!email) {
    alert("No sender email on this card — delete it instead.");
    return;
  }
  if (!confirm(`Block "${email}"?\n\nThis deletes the card and permanently stops ingesting emails from this exact address.`)) return;
  if (!client || id.startsWith("demo-")) return;
  await client.mutation(anyApi.opportunities.blockSender, { id, pattern: email });
  await load();
}

function formData() {
  const f = document.getElementById("editorForm");
  return Object.fromEntries(new FormData(f).entries());
}

async function updateOpportunity(id, patch) {
  if (!client || id.startsWith("demo-")) {
    Object.assign(opportunities.find((o) => o._id === id), patch);
    render();
    return;
  }
  await client.mutation(anyApi.opportunities.updateOpportunity, { id, ...patch });
  await load();
}

async function deleteOpportunity(id) {
  if (!client || id.startsWith("demo-")) {
    opportunities = opportunities.filter((o) => o._id !== id);
    render();
    return;
  }
  await client.mutation(anyApi.opportunities.remove, { id });
  await load();
}

function escapeHtml(str) {
  return String(str).replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]));
}

const searchInput = document.getElementById("search");
const clearSearch = document.getElementById("clearSearch");
function syncClearSearch() {
  clearSearch.disabled = !searchInput.value;
}
searchInput.addEventListener("input", (e) => {
  query = e.target.value;
  syncClearSearch();
  renderBoard();
});
clearSearch.addEventListener("click", () => {
  searchInput.value = "";
  query = "";
  syncClearSearch();
  searchInput.focus();
  renderBoard();
});
syncClearSearch();
document.querySelectorAll(".filter").forEach((b) => b.addEventListener("click", () => {
  document.querySelectorAll(".filter").forEach((x) => x.classList.remove("active"));
  b.classList.add("active");
  activeFilter = b.dataset.filter;
  renderBoard();
}));
document.getElementById("addOpp").addEventListener("click", () => openEditor());
document.getElementById("clearSelection").addEventListener("click", clearSelection);
document.getElementById("bulkDelete").addEventListener("click", deleteSelected);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && selectedIds.size) clearSelection();
  if ((e.key === "Delete" || e.key === "Backspace") && selectedIds.size && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) deleteSelected();
});
const boardEl = document.getElementById("board");
boardEl.addEventListener("pointerdown", (e) => {
  if (!e.altKey || e.button !== 0) return;
  e.preventDefault();
  lasso = { startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY };
  document.getElementById("lassoBox").hidden = false;
  updateLassoBox();
  boardEl.setPointerCapture(e.pointerId);
});
boardEl.addEventListener("pointermove", (e) => {
  if (!lasso) return;
  lasso.x = e.clientX;
  lasso.y = e.clientY;
  updateLassoBox();
});
boardEl.addEventListener("pointerup", (e) => {
  if (!lasso) return;
  lasso.x = e.clientX;
  lasso.y = e.clientY;
  applyLassoSelection();
  lasso = null;
  document.getElementById("lassoBox").hidden = true;
  render();
});
document.getElementById("seedDemo").addEventListener("click", () => { opportunities = demo; selectedIds.clear(); render(); });
document.getElementById("exportBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(opportunities, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "opportunities.local.json";
  a.click();
  URL.revokeObjectURL(a.href);
});
document.getElementById("importBtn").addEventListener("click", () => document.getElementById("fileInput").click());
document.getElementById("fileInput").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const imported = JSON.parse(await file.text());
  if (client) {
    await client.mutation(anyApi.opportunities.upsertFromGmailBatch, { opportunities: imported });
    await load();
  } else {
    opportunities = imported.map((o) => ({ _id: o.id || crypto.randomUUID(), ...o }));
    render();
  }
});
document.getElementById("editorForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const val = e.submitter?.value;
  if (val === "cancel") return document.getElementById("editor").close();
  if (val === "delete" && editingId) {
    await deleteOpportunity(editingId);
    return document.getElementById("editor").close();
  }
  if (val === "block") {
    if (editingId) await blockSenderFor(editingId);
    return document.getElementById("editor").close();
  }
  const data = formData();
  if (editingId) {
    await updateOpportunity(editingId, data);
  } else if (client) {
    await client.mutation(anyApi.opportunities.upsertFromGmailBatch, { opportunities: [{ ...data, stage: data.stage || "New", source: data.source || "Email", priority: data.priority || "Medium", dedupeKey: `${data.company}|${data.role}|${Date.now()}` }] });
    await load();
  } else {
    opportunities.unshift({ _id: crypto.randomUUID(), ...data });
    render();
  }
  document.getElementById("editor").close();
});

load();
