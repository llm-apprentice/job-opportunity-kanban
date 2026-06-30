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
  priority,
  lastTouch: v.optional(v.string()),
  nextStep: v.optional(v.string()),
  notes: v.optional(v.string()),
  url: v.optional(v.string()),
});

function shouldReplaceText(existing: string | undefined, incoming: string | undefined) {
  if (!incoming) return false;
  if (!existing) return true;
  if (existing === "Unknown company" || existing === "Unknown role") return true;
  if (existing.length < 8 && incoming.length > existing.length) return true;
  return false;
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
      let existing = null;
      if (opp.gmailMessageId) {
        existing = await ctx.db
          .query("opportunities")
          .withIndex("by_gmail_message", (q) => q.eq("gmailMessageId", opp.gmailMessageId))
          .unique();
      }
      if (!existing && opp.dedupeKey) {
        existing = await ctx.db
          .query("opportunities")
          .withIndex("by_dedupe_key", (q) => q.eq("dedupeKey", opp.dedupeKey))
          .unique();
      }

      const now = Date.now();
      if (existing) {
        await ctx.db.patch(existing._id, {
          company: shouldReplaceText(existing.company, opp.company) ? opp.company : existing.company,
          role: shouldReplaceText(existing.role, opp.role) ? opp.role : existing.role,
          source: opp.source,
          contact: opp.contact || existing.contact,
          subject: opp.subject || existing.subject,
          snippet: opp.snippet || existing.snippet,
          gmailMessageId: opp.gmailMessageId || existing.gmailMessageId,
          gmailThreadId: opp.gmailThreadId || existing.gmailThreadId,
          dedupeKey: opp.dedupeKey || existing.dedupeKey,
          lastTouch: opp.lastTouch || existing.lastTouch,
          updatedAt: now,
        });
        updated += 1;
      } else {
        await ctx.db.insert("opportunities", {
          ...opp,
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
  },
  handler: async (ctx, args) => {
    const { id, ...patch } = args;
    await ctx.db.patch(id, { ...patch, updatedAt: Date.now() });
  },
});

export const remove = mutation({
  args: { id: v.id("opportunities") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
