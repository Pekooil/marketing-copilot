import { describe, expect, it } from "vitest";

import { assertActionClassAllowed, isActionClassAllowed, resourceConstraintsSchema } from "@/domain/resource-constraints";

const valid = {
  founderMinutesPerWeek: 300,
  cashBudgetMinor: 10_000,
  currency: "USD",
  riskTolerance: "low",
  prohibitedTactics: ["Cold outbound"],
  brandRules: ["No unsupported superlatives"],
  audienceLimits: ["Technical founders"],
  geographyLimits: ["United States"],
  approvalPreferences: { requirePreparationApproval: true, requestedActionClasses: ["C"] },
};

describe("resource constraints", () => {
  it("accepts a five-hour and $100 operating envelope", () => {
    expect(resourceConstraintsSchema.parse(valid)).toMatchObject({ founderMinutesPerWeek: 300, cashBudgetMinor: 10_000, currency: "USD" });
  });

  it("rejects negative values, invalid currencies, blank tactics, and duplicates", () => {
    expect(() => resourceConstraintsSchema.parse({ ...valid, founderMinutesPerWeek: -1 })).toThrow();
    expect(() => resourceConstraintsSchema.parse({ ...valid, cashBudgetMinor: -1 })).toThrow();
    expect(() => resourceConstraintsSchema.parse({ ...valid, currency: "usd" })).toThrow();
    expect(() => resourceConstraintsSchema.parse({ ...valid, prohibitedTactics: [""] })).toThrow();
    expect(() => resourceConstraintsSchema.parse({ ...valid, prohibitedTactics: ["Spam", "spam"] })).toThrow();
  });

  it("applies global V1 policy before approval preferences", () => {
    for (const allowed of ["A", "B", "C"] as const) expect(isActionClassAllowed(allowed)).toBe(true);
    for (const blocked of ["D", "E", "F"] as const) {
      expect(isActionClassAllowed(blocked)).toBe(false);
      expect(() => assertActionClassAllowed(blocked)).toThrow("globally prohibited");
    }
  });
});
