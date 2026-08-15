import { afterEach, describe, expect, it, vi } from "vitest";

import { withRequestContext } from "@/observability/context";
import { isFeatureEnabled } from "@/observability/feature-flags";
import { createLogger, privacyHash } from "@/observability/logger";
import { AuditConsistencyError, createMutationTrace } from "@/observability/mutation-trace";
import { redact } from "@/observability/redaction";

afterEach(() => vi.unstubAllEnvs());

describe("server feature flags", () => {
  it("evaluates explicit on/off values without becoming authorization", () => {
    vi.stubEnv("FEATURE_ONBOARDING", "off");
    expect(isFeatureEnabled("onboarding")).toBe(false);
    vi.stubEnv("FEATURE_ONBOARDING", "on");
    expect(isFeatureEnabled("onboarding")).toBe(true);
  });
});

describe("privacy-safe observability", () => {
  it("redacts nested secrets and entered business content", () => {
    expect(redact({ authorization: "Bearer secret", nested: { goalText: "private goal", result: "ok" } })).toEqual({
      authorization: "[REDACTED]",
      nested: { goalText: "[REDACTED]", result: "ok" },
    });
  });

  it("correlates structured mutation and audit logs without raw IDs", () => {
    const lines: string[] = [];
    const logger = createLogger((line) => lines.push(line));
    withRequestContext(
      { requestId: "request-1", traceId: "trace-1", workspaceHash: privacyHash("workspace-a", "test-salt") },
      () => {
        const trace = createMutationTrace(logger);
        trace.mutationStarted("objective.edit");
        trace.auditAppended({ action: "objective.edit", result: "succeeded", targetType: "objective" });
        trace.mutationCompleted("objective.edit", "succeeded");
      },
    );
    const records = lines.map((line) => JSON.parse(line));
    expect(records).toHaveLength(3);
    expect(records.every(({ requestId, traceId }) => requestId === "request-1" && traceId === "trace-1")).toBe(true);
    expect(lines.join(" ")).not.toContain("workspace-a");
  });

  it("emits an alert-class event for mutation/audit inconsistency", () => {
    const lines: string[] = [];
    const trace = createMutationTrace(createLogger((line) => lines.push(line)));
    expect(() => trace.consistencyFailure("objective.edit")).toThrow(AuditConsistencyError);
    expect(JSON.parse(lines[0])).toMatchObject({ event: "mutation_audit_inconsistency", alert: true });
  });
});
