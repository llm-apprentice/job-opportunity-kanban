#!/usr/bin/env node
// Clean up the "New" column only. Tiles the user has triaged into other
// columns are never deleted. Removes, from New:
//   1. junk (notification relays, newsletters, calendar robots, own replies)
//   2. tiles duplicating an already-triaged tile (same thread/dedupeKey/company)
//   3. duplicates within New itself (keep the newest of each group)
// Run with DRY_RUN=1 to print what would be removed without deleting.
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

const url = process.env.CONVEX_URL || process.env.VITE_CONVEX_URL || "https://secret-ladybug-592.convex.cloud";
const client = new ConvexHttpClient(url);
const dryRun = process.env.DRY_RUN === "1";

const MY_EMAILS = ["lance.r.wills@gmail.com", "alphascorp@gmail.com"];

const JUNK_SENDER_PATTERNS = [
  "beehiiv.com",
  "substack.com",
  "mailchi.mp",
  "mailchimp.com",
  "convertkit.com",
  "hubspotemail.net",
  "messages-noreply@linkedin.com",
  "security-noreply@linkedin.com",
  "notifications-noreply@linkedin.com",
  "jobalerts-noreply@linkedin.com",
  "invitations@linkedin.com",
  "groups-noreply@linkedin.com",
  "api-noreply@linkedin.com",
  "@eml.linkedin.com",
  "chat-noreply@google.com",
  "greenhouse-jobs",
  "jobmorph",
  "synapserecruiternetwork.com",
  "calendar-notification@google.com",
  "calendar-server.bounces.google.com",
  // Observed drip/newsletter senders already on the board.
  "azariangrowthagency.com",
  "erikcharlesconsulting.com",
  "talent@getclera.com",
];

const JUNK_SUBJECT_PATTERNS = [
  /\byour posts? got\b.*\b(impressions?|views?)\b/i,
  /\bpost performance\b/i,
  /\bpeople viewed your post\b/i,
  /\byour linkedin post\b/i,
  /\bzoom\b/i,
  /\bgoogle\s+meet\b/i,
  /\bcalendar\s+invite\b/i,
  /\binvitation:\s+.*\b(interview|zoom|meet)\b/i,
  /^(reminder|notification|invitation|updated invitation|accepted|declined|canceled event|confirmed):/i,
  /\binvitation from an unknown sender\b/i,
  /^message replied:/i,
  /\breplied to your message\b/i,
  /\b(mentioned|tagged) you in a post\b/i,
  /\bcommented on your post\b/i,
  /\breacted to your\b/i,
  /\bstreak\b/i,
  /\bmessages? from .* (is|are) waiting\b/i,
  /\bverify your new device\b/i,
  /\byour application was viewed\b/i,
  /\byour matched opportunities\b/i,
  /\bsee the latest roles\b/i,
  /\bjob alert\b/i,
  /\bjobs? for you\b/i,
  /\bnewsletter\b/i,
  /\bwebinar\b/i,
];

// Company names that are extraction garbage, not real companies.
const GARBAGE_COMPANIES = new Set([
  "mon", "tue", "tues", "wed", "thu", "thur", "thurs", "fri", "sat", "sun",
  "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec",
  "san", "los", "eu", "us", "usa", "uk", "remote", "hybrid", "onsite",
]);

// Must mirror canonicalCompanyKey in convex/opportunities.ts.
function normalizeKey(name) {
  return (name || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function companyKey(row) {
  const company = (row.company || "").trim().toLowerCase();
  if (!company || company === "unknown company" || GARBAGE_COMPANIES.has(company)) return "";
  return normalizeKey(company);
}

// Re-derive the company from receipt/outbound subject formats. Stored rows
// were parsed with older heuristics, so "Your application was sent to X"
// tiles often carry "Unknown company" and fail to group.
function derivedCompanyName(row) {
  const subject = (row.subject || "").replace(/^((re|fw|fwd|ooo re)\s*:\s*)+/i, "").trim();
  const patterns = [
    /application was sent to\s+(.{2,60})$/i,
    /(?:your application|confirm your application)\s+(?:to|for)\s+.*?\bat\s+([A-Z0-9][\w.&' -]{1,50})$/i,
    /thank you for applying to\s+(.{2,60}?)[!.]?$/i,
    /thank you for your interest in\s+(.{2,60}?)[!.]?$/i,
    /^Lance(?:\s+R\.)?\s+Wills\s+-\s+([A-Z][A-Za-z0-9.&-]+)\s+/,
  ];
  for (const pat of patterns) {
    const m = subject.match(pat);
    if (m) {
      const candidate = m[1].trim().replace(/[.,!\s-]+$/, "");
      if (candidate.length >= 2 && !GARBAGE_COMPANIES.has(candidate.toLowerCase())) return candidate;
    }
  }
  return "";
}

function matchKeys(row) {
  const keys = new Set();
  const ck = companyKey(row);
  if (ck) keys.add(ck);
  const derived = normalizeKey(derivedCompanyName(row));
  if (derived) keys.add(derived);
  return keys;
}

function dateKey(row) {
  return `${row.lastTouch || ""}|${row.updatedAt || 0}`;
}

function isJunk(row) {
  const contact = `${row.contact || ""}`.toLowerCase();
  const subject = `${row.subject || ""}`;
  const snippet = `${row.snippet || ""} ${row.notes || ""}`;
  if (MY_EMAILS.some((e) => contact.includes(e))) return true;
  if (JUNK_SENDER_PATTERNS.some((p) => contact.includes(p))) return true;
  if (userBlocked.some((p) => contact.includes(p))) return true;
  if (JUNK_SUBJECT_PATTERNS.some((p) => p.test(subject))) return true;
  if (/\bunsubscribe\b|\bemail preferences\b|\bopt.?out\b/i.test(snippet) && /\b(no-?reply|newsletter|hello|hi|team|digest|updates?)@/.test(contact)) return true;
  return false;
}

const rows = await client.query(anyApi.opportunities.list, {});
const userBlocked = (await client.query(anyApi.opportunities.listBlockedSenders, {}).catch(() => []))
  .map((b) => b.pattern.toLowerCase())
  .filter(Boolean);
const newRows = rows.filter((r) => r.stage === "New");
const triagedRows = rows.filter((r) => r.stage !== "New");

const removals = new Map(); // id -> reason

// 1. Junk in New.
for (const row of newRows) {
  if (isJunk(row)) removals.set(row._id, `junk: ${(row.subject || row.role || "").slice(0, 60)}`);
}

// 2. New tiles that duplicate a triaged tile (same conversation or company).
const triagedThreads = new Set(triagedRows.map((r) => r.gmailThreadId).filter(Boolean));
const triagedDedupe = new Set(triagedRows.map((r) => r.dedupeKey).filter(Boolean));
const triagedCompanies = new Set(triagedRows.flatMap((r) => [...matchKeys(r)]));

for (const row of newRows) {
  if (removals.has(row._id)) continue;
  const companies = [...matchKeys(row)];
  if (row.gmailThreadId && triagedThreads.has(row.gmailThreadId)) {
    removals.set(row._id, `thread already triaged: ${(row.subject || "").slice(0, 60)}`);
  } else if (row.dedupeKey && triagedDedupe.has(row.dedupeKey)) {
    removals.set(row._id, `dedupe key already triaged: ${(row.subject || "").slice(0, 60)}`);
  } else if (companies.some((k) => triagedCompanies.has(k))) {
    removals.set(row._id, `company already triaged: ${companies.join(" / ")}`);
  }
}

// 3. Duplicates within New: same thread, dedupe key, or company — keep newest.
const survivors = newRows.filter((r) => !removals.has(r._id));
for (const keyFn of [
  (r) => (r.gmailThreadId ? [r.gmailThreadId] : []),
  (r) => (r.dedupeKey ? [r.dedupeKey] : []),
  (r) => [...matchKeys(r)],
]) {
  const best = new Map();
  for (const row of survivors) {
    if (removals.has(row._id)) continue;
    for (const key of keyFn(row)) {
      const current = best.get(key);
      if (!current || dateKey(row) > dateKey(current)) best.set(key, row);
    }
  }
  for (const row of survivors) {
    if (removals.has(row._id)) continue;
    for (const key of keyFn(row)) {
      if (best.get(key)?._id !== row._id) {
        removals.set(row._id, `duplicate in New of ${key}: ${(row.subject || "").slice(0, 60)}`);
        break;
      }
    }
  }
}

// 4. Repair kept New tiles whose stored company is unknown/garbage but whose
// subject yields a real company name.
const repairs = [];
for (const row of newRows) {
  if (removals.has(row._id)) continue;
  const derived = derivedCompanyName(row);
  if (derived && !companyKey(row) && normalizeKey(derived) !== normalizeKey(row.company)) {
    repairs.push({ id: row._id, company: derived, was: row.company });
  }
}

if (dryRun) {
  for (const [id, reason] of removals) console.error(`[dry-run] would remove ${id} — ${reason}`);
  for (const r of repairs) console.error(`[dry-run] would repair ${r.id} company "${r.was}" -> "${r.company}"`);
} else {
  for (const id of removals.keys()) {
    await client.mutation(anyApi.opportunities.remove, { id });
  }
  for (const r of repairs) {
    await client.mutation(anyApi.opportunities.updateOpportunity, { id: r.id, company: r.company });
  }
}

console.log(
  JSON.stringify(
    {
      before: rows.length,
      newColumn: newRows.length,
      removed: dryRun ? 0 : removals.size,
      repaired: dryRun ? 0 : repairs.length,
      wouldRemove: dryRun ? removals.size : undefined,
      wouldRepair: dryRun ? repairs.length : undefined,
      after: rows.length - (dryRun ? 0 : removals.size),
    },
    null,
    2,
  ),
);
