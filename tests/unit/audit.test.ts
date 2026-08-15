import { describe, expect, it, vi } from "vitest";

import { validateAuditEvent, type AuditEventInput, type AuditTransactionRunner } from "@/domain/audit";
import { executeAuditedMutation } from "@/domain/audited-mutation";
import { ApplicationError } from "@/domain/errors";
import { MemoryIdempotencyStore } from "@/domain/mutation";

const baseEvent: AuditEventInput = {
  workspaceId: "a0000000-0000-4000-8000-000000000001",
  actorType: "founder",
  actorId: "founder-a",
  action: "objective.edit",
  targetType: "objective",
  targetId: "objective-a",
  targetVersion: 2,
  requestId: "10000000-0000-4000-8000-000000000001",
  result: "succeeded",
  metadata: { changed_field_category: "target" },
};

function memoryRunner(events: AuditEventInput[]): AuditTransactionRunner {
  return {
    async run(work) {
      const pending: AuditEventInput[] = [];
      const result = await work({ appendAudit: async (event) => { pending.push(event); } });
      events.push(...pending);
      return result;
    },
  };
}

describe("audit pipeline", () => {
  it("accepts bounded metadata and rejects secret/content keys", () => {
    expect(validateAuditEvent(baseEvent)).toEqual(baseEvent);
    expect(() => validateAuditEvent({ ...baseEvent, metadata: { access_token: "secret" } })).toThrow("not permitted");
    expect(() => validateAuditEvent({ ...baseEvent, metadata: { goal_content: "private" } })).toThrow("not permitted");
  });

  it("records a successful mutation in its transaction", async () => {
    const events: AuditEventInput[] = [];
    const result = await executeAuditedMutation({
      envelope: { requestId: baseEvent.requestId, workspaceId: baseEvent.workspaceId, idempotencyKey: "audit-success-1", expectedVersion: 1 },
      action: baseEvent.action,
      payload: { changed: true },
      actor: { actorType: "founder", actorId: "founder-a" },
      target: { targetType: "objective", targetId: "objective-a", targetVersion: 2 },
      metadata: baseEvent.metadata,
      store: new MemoryIdempotencyStore(),
      transaction: memoryRunner(events),
      authorize: async () => {},
      effect: async () => ({ version: 2 }),
    });
    expect(result.value).toEqual({ version: 2 });
    expect(events).toMatchObject([{ result: "succeeded", requestId: baseEvent.requestId }]);
  });

  it("records authorization denial without running the domain effect", async () => {
    const events: AuditEventInput[] = [];
    const effect = vi.fn();
    await expect(executeAuditedMutation({
      envelope: { requestId: baseEvent.requestId, workspaceId: baseEvent.workspaceId, idempotencyKey: "audit-denial-1" },
      action: baseEvent.action,
      payload: {},
      actor: { actorType: "founder", actorId: "founder-b" },
      target: { targetType: "objective", targetId: "objective-a", targetVersion: 2 },
      store: new MemoryIdempotencyStore(),
      transaction: memoryRunner(events),
      authorize: async () => { throw new ApplicationError("FORBIDDEN_OR_NOT_FOUND", "denied"); },
      effect,
    })).rejects.toMatchObject({ code: "FORBIDDEN_OR_NOT_FOUND" });
    expect(effect).not.toHaveBeenCalled();
    expect(events).toMatchObject([{ result: "denied", actorId: "founder-b" }]);
  });
});
