import { describe, expect, it, vi } from "vitest";

import { ApplicationError, toPublicError } from "@/domain/errors";
import { executeMutation, MemoryIdempotencyStore, stableHash } from "@/domain/mutation";

const envelope = {
  requestId: "10000000-0000-4000-8000-000000000001",
  workspaceId: "a0000000-0000-4000-8000-000000000001",
  idempotencyKey: "save-objective-1",
  expectedVersion: 2,
};

describe("authenticated mutation contract", () => {
  it("produces one domain effect for concurrent duplicate submissions", async () => {
    const store = new MemoryIdempotencyStore();
    const effect = vi.fn(async () => ({ version: 3 }));
    const mutation = () => executeMutation({ envelope, action: "objective.edit", payload: { target: 20 }, store, authorize: async () => {}, effect });
    const [first, duplicate] = await Promise.all([mutation(), mutation()]);
    expect(effect).toHaveBeenCalledTimes(1);
    expect([first.replayed, duplicate.replayed].sort()).toEqual([false, true]);
    expect(first.value).toEqual(duplicate.value);
  });

  it("rejects a retry key used for another payload", async () => {
    const store = new MemoryIdempotencyStore();
    await executeMutation({ envelope, action: "objective.edit", payload: { target: 20 }, store, authorize: async () => {}, effect: async () => "ok" });
    await expect(executeMutation({ envelope, action: "objective.edit", payload: { target: 21 }, store, authorize: async () => {}, effect: async () => "wrong" })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it("authorizes the resolved workspace before the effect", async () => {
    const effect = vi.fn();
    await expect(executeMutation({ envelope, action: "objective.edit", payload: {}, store: new MemoryIdempotencyStore(), authorize: async () => { throw new ApplicationError("FORBIDDEN_OR_NOT_FOUND", "denied"); }, effect })).rejects.toMatchObject({ code: "FORBIDDEN_OR_NOT_FOUND" });
    expect(effect).not.toHaveBeenCalled();
  });

  it("canonicalizes payloads and exposes safe typed errors", () => {
    expect(stableHash({ a: 1, b: 2 })).toBe(stableHash({ b: 2, a: 1 }));
    expect(toPublicError(new ApplicationError("CONFLICT", "internal record detail"), envelope.requestId)).toEqual({
      code: "CONFLICT",
      message: "This record changed. Refresh and review before saving again.",
      fieldErrors: undefined,
      requestId: envelope.requestId,
    });
  });
});
