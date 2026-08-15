import "server-only";

import { analyticsEventSchema, type AnalyticsEvent, type AnalyticsEventInput } from "./events";
import { privacyHash } from "@/observability/logger";

export interface AnalyticsSink {
  send(event: AnalyticsEvent): Promise<void>;
}

export interface AnalyticsContext {
  workspaceId: string;
  userId: string;
  consent: "granted" | "denied";
  environment: "development" | "test" | "staging" | "production";
}

export function createAnalyticsClient(input: {
  sink: AnalyticsSink;
  enabled: boolean;
  includeDevelopment?: boolean;
}) {
  const emitted = new Set<string>();

  return {
    async trackOnce(
      deduplicationKey: string,
      context: AnalyticsContext,
      event: AnalyticsEventInput,
    ) {
      if (!input.enabled || context.consent !== "granted") return { emitted: false as const };
      if (context.environment === "development" && !input.includeDevelopment) {
        return { emitted: false as const };
      }
      if (emitted.has(deduplicationKey)) return { emitted: false as const };

      const parsed = analyticsEventSchema.parse({
        ...event,
        workspaceHash: privacyHash(context.workspaceId),
        userHash: privacyHash(context.userId),
        occurredAt: new Date().toISOString(),
      });
      await input.sink.send(parsed);
      emitted.add(deduplicationKey);
      return { emitted: true as const };
    },
  };
}
