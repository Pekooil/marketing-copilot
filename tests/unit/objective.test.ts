import { describe, expect, it } from "vitest";

import { ObjectiveValidationError, validateObjectiveForActivation } from "@/domain/objective";

const valid = {
  metricName: "Weekly activated accounts",
  metricDefinition: "Accounts completing the activation event in a Monday-Sunday UTC week",
  direction: "increase" as const,
  targetValue: 20,
  baselineState: "known" as const,
  baselineValue: 0,
  deadline: "2026-09-30",
  targetSegment: "Self-serve technical founders",
  rationale: "Activation is the current growth constraint.",
};

describe("objective activation", () => {
  it("distinguishes a known zero baseline from unknown", () => {
    expect(validateObjectiveForActivation(valid, "2026-08-15").baselineValue).toBe(0);
    expect(validateObjectiveForActivation({ ...valid, baselineState: "unknown", baselineValue: null }, "2026-08-15").baselineState).toBe("unknown");
  });

  it("returns field errors for vague or incomplete goals", () => {
    expect(() => validateObjectiveForActivation({ baselineState: "unknown" }, "2026-08-15")).toThrow(ObjectiveValidationError);
    try {
      validateObjectiveForActivation({ baselineState: "unknown" }, "2026-08-15");
    } catch (error) {
      expect((error as ObjectiveValidationError).fieldErrors).toMatchObject({ metricName: expect.any(String), targetValue: expect.any(String), deadline: expect.any(String) });
    }
  });

  it("rejects past deadlines and directionally nonsensical targets", () => {
    expect(() => validateObjectiveForActivation({ ...valid, deadline: "2026-08-14" }, "2026-08-15")).toThrow(ObjectiveValidationError);
    expect(() => validateObjectiveForActivation({ ...valid, targetValue: 0 }, "2026-08-15")).toThrow(ObjectiveValidationError);
    expect(() => validateObjectiveForActivation({ ...valid, direction: "decrease", targetValue: 1 }, "2026-08-15")).toThrow(ObjectiveValidationError);
  });
});
