import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

const STAGES = ["New", "Screen", "Founder/HM", "Offer", "Pass", "Rejected"];
const convexUrl = import.meta.env.VITE_CONVEX_URL;
const client = convexUrl ? new ConvexHttpClient(convexUrl) : null;

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
}

function filtered() {
  return opportunities.filter((o) => {
    const hay = Object.values(o).join(" ").toLowerCase();
    const matchesQuery = hay.includes(query.toLowerCase());
    const days = o.lastTouch ? (Date.now() - new Date(o.lastTouch).getTime()) / 86400000 : 999;
    const matchesFilter =
      activeFilter === "all" ||
      (activeFilter === "linkedin" && o.source === "LinkedIn") ||
      (activeFilter === "stale" && days > 7 && !["Pass", "Rejected"].includes(o.stage)) ||
      (activeFilter === "high" && o.priority === "High");
    return matchesQuery && matchesFilter;
  });
}

function render() {
  renderMetrics();
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

function card(o) {
  const priority = o.priority === "High" ? `<span class="pill high">High priority</span>` : `<span class="pill">${o.priority || "Medium"}</span>`;
  const source = o.source === "LinkedIn" ? `<span class="pill linkedin">LinkedIn message/email</span>` : `<span class="pill">${o.source || "Email"}</span>`;
  const outcome = ["Pass", "Rejected"].includes(o.stage) ? `<span class="pill ${o.stage.toLowerCase()}">${o.stage}</span>` : "";
  return `<article class="card" draggable="true" data-id="${o._id}" tabindex="0">
    <div class="meta">${source}${priority}${outcome}</div>
    <h3>${escapeHtml(o.company || "Unknown company")}</h3>
    <div class="role">${escapeHtml(o.role || "Unknown role")}</div>
    ${o.contact ? `<div class="contact">${escapeHtml(o.contact)}</div>` : ""}
    ${o.subject ? `<div class="snippet">${escapeHtml(o.subject)}</div>` : ""}
    ${o.nextStep ? `<div class="next">Next: ${escapeHtml(o.nextStep)}</div>` : ""}
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
    c.addEventListener("click", () => openEditor(c.dataset.id));
    c.addEventListener("keydown", (e) => { if (e.key === "Enter") openEditor(c.dataset.id); });
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

function openEditor(id) {
  editingId = id || null;
  const form = document.getElementById("editorForm");
  form.reset();
  form.stage.innerHTML = STAGES.map((s) => `<option>${s}</option>`).join("");
  document.getElementById("deleteBtn").style.visibility = id ? "visible" : "hidden";
  document.getElementById("modalTitle").textContent = id ? "Edit opportunity" : "Add opportunity";
  if (id) {
    const o = opportunities.find((x) => x._id === id);
    Object.keys(o || {}).forEach((k) => { if (form[k]) form[k].value = o[k] || ""; });
  }
  document.getElementById("editor").showModal();
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

document.getElementById("search").addEventListener("input", (e) => { query = e.target.value; renderBoard(); });
document.querySelectorAll(".filter").forEach((b) => b.addEventListener("click", () => {
  document.querySelectorAll(".filter").forEach((x) => x.classList.remove("active"));
  b.classList.add("active");
  activeFilter = b.dataset.filter;
  renderBoard();
}));
document.getElementById("addOpp").addEventListener("click", () => openEditor());
document.getElementById("seedDemo").addEventListener("click", () => { opportunities = demo; render(); });
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
