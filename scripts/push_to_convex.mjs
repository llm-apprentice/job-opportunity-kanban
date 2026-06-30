#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

const url = process.env.CONVEX_URL || process.env.VITE_CONVEX_URL;
if (!url) {
  console.error("Missing CONVEX_URL or VITE_CONVEX_URL");
  process.exit(1);
}

const file = process.argv[2] || "data/opportunities.local.json";
const raw = JSON.parse(await readFile(file, "utf8"));
const opportunities = raw.map(({ id, _id, _creationTime, createdAt, updatedAt, ...opp }) => opp);
const client = new ConvexHttpClient(url);
const result = await client.mutation(anyApi.opportunities.upsertFromGmailBatch, { opportunities });
console.log(JSON.stringify(result, null, 2));
