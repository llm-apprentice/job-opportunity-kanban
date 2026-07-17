#!/usr/bin/env node
// Record a failed sync attempt in Convex so the board's sync-health banner
// can surface it. Usage: node scripts/record_sync_error.mjs "error text"
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

const url = process.env.CONVEX_URL || process.env.VITE_CONVEX_URL || "https://secret-ladybug-592.convex.cloud";
const error = process.argv.slice(2).join(" ").trim() || "unknown error";
const client = new ConvexHttpClient(url);
await client.mutation(anyApi.opportunities.recordSyncError, { error });
console.log(JSON.stringify({ recorded: true }));
