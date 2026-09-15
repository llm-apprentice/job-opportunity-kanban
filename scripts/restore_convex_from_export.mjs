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
const file = process.argv[2] || "data/convex-export.local.json";
const rows = JSON.parse(await readFile(file, "utf8"));
const client = new ConvexHttpClient(url);
let restored = 0;
for (const row of rows) {
  await client.mutation(anyApi.opportunities.updateOpportunity, {
    id: row._id,
    company: row.company,
    role: row.role,
    companySource: row.companySource || "",
    roleSource: row.roleSource || "",
    gdocMatched: false,
    gdocSnippet: "",
    enrichmentConfidence: 0,
  });
  restored += 1;
}
console.log(JSON.stringify({ restored }, null, 2));
