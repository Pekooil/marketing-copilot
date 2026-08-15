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
  eventBase.extend({ name: z.literal("safe_error"), properties: z.object({ area: z.enum(["auth", "onboarding", "mutation"]), errorClass: z.string().regex(/^[A-Z0-9_]{2,80}$/) }).strict() }),
]);

export type AnalyticsEvent = z.infer<typeof analyticsEventSchema>;
export type AnalyticsEventInput = Omit<AnalyticsEvent, "workspaceHash" | "userHash" | "occurredAt">;
