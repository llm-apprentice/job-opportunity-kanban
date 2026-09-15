#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

function requiredConvexUrl() {
  const url = process.env.CONVEX_URL || process.env.VITE_CONVEX_URL;
  if (!url) throw new Error("Missing CONVEX_URL or VITE_CONVEX_URL. Copy .env.example to .env.local for local use.");
  return url;
}

const url = requiredConvexUrl();
const out = process.argv[2] || "data/convex-export.local.json";
const client = new ConvexHttpClient(url);
const rows = await client.query(anyApi.opportunities.list, {});
await writeFile(out, JSON.stringify(rows, null, 2));
console.log(JSON.stringify({ count: rows.length, out }, null, 2));
