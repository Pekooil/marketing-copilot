import { describe, expect, it } from "vitest";

import { calculateFunnelConversions, funnelDefinitionInputSchema, type FunnelObservation } from "@/metrics/funnel";

const base = {
  qualityState: "current" as const,
  windowStart: "2026-08-01T00:00:00Z",
  windowEnd: "2026-08-08T00:00:00Z",
  segment: "all",
  timezone: "UTC",
};

describe("canonical funnel", () => {
  it("calculates adjacent conversions from compatible current observations", () => {
    const observations: FunnelObservation[] = [
      { ...base, stage: "acquisition", value: 100, snapshotId: "snapshot-1" },
      { ...base, stage: "activation", value: 25, snapshotId: "snapshot-2" },
      { ...base, stage: "retention", value: 10, snapshotId: "snapshot-3" },
    ];
    expect(calculateFunnelConversions(observations)).toEqual([
      expect.objectContaining({ fromStage: "acquisition", toStage: "activation", rate: 0.25, state: "available" }),
      expect.objectContaining({ fromStage: "activation", toStage: "retention", rate: 0.4, state: "available" }),
    ]);
  });

  it.each([
    [{ ...base, stage: "acquisition", value: 0, snapshotId: "a" }, { ...base, stage: "activation", value: 0, snapshotId: "b" }, "zero_denominator"],
    [{ ...base, stage: "acquisition", value: 100, snapshotId: "a" }, { ...base, stage: "activation", value: null, qualityState: "unknown", snapshotId: null }, "quality"],
    [{ ...base, stage: "acquisition", value: 100, snapshotId: "a" }, { ...base, stage: "activation", value: 20, segment: "paid", snapshotId: "b" }, "incompatible_scope"],
  ] as const)("returns an unavailable reason instead of fabricating a rate", (denominator, numerator, reason) => {
    expect(calculateFunnelConversions([denominator, numerator])[0]).toMatchObject({ rate: null, state: "unavailable", reason });
  });

  it("requires mapped, uniquely ordered included stages", () => {
    expect(() => funnelDefinitionInputSchema.parse({ name: "Core", stages: [
      { stage: "acquisition", label: "Visits", definition: "Qualified visits", metricDefinitionId: null, included: true, position: 0 },
      { stage: "activation", label: "Activated", definition: "Reached value", metricDefinitionId: null, included: true, position: 1 },
    ] })).toThrow(/metric mapping/i);
  });
});
