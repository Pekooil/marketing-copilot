import { z } from "zod";

const eventBase = z.object({
  eventId: z.uuid(),
  workspaceHash: z.string().regex(/^[a-f0-9]{20}$/),
  userHash: z.string().regex(/^[a-f0-9]{20}$/),
  occurredAt: z.iso.datetime(),
});

const stepSchema = z.enum(["company", "objective", "resources", "review"]);

export const analyticsEventSchema = z.discriminatedUnion("name", [
  eventBase.extend({ name: z.literal("workspace_created"), properties: z.object({ source: z.enum(["onboarding", "admin_seed"]) }).strict() }),
  eventBase.extend({ name: z.literal("objective_created"), properties: z.object({ baselineState: z.enum(["known", "unknown"]) }).strict() }),
  eventBase.extend({ name: z.literal("resource_constraints_saved"), properties: z.object({ changedFields: z.array(z.enum(["time", "cash", "risk", "tactics", "brand", "audience", "geography", "approvals"])).max(8) }).strict() }),
  eventBase.extend({ name: z.literal("onboarding_step_viewed"), properties: z.object({ step: stepSchema }).strict() }),
  eventBase.extend({ name: z.literal("onboarding_step_completed"), properties: z.object({ step: stepSchema, durationBucket: z.enum(["under_30s", "30s_to_2m", "over_2m"]) }).strict() }),
  eventBase.extend({ name: z.literal("onboarding_drop_off"), properties: z.object({ step: stepSchema, reason: z.enum(["navigate_away", "session_end", "validation_blocked"]) }).strict() }),
  eventBase.extend({ name: z.literal("product_url_analyzed"), properties: z.object({ outcome: z.enum(["proposal_created", "blocked_unsafe_url", "fetch_failed", "extraction_failed"]), redirectBucket: z.enum(["none", "one", "multiple"]).optional() }).strict() }),
  eventBase.extend({ name: z.literal("product_understanding_verified"), properties: z.object({ correctedFields: z.array(z.enum(["company_name", "product_summary", "target_customer"])).max(3), sourceCount: z.number().int().min(1).max(20) }).strict() }),
  eventBase.extend({ name: z.literal("metric_definition_saved"), properties: z.object({ version: z.enum(["first", "revision"]), unit: z.enum(["count", "percentage", "currency_minor", "seconds", "custom"]), aggregation: z.enum(["count", "sum", "average", "unique", "ratio", "latest"]) }).strict() }),
  eventBase.extend({ name: z.literal("manual_metrics_previewed"), properties: z.object({ outcome: z.enum(["ready", "issues", "rejected"]), rowCountBucket: z.enum(["one", "two_to_ten", "eleven_to_one_hundred", "over_one_hundred"]), issueCountBucket: z.enum(["none", "one", "two_to_ten", "over_ten"]) }).strict() }),
  eventBase.extend({ name: z.literal("manual_metrics_imported"), properties: z.object({ rowCountBucket: z.enum(["one", "two_to_ten", "eleven_to_one_hundred", "over_one_hundred"]), qualityStates: z.array(z.enum(["current", "stale", "missing", "conflicted", "invalid", "unknown"])).min(1).max(6) }).strict() }),
  eventBase.extend({ name: z.literal("funnel_saved"), properties: z.object({ version: z.enum(["first", "revision"]), includedStageCount: z.number().int().min(2).max(7) }).strict() }),
  eventBase.extend({ name: z.literal("connector_authorization_completed"), properties: z.object({ provider: z.literal("posthog"), region: z.enum(["us", "eu"]), outcome: z.enum(["connected", "denied", "failed"]) }).strict() }),
  eventBase.extend({ name: z.literal("connector_mapping_saved"), properties: z.object({ provider: z.literal("posthog"), version: z.enum(["first", "revision"]), materialized: z.boolean() }).strict() }),
  eventBase.extend({ name: z.literal("connector_sync_completed"), properties: z.object({ provider: z.literal("posthog"), outcome: z.enum(["succeeded", "recovered"]), metricCountBucket: z.enum(["one", "two_to_five", "six_to_twenty", "over_twenty"]), qualityStates: z.array(z.enum(["current", "stale", "missing", "conflicted", "invalid", "unknown"])).min(1).max(6) }).strict() }),
  eventBase.extend({ name: z.literal("connector_sync_failed"), properties: z.object({ provider: z.literal("posthog"), connectionState: z.enum(["degraded", "error"]), errorClass: z.string().regex(/^[A-Z0-9_]{2,80}$/) }).strict() }),
  eventBase.extend({ name: z.literal("connector_revoked"), properties: z.object({ provider: z.literal("posthog") }).strict() }),
  eventBase.extend({ name: z.literal("safe_error"), properties: z.object({ area: z.enum(["auth", "onboarding", "mutation", "product_understanding", "metrics", "connectors"]), errorClass: z.string().regex(/^[A-Z0-9_]{2,80}$/) }).strict() }),
]);

export type AnalyticsEvent = z.infer<typeof analyticsEventSchema>;
export type AnalyticsEventInput = Omit<AnalyticsEvent, "workspaceHash" | "userHash" | "occurredAt">;
