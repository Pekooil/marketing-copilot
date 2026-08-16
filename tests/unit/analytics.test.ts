import { describe, expect, it, vi } from "vitest";

import { createAnalyticsClient } from "@/analytics/client";
import { analyticsEventSchema, type AnalyticsEvent } from "@/analytics/events";

const context = {
  workspaceId: "workspace-a",
  userId: "founder-a",
  consent: "granted" as const,
  environment: "test" as const,
};

describe("foundation analytics", () => {
  it("emits one privacy-safe event for one product action", async () => {
    vi.stubEnv("OBSERVABILITY_HASH_SALT", "test-salt");
    const send = vi.fn<(event: AnalyticsEvent) => Promise<void>>().mockResolvedValue(undefined);
    const analytics = createAnalyticsClient({ sink: { send }, enabled: true });
    const event = { eventId: "10000000-0000-4000-8000-000000000001", name: "objective_created" as const, properties: { baselineState: "unknown" as const } };
    await analytics.trackOnce("objective-action-1", context, event);
    await analytics.trackOnce("objective-action-1", context, event);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatchObject({ name: "objective_created", workspaceHash: expect.stringMatching(/^[a-f0-9]{20}$/), userHash: expect.stringMatching(/^[a-f0-9]{20}$/) });
    expect(JSON.stringify(send.mock.calls[0][0])).not.toContain("workspace-a");
    vi.unstubAllEnvs();
  });

  it("rejects entered content and unknown payload fields", () => {
    expect(() => analyticsEventSchema.parse({ eventId: "10000000-0000-4000-8000-000000000001", workspaceHash: "a".repeat(20), userHash: "b".repeat(20), occurredAt: new Date().toISOString(), name: "objective_created", properties: { baselineState: "unknown", goalText: "private" } })).toThrow();
  });

  it("honors consent, enablement, and development behavior", async () => {
    const send = vi.fn<(event: AnalyticsEvent) => Promise<void>>().mockResolvedValue(undefined);
    const analytics = createAnalyticsClient({ sink: { send }, enabled: true });
    const event = { eventId: "10000000-0000-4000-8000-000000000002", name: "onboarding_step_viewed" as const, properties: { step: "company" as const } };
    await analytics.trackOnce("denied", { ...context, consent: "denied" }, event);
    await analytics.trackOnce("development", { ...context, environment: "development" }, event);
    expect(send).not.toHaveBeenCalled();
  });

  it("allows only privacy-safe product-understanding dimensions", () => {
    const base = { eventId: "10000000-0000-4000-8000-000000000003", workspaceHash: "a".repeat(20), userHash: "b".repeat(20), occurredAt: new Date().toISOString() };
    expect(analyticsEventSchema.parse({ ...base, name: "product_url_analyzed", properties: { outcome: "proposal_created", redirectBucket: "one" } })).toBeTruthy();
    expect(() => analyticsEventSchema.parse({ ...base, name: "product_url_analyzed", properties: { outcome: "proposal_created", url: "https://private.example" } })).toThrow();
  });

  it("allows only bounded, content-free manual-metrics dimensions", () => {
    const base = { eventId: "10000000-0000-4000-8000-000000000004", workspaceHash: "a".repeat(20), userHash: "b".repeat(20), occurredAt: new Date().toISOString() };
    expect(analyticsEventSchema.parse({ ...base, name: "manual_metrics_imported", properties: { rowCountBucket: "two_to_ten", qualityStates: ["current", "unknown"] } })).toBeTruthy();
    expect(analyticsEventSchema.parse({ ...base, name: "funnel_saved", properties: { version: "first", includedStageCount: 3 } })).toBeTruthy();
    expect(() => analyticsEventSchema.parse({ ...base, name: "manual_metrics_imported", properties: { rowCountBucket: "two_to_ten", qualityStates: ["current"], filename: "private.csv" } })).toThrow();
    expect(() => analyticsEventSchema.parse({ ...base, name: "metric_definition_saved", properties: { version: "first", unit: "count", aggregation: "count", metricName: "Private activation" } })).toThrow();
  });
});
