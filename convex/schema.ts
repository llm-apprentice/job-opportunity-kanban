import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  opportunities: defineTable({
    company: v.string(),
    role: v.string(),
    stage: v.union(
      v.literal("New"),
      v.literal("Screen"),
      v.literal("Founder/HM"),
      v.literal("Offer"),
      v.literal("Pass"),
      v.literal("Rejected"),
    ),
    source: v.union(
      v.literal("LinkedIn"),
      v.literal("Email"),
      v.literal("Referral"),
      v.literal("Direct"),
      v.literal("Other"),
    ),
    contact: v.optional(v.string()),
    subject: v.optional(v.string()),
    snippet: v.optional(v.string()),
    gmailMessageId: v.optional(v.string()),
    gmailThreadId: v.optional(v.string()),
    dedupeKey: v.optional(v.string()),
    companyKey: v.optional(v.string()),
    priority: v.union(v.literal("Low"), v.literal("Medium"), v.literal("High")),
    lastTouch: v.optional(v.string()),
    nextStep: v.optional(v.string()),
    notes: v.optional(v.string()),
    url: v.optional(v.string()),
    companySource: v.optional(v.string()),
    roleSource: v.optional(v.string()),
    gdocMatched: v.optional(v.boolean()),
    gdocSnippet: v.optional(v.string()),
    enrichmentConfidence: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_gmail_message", ["gmailMessageId"])
    .index("by_gmail_thread", ["gmailThreadId"])
    .index("by_dedupe_key", ["dedupeKey"])
    .index("by_company_key", ["companyKey"])
    .index("by_stage", ["stage"]),

  syncRuns: defineTable({
    startedAt: v.number(),
    finishedAt: v.number(),
    found: v.number(),
    inserted: v.number(),
    updated: v.number(),
    status: v.union(v.literal("success"), v.literal("error")),
    error: v.optional(v.string()),
  }),
});
