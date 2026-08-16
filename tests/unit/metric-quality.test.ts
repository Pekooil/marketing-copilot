import { describe, expect, it } from "vitest";

import { assertMetricValueState, qualityScoreByState } from "@/metrics/quality";

describe("metric quality and values", () => {
  it("preserves observed zero as a valid current value", () => {
    expect(() => assertMetricValueState("current", 0)).not.toThrow();
    expect(qualityScoreByState.current).toBe(1);
  });

  it.each(["missing", "unknown", "invalid"] as const)("requires %s to remain null", (state) => {
    expect(() => assertMetricValueState(state, null)).not.toThrow();
    expect(() => assertMetricValueState(state, 0)).toThrow(/cannot carry/i);
  });

  it.each(["current", "stale", "conflicted"] as const)("requires %s to carry a candidate", (state) => {
    expect(() => assertMetricValueState(state, null)).toThrow(/require a numeric value/i);
  });
});
