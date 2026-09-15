#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

function requiredConvexUrl() {
  const url = process.env.CONVEX_URL || process.env.VITE_CONVEX_URL;
  if (!url) throw new Error("Missing CONVEX_URL or VITE_CONVEX_URL. Copy .env.example to .env.local for local use.");
  return url;
}

const url = requiredConvexUrl();
const junk = JSON.parse(await readFile("data/opportunities.local.json", "utf8"));
const junkIds = new Set(junk.map((r) => r.gmailMessageId).filter(Boolean));
const client = new ConvexHttpClient(url);
const rows = await client.query(anyApi.opportunities.list, {});
let removed = 0;
for (const row of rows) {
  if (junkIds.has(row.gmailMessageId)) {
    await client.mutation(anyApi.opportunities.remove, { id: row._id });
    removed += 1;
  }
}
console.log(JSON.stringify({ removed }, null, 2));
