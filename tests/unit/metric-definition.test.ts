import { describe, expect, it } from "vitest";

import { metricDefinitionInputSchema, metricDefinitionKey } from "@/metrics/definition";

describe("metric definition", () => {
  const valid = {
    name: "Weekly activated accounts",
    businessDefinition: "Accounts that complete the activation checklist during the UTC week.",
    unit: "count" as const,
    customUnit: "",
    aggregation: "unique" as const,
    segment: "Self-serve accounts",
    exclusions: ["Internal accounts"],
    timezone: "UTC",
    freshnessHours: 168,
  };

  it("validates an auditable definition contract", () => {
    expect(metricDefinitionInputSchema.parse(valid)).toEqual(valid);
  });

  it("rejects ambiguous timezone and custom units", () => {
    expect(() => metricDefinitionInputSchema.parse({ ...valid, timezone: "PST" })).toThrow();
    expect(() => metricDefinitionInputSchema.parse({ ...valid, unit: "custom" })).toThrow(/custom unit/i);
  });

  it("normalizes names only for identity matching", () => {
    expect(metricDefinitionKey(" Weekly   Signups ")).toBe("weekly signups");
  });
});
