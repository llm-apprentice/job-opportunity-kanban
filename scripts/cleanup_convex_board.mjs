#!/usr/bin/env node
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

const url = process.env.CONVEX_URL || process.env.VITE_CONVEX_URL || "https://secret-ladybug-592.convex.cloud";
const client = new ConvexHttpClient(url);

function companyKey(row) {
  const company = (row.company || "").trim().toLowerCase();
  if (!company || company === "unknown company") return "";
  return company.replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function dateKey(row) {
  return `${row.lastTouch || ""}|${row.gmailMessageId || ""}`;
}

function isFalsePositive(row) {
  const contact = `${row.contact || ""}`.toLowerCase();
  const subject = `${row.subject || ""}`.toLowerCase();
  const hay = `${contact} ${subject} ${row.snippet || ""}`.toLowerCase();
  return (
    contact.includes("lance.r.wills@gmail.com") ||
    hay.includes("beehiiv.com") ||
    /\byour posts? got\b.*\b(impressions?|views?)\b/i.test(subject) ||
    /\bpost performance\b/i.test(subject) ||
    /\bzoom\b/i.test(subject) ||
    /\bgoogle\s+meet\b/i.test(subject) ||
    /\bcalendar\s+invite\b/i.test(subject) ||
    /\binvitation:\s+.*\b(interview|zoom|meet)\b/i.test(subject)
  );
}

const rows = await client.query(anyApi.opportunities.list, {});
const removeIds = new Set();

for (const row of rows) {
  if (isFalsePositive(row)) removeIds.add(row._id);
}

const keptCandidates = rows.filter((row) => !removeIds.has(row._id));
const byCompany = new Map();
for (const row of keptCandidates) {
  const key = companyKey(row);
  if (!key) continue;
  const current = byCompany.get(key);
  if (!current || dateKey(row) > dateKey(current)) byCompany.set(key, row);
}
for (const row of keptCandidates) {
  const key = companyKey(row);
  if (key && byCompany.get(key)?._id !== row._id) removeIds.add(row._id);
}

let removed = 0;
for (const id of removeIds) {
  await client.mutation(anyApi.opportunities.remove, { id });
  removed += 1;
}

console.log(JSON.stringify({ before: rows.length, removed, after: rows.length - removed }, null, 2));
