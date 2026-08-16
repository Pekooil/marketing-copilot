import { z } from "zod";

export const metricQualityStateSchema = z.enum([
  "current",
  "stale",
  "missing",
  "conflicted",
  "invalid",
  "unknown",
]);

export type MetricQualityState = z.infer<typeof metricQualityStateSchema>;

export const qualityScoreByState: Record<MetricQualityState, number> = {
  current: 1,
  stale: 0.5,
  conflicted: 0.2,
  missing: 0,
  invalid: 0,
  unknown: 0,
};

export function qualityStateAllowsValue(state: MetricQualityState) {
  return state === "current" || state === "stale" || state === "conflicted";
}

export function assertMetricValueState(
  state: MetricQualityState,
  value: number | null,
) {
  if (qualityStateAllowsValue(state) && value === null) {
    throw new MetricValueStateError(`${state} observations require a numeric value.`);
  }
  if (!qualityStateAllowsValue(state) && value !== null) {
    throw new MetricValueStateError(`${state} observations cannot carry a numeric value.`);
  }
  if (value !== null && !Number.isFinite(value)) {
    throw new MetricValueStateError("Metric values must be finite numbers.");
  }
}

export class MetricValueStateError extends Error {
  readonly code = "METRIC_VALUE_STATE_INVALID";
}
