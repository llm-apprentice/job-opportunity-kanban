#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

const url = process.env.CONVEX_URL || "https://secret-ladybug-592.convex.cloud";
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
