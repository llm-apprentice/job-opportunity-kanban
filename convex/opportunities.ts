import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";

const stage = v.union(
  v.literal("New"),
  v.literal("Screen"),
  v.literal("Founder/HM"),
  v.literal("Offer"),
  v.literal("Pass"),
  v.literal("Rejected"),
);

const source = v.union(
  v.literal("LinkedIn"),
  v.literal("Email"),
  v.literal("Referral"),
  v.literal("Direct"),
  v.literal("Other"),
);

const priority = v.union(v.literal("Low"), v.literal("Medium"), v.literal("High"));

const gmailOpportunity = v.object({
  company: v.string(),
  role: v.string(),
  stage,
  source,
  contact: v.optional(v.string()),
  subject: v.optional(v.string()),
  snippet: v.optional(v.string()),
  gmailMessageId: v.optional(v.string()),
  gmailThreadId: v.optional(v.string()),
  dedupeKey: v.optional(v.string()),
  companyKey: v.optional(v.string()),
  priority,
  lastTouch: v.optional(v.string()),
  nextStep: v.optional(v.string()),
  notes: v.optional(v.string()),
  url: v.optional(v.string()),
  companySource: v.optional(v.string()),
  roleSource: v.optional(v.string()),
  gdocMatched: v.optional(v.boolean()),
  gdocSnippet: v.optional(v.string()),
  enrichmentConfidence: v.optional(v.number()),
});

function shouldReplaceText(existing: string | undefined, incoming: string | undefined) {
  if (!incoming) return false;
  if (!existing) return true;
  if (existing === "Unknown company" || existing === "Unknown role") return true;
  if (existing.length < 8 && incoming.length > existing.length) return true;
  return false;
}

// Alphanumeric-only so "Orange Logic", "OrangeLogic" and "orange-logic"
// all produce the same key. Changing this requires re-running
// backfillCompanyKeys so stored keys keep matching.
function canonicalCompanyKey(company: string | undefined) {
  const value = (company || "").trim().toLowerCase();
  if (!value || value === "unknown company") return undefined;
  return value.replace(/[^a-z0-9]+/g, "") || undefined;
}

function isIncomingNewer(existing: { lastTouch?: string; gmailMessageId?: string }, incoming: { lastTouch?: string; gmailMessageId?: string }) {
  return `${incoming.lastTouch || ""}|${incoming.gmailMessageId || ""}` >= `${existing.lastTouch || ""}|${existing.gmailMessageId || ""}`;
}

// When several rows match (legacy duplicates), keep the one the user has
// already triaged: any non-"New" stage wins, then most recently updated.
function pickBestMatch(rows: Doc<"opportunities">[]): Doc<"opportunities"> | null {
  if (rows.length === 0) return null;
  return rows.slice().sort((a, b) => {
    const aTriaged = a.stage !== "New" ? 1 : 0;
    const bTriaged = b.stage !== "New" ? 1 : 0;
    if (aTriaged !== bTriaged) return bTriaged - aTriaged;
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  })[0];
}

async function writeTombstone(ctx: any, row: Doc<"opportunities">, reason: string) {
  if (!row.gmailThreadId && !row.dedupeKey) return;
  await ctx.db.insert("tombstones", {
    gmailThreadId: row.gmailThreadId || undefined,
    dedupeKey: row.dedupeKey || undefined,
    contact: row.contact,
    subject: row.subject,
    reason,
    createdAt: Date.now(),
  });
}

async function isTombstoned(ctx: any, opp: { gmailThreadId?: string; dedupeKey?: string }) {
  if (opp.gmailThreadId) {
    const byThread = await ctx.db
      .query("tombstones")
      .withIndex("by_thread", (q: any) => q.eq("gmailThreadId", opp.gmailThreadId))
      .first();
    if (byThread) return true;
  }
  if (opp.dedupeKey) {
    const byKey = await ctx.db
      .query("tombstones")
      .withIndex("by_dedupe_key", (q: any) => q.eq("dedupeKey", opp.dedupeKey))
      .first();
    if (byKey) return true;
  }
  return false;
}

async function deleteCard(ctx: any, id: Id<"opportunities">, reason: string) {
  const row = await ctx.db.get(id);
  if (!row) return;
  await writeTombstone(ctx, row, reason);
  const msgs = await ctx.db
    .query("messages")
    .withIndex("by_opportunity", (q: any) => q.eq("opportunityId", id))
    .collect();
  for (const m of msgs) await ctx.db.delete(m._id);
  await ctx.db.delete(id);
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("opportunities").collect();
    return rows.sort((a, b) => (b.lastTouch || "").localeCompare(a.lastTouch || ""));
  },
});

export const messagesFor = query({
  args: { id: v.id("opportunities") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("messages")
      .withIndex("by_opportunity", (q) => q.eq("opportunityId", args.id))
      .collect();
    return rows.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  },
});

export const lastSyncRun = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("syncRuns").order("desc").first();
  },
});

export const upsertFromGmailBatch = mutation({
  args: { opportunities: v.array(gmailOpportunity) },
  handler: async (ctx, args) => {
    const startedAt = Date.now();
    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    const blocked = (await ctx.db.query("blockedSenders").collect()).map((b) =>
      b.pattern.toLowerCase(),
    );

    for (const opp of args.opportunities) {
      const contactLower = (opp.contact || "").toLowerCase();
      if (blocked.some((p) => p && contactLower.includes(p))) {
        skipped += 1;
        continue;
      }

      // Message ledger: if this exact email was already ingested, its card
      // is already up to date.
      if (opp.gmailMessageId) {
        const seen = await ctx.db
          .query("messages")
          .withIndex("by_gmail_message", (q) => q.eq("gmailMessageId", opp.gmailMessageId!))
          .first();
        if (seen) {
          skipped += 1;
          continue;
        }
      }

      const companyKey = canonicalCompanyKey(opp.company);
      let existing: Doc<"opportunities"> | null = null;
      if (opp.gmailMessageId) {
        existing = pickBestMatch(
          await ctx.db
            .query("opportunities")
            .withIndex("by_gmail_message", (q) => q.eq("gmailMessageId", opp.gmailMessageId))
            .collect(),
        );
      }
      // A reply or follow-up shares the Gmail thread of the original message:
      // merge into the existing card (whatever column it is in) instead of
      // creating a new one. The message ledger covers threads whose card
      // field has since moved on to a different thread.
      if (!existing && opp.gmailThreadId) {
        const threadMsg = await ctx.db
          .query("messages")
          .withIndex("by_thread", (q) => q.eq("gmailThreadId", opp.gmailThreadId))
          .first();
        if (threadMsg) existing = await ctx.db.get(threadMsg.opportunityId);
      }
      if (!existing && opp.gmailThreadId) {
        existing = pickBestMatch(
          await ctx.db
            .query("opportunities")
            .withIndex("by_gmail_thread", (q) => q.eq("gmailThreadId", opp.gmailThreadId))
            .collect(),
        );
      }
      if (!existing && opp.dedupeKey) {
        existing = pickBestMatch(
          await ctx.db
            .query("opportunities")
            .withIndex("by_dedupe_key", (q) => q.eq("dedupeKey", opp.dedupeKey))
            .collect(),
        );
      }
      if (!existing && companyKey) {
        existing = pickBestMatch(
          await ctx.db
            .query("opportunities")
            .withIndex("by_company_key", (q) => q.eq("companyKey", companyKey))
            .collect(),
        );
      }

      const now = Date.now();
      let cardId: Id<"opportunities">;
      if (existing) {
        const useIncoming = isIncomingNewer(existing, opp);
        await ctx.db.patch(existing._id, {
          company: shouldReplaceText(existing.company, opp.company) ? opp.company : existing.company,
          role: shouldReplaceText(existing.role, opp.role) ? opp.role : existing.role,
          source: useIncoming ? opp.source : existing.source,
          contact: useIncoming ? opp.contact || existing.contact : existing.contact,
          subject: useIncoming ? opp.subject || existing.subject : existing.subject,
          snippet: useIncoming ? opp.snippet || existing.snippet : existing.snippet,
          gmailMessageId: useIncoming ? opp.gmailMessageId || existing.gmailMessageId : existing.gmailMessageId,
          gmailThreadId: useIncoming ? opp.gmailThreadId || existing.gmailThreadId : existing.gmailThreadId,
          dedupeKey: useIncoming ? opp.dedupeKey || existing.dedupeKey : existing.dedupeKey,
          companyKey: existing.companyKey || companyKey,
          lastTouch: useIncoming ? opp.lastTouch || existing.lastTouch : existing.lastTouch,
          companySource: opp.companySource || existing.companySource,
          roleSource: opp.roleSource || existing.roleSource,
          gdocMatched: opp.gdocMatched || existing.gdocMatched,
          gdocSnippet: opp.gdocSnippet || existing.gdocSnippet,
          enrichmentConfidence: Math.max(opp.enrichmentConfidence || 0, existing.enrichmentConfidence || 0) || undefined,
          messageCount: (existing.messageCount || 0) + (opp.gmailMessageId ? 1 : 0),
          updatedAt: now,
        });
        cardId = existing._id;
        updated += 1;
      } else {
        // Deleted by the user (or the cleanup): never re-create the card.
        if (await isTombstoned(ctx, opp)) {
          skipped += 1;
          continue;
        }
        cardId = await ctx.db.insert("opportunities", {
          ...opp,
          companyKey,
          stage: opp.stage || "New",
          priority: opp.priority || "Medium",
          messageCount: opp.gmailMessageId ? 1 : undefined,
          createdAt: now,
          updatedAt: now,
        });
        inserted += 1;
      }

      if (opp.gmailMessageId) {
        await ctx.db.insert("messages", {
          opportunityId: cardId,
          gmailMessageId: opp.gmailMessageId,
          gmailThreadId: opp.gmailThreadId || undefined,
          from: opp.contact,
          subject: opp.subject,
          snippet: opp.snippet,
          date: opp.lastTouch,
          createdAt: now,
        });
      }
    }

    await ctx.db.insert("syncRuns", {
      startedAt,
      finishedAt: Date.now(),
      found: args.opportunities.length,
      inserted,
      updated,
      status: "success",
    });
    return { found: args.opportunities.length, inserted, updated, skipped };
  },
});

export const updateOpportunity = mutation({
  args: {
    id: v.id("opportunities"),
    company: v.optional(v.string()),
    role: v.optional(v.string()),
    stage: v.optional(stage),
    source: v.optional(source),
    contact: v.optional(v.string()),
    subject: v.optional(v.string()),
    priority: v.optional(priority),
    lastTouch: v.optional(v.string()),
    nextStep: v.optional(v.string()),
    notes: v.optional(v.string()),
    url: v.optional(v.string()),
    companySource: v.optional(v.string()),
    roleSource: v.optional(v.string()),
    gdocMatched: v.optional(v.boolean()),
    gdocSnippet: v.optional(v.string()),
    enrichmentConfidence: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { id, ...patch } = args;
    await ctx.db.patch(id, { ...patch, updatedAt: Date.now() });
  },
});

export const backfillCompanyKeys = mutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("opportunities").collect();
    let patched = 0;
    for (const row of rows) {
      const key = canonicalCompanyKey(row.company);
      if (key && row.companyKey !== key) {
        await ctx.db.patch(row._id, { companyKey: key });
        patched += 1;
      }
    }
    return { patched };
  },
});

// One-time migration: give every pre-existing card a first message row built
// from its stored subject/snippet, and set messageCount.
export const backfillMessages = mutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("opportunities").collect();
    let created = 0;
    for (const row of rows) {
      const existingMsgs = await ctx.db
        .query("messages")
        .withIndex("by_opportunity", (q) => q.eq("opportunityId", row._id))
        .collect();
      if (existingMsgs.length === 0 && row.gmailMessageId) {
        await ctx.db.insert("messages", {
          opportunityId: row._id,
          gmailMessageId: row.gmailMessageId,
          gmailThreadId: row.gmailThreadId || undefined,
          from: row.contact,
          subject: row.subject,
          snippet: row.snippet,
          date: row.lastTouch,
          createdAt: Date.now(),
        });
        created += 1;
      }
      const count = existingMsgs.length || (row.gmailMessageId ? 1 : 0);
      if (count && row.messageCount !== count) {
        await ctx.db.patch(row._id, { messageCount: count });
      }
    }
    return { created };
  },
});

export const addTombstone = mutation({
  args: {
    gmailThreadId: v.optional(v.string()),
    dedupeKey: v.optional(v.string()),
    contact: v.optional(v.string()),
    subject: v.optional(v.string()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!args.gmailThreadId && !args.dedupeKey) return;
    await ctx.db.insert("tombstones", { ...args, createdAt: Date.now() });
  },
});

export const blockSender = mutation({
  args: { id: v.id("opportunities"), pattern: v.string() },
  handler: async (ctx, args) => {
    const pattern = args.pattern.trim().toLowerCase();
    if (pattern.length >= 3) {
      const existing = await ctx.db
        .query("blockedSenders")
        .withIndex("by_pattern", (q) => q.eq("pattern", pattern))
        .first();
      if (!existing) {
        await ctx.db.insert("blockedSenders", { pattern, createdAt: Date.now() });
      }
    }
    await deleteCard(ctx, args.id, "blocked-sender");
  },
});

export const listBlockedSenders = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("blockedSenders").collect();
  },
});

export const recordSyncError = mutation({
  args: { error: v.string() },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.insert("syncRuns", {
      startedAt: now,
      finishedAt: now,
      found: 0,
      inserted: 0,
      updated: 0,
      status: "error",
      error: args.error.slice(0, 1000),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("opportunities") },
  handler: async (ctx, args) => {
    await deleteCard(ctx, args.id, "deleted");
  },
});
