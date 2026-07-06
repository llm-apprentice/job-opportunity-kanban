import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

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

function canonicalCompanyKey(company: string | undefined) {
  const value = (company || "").trim().toLowerCase();
  if (!value || value === "unknown company") return undefined;
  return value.replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function isIncomingNewer(existing: { lastTouch?: string; gmailMessageId?: string }, incoming: { lastTouch?: string; gmailMessageId?: string }) {
  return `${incoming.lastTouch || ""}|${incoming.gmailMessageId || ""}` >= `${existing.lastTouch || ""}|${existing.gmailMessageId || ""}`;
}

type OpportunityDoc = {
  _id: any;
  stage: string;
  lastTouch?: string;
  updatedAt: number;
};

// When several rows match (legacy duplicates), keep the one the user has
// already triaged: any non-"New" stage wins, then most recently updated.
function pickBestMatch<T extends OpportunityDoc>(rows: T[]): T | null {
  if (rows.length === 0) return null;
  return rows.slice().sort((a, b) => {
    const aTriaged = a.stage !== "New" ? 1 : 0;
    const bTriaged = b.stage !== "New" ? 1 : 0;
    if (aTriaged !== bTriaged) return bTriaged - aTriaged;
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  })[0];
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("opportunities").collect();
    return rows.sort((a, b) => (b.lastTouch || "").localeCompare(a.lastTouch || ""));
  },
});

export const upsertFromGmailBatch = mutation({
  args: { opportunities: v.array(gmailOpportunity) },
  handler: async (ctx, args) => {
    const startedAt = Date.now();
    let inserted = 0;
    let updated = 0;

    for (const opp of args.opportunities) {
      const companyKey = canonicalCompanyKey(opp.company);
      let existing = null;
      if (opp.gmailMessageId) {
        existing = pickBestMatch(
          await ctx.db
            .query("opportunities")
            .withIndex("by_gmail_message", (q) => q.eq("gmailMessageId", opp.gmailMessageId))
            .collect(),
        );
      }
      // A reply or follow-up shares the Gmail thread of the original message:
      // merge into the existing tile (whatever column it is in) instead of
      // creating a new one.
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
          updatedAt: now,
        });
        updated += 1;
      } else {
        await ctx.db.insert("opportunities", {
          ...opp,
          companyKey,
          stage: opp.stage || "New",
          priority: opp.priority || "Medium",
          createdAt: now,
          updatedAt: now,
        });
        inserted += 1;
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
    return { found: args.opportunities.length, inserted, updated };
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

export const remove = mutation({
  args: { id: v.id("opportunities") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
