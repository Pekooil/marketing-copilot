import { z } from "zod";

import type { MetricQualityState } from "./quality";

export const canonicalFunnelStageSchema = z.enum([
  "awareness",
  "acquisition",
  "conversion",
  "activation",
  "retention",
  "revenue",
  "referral",
]);

export const funnelStageInputSchema = z.object({
  stage: canonicalFunnelStageSchema,
  label: z.string().trim().min(1).max(80),
  definition: z.string().trim().min(1).max(1_000),
  metricDefinitionId: z.uuid().nullable(),
  included: z.boolean(),
  position: z.number().int().min(0).max(6),
});

export const funnelDefinitionInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    stages: z.array(funnelStageInputSchema).min(2).max(7),
  })
  .superRefine((value, context) => {
    const included = value.stages.filter((stage) => stage.included);
    if (included.length < 2) {
      context.addIssue({ code: "custom", path: ["stages"], message: "Include at least two funnel stages." });
    }
    if (new Set(value.stages.map((stage) => stage.stage)).size !== value.stages.length) {
      context.addIssue({ code: "custom", path: ["stages"], message: "Each canonical stage can appear once." });
    }
    if (new Set(value.stages.map((stage) => stage.position)).size !== value.stages.length) {
      context.addIssue({ code: "custom", path: ["stages"], message: "Stage positions must be unique." });
    }
    for (const [index, stage] of included.entries()) {
      if (!stage.metricDefinitionId) {
        context.addIssue({ code: "custom", path: ["stages", index, "metricDefinitionId"], message: "Included stages require a metric mapping." });
      }
    }
  });

export type FunnelDefinitionInput = z.infer<typeof funnelDefinitionInputSchema>;

export interface FunnelObservation {
  stage: z.infer<typeof canonicalFunnelStageSchema>;
  value: number | null;
  qualityState: MetricQualityState;
  windowStart: string;
  windowEnd: string;
  segment: string;
  timezone: string;
  snapshotId: string | null;
}

export interface FunnelConversion {
  fromStage: FunnelObservation["stage"];
  toStage: FunnelObservation["stage"];
  rate: number | null;
  state: "available" | "unavailable";
  reason?: "quality" | "incompatible_scope" | "zero_denominator";
  numeratorSnapshotId: string | null;
  denominatorSnapshotId: string | null;
}

export function calculateFunnelConversions(
  observations: FunnelObservation[],
): FunnelConversion[] {
  const conversions: FunnelConversion[] = [];
  for (let index = 1; index < observations.length; index += 1) {
    const denominator = observations[index - 1];
    const numerator = observations[index];
    const base = {
      fromStage: denominator.stage,
      toStage: numerator.stage,
      numeratorSnapshotId: numerator.snapshotId,
      denominatorSnapshotId: denominator.snapshotId,
    };
    if (
      denominator.qualityState !== "current" ||
      numerator.qualityState !== "current" ||
      denominator.value === null ||
      numerator.value === null
    ) {
      conversions.push({ ...base, rate: null, state: "unavailable", reason: "quality" });
      continue;
    }
    if (
      denominator.windowStart !== numerator.windowStart ||
      denominator.windowEnd !== numerator.windowEnd ||
      denominator.segment !== numerator.segment ||
      denominator.timezone !== numerator.timezone
    ) {
      conversions.push({ ...base, rate: null, state: "unavailable", reason: "incompatible_scope" });
      continue;
    }
    if (denominator.value === 0) {
      conversions.push({ ...base, rate: null, state: "unavailable", reason: "zero_denominator" });
      continue;
    }
    conversions.push({ ...base, rate: numerator.value / denominator.value, state: "available" });
  }
  return conversions;
}
