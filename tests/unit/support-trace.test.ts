import { describe, expect, it, vi } from "vitest";

import type { AuditEventInput, AuditTransactionRunner } from "@/domain/audit";
import {
  lookupSupportTrace,
  SupportAccessError,
  type SupportTraceRepository,
} from "@/domain/support-trace";

const request = {
  supportActorId: "support-1",
  workspaceId: "a0000000-0000-4000-8000-000000000001",
  requestId: "10000000-0000-4000-8000-000000000001",
};

function auditRunner(events: AuditEventInput[]): AuditTransactionRunner {
  return {
    async run(work) {
      return work({ appendAudit: async (event) => { events.push(event); } });
    },
  };
}

describe("workspace-scoped support trace", () => {
  it("queries only the authorized workspace/request and audits access", async () => {
    const events: AuditEventInput[] = [];
    const findByWorkspaceAndRequest = vi.fn(async () => [
      { source: "audit" as const, action: "objective.edit", result: "succeeded", timestamp: "2026-08-15T00:00:00Z", reference: "audit-1" },
    ]);
    const repository: SupportTraceRepository = {
      findActiveGrant: async () => ({ workspaceId: request.workspaceId, supportActorId: request.supportActorId, expiresAt: new Date("2026-08-16T00:00:00Z"), revokedAt: null }),
      findByWorkspaceAndRequest,
    };
    const trace = await lookupSupportTrace({ request, repository, audit: auditRunner(events), now: new Date("2026-08-15T00:00:00Z") });
    expect(trace).toHaveLength(1);
    expect(findByWorkspaceAndRequest).toHaveBeenCalledWith(request.workspaceId, request.requestId);
    expect(events).toMatchObject([{ actorType: "support", action: "support.trace.read", workspaceId: request.workspaceId }]);
  });

  it("denies absent, expired, and revoked authorization before trace lookup", async () => {
    const lookup = vi.fn();
    for (const grant of [null, { workspaceId: request.workspaceId, supportActorId: request.supportActorId, expiresAt: new Date("2026-08-14T00:00:00Z"), revokedAt: null }, { workspaceId: request.workspaceId, supportActorId: request.supportActorId, expiresAt: new Date("2026-08-16T00:00:00Z"), revokedAt: new Date("2026-08-15T00:00:00Z") }]) {
      await expect(lookupSupportTrace({ request, repository: { findActiveGrant: async () => grant, findByWorkspaceAndRequest: lookup }, audit: auditRunner([]), now: new Date("2026-08-15T12:00:00Z") })).rejects.toBeInstanceOf(SupportAccessError);
    }
    expect(lookup).not.toHaveBeenCalled();
  });
});
