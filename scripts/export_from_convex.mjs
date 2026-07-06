#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

const url = process.env.CONVEX_URL || process.env.VITE_CONVEX_URL || "https://secret-ladybug-592.convex.cloud";
const out = process.argv[2] || "data/convex-export.local.json";
const client = new ConvexHttpClient(url);
const rows = await client.query(anyApi.opportunities.list, {});
await writeFile(out, JSON.stringify(rows, null, 2));
console.log(JSON.stringify({ count: rows.length, out }, null, 2));
