import { createHash } from "node:crypto";
import { z } from "zod";

import { ApplicationError } from "./errors";

export const mutationEnvelopeSchema = z.object({
  requestId: z.uuid(),
  workspaceId: z.uuid(),
  idempotencyKey: z.string().trim().min(8).max(128),
  expectedVersion: z.number().int().nonnegative().optional(),
});

export type MutationEnvelope = z.infer<typeof mutationEnvelopeSchema>;

export interface IdempotencyStore {
  runOnce<T>(
    scope: { workspaceId: string; key: string; requestHash: string },
    effect: () => Promise<T>,
  ): Promise<{ value: T; replayed: boolean }>;
}

interface MemoryReceipt {
  requestHash: string;
  result: Promise<unknown>;
}

export class MemoryIdempotencyStore implements IdempotencyStore {
  private readonly receipts = new Map<string, MemoryReceipt>();

  async runOnce<T>(
    scope: { workspaceId: string; key: string; requestHash: string },
    effect: () => Promise<T>,
  ) {
    const receiptKey = `${scope.workspaceId}:${scope.key}`;
    const existing = this.receipts.get(receiptKey);
    if (existing) {
      if (existing.requestHash !== scope.requestHash) {
        throw new ApplicationError(
          "IDEMPOTENCY_CONFLICT",
          "Idempotency key was reused with a different request.",
        );
      }
      return { value: (await existing.result) as T, replayed: true };
    }

    const result = effect();
    this.receipts.set(receiptKey, { requestHash: scope.requestHash, result });
    try {
      return { value: await result, replayed: false };
    } catch (error) {
      this.receipts.delete(receiptKey);
      throw error;
    }
  }
}

export async function executeMutation<T>(input: {
  envelope: unknown;
  action: string;
  payload: unknown;
  store: IdempotencyStore;
  authorize: (workspaceId: string) => Promise<void>;
  effect: (envelope: MutationEnvelope) => Promise<T>;
}) {
  const parsed = mutationEnvelopeSchema.safeParse(input.envelope);
  if (!parsed.success) {
    throw new ApplicationError("VALIDATION_FAILED", "Malformed mutation envelope.");
  }
  const envelope = parsed.data;
  await input.authorize(envelope.workspaceId);

  const requestHash = stableHash({
    workspaceId: envelope.workspaceId,
    action: input.action,
    expectedVersion: envelope.expectedVersion,
    payload: input.payload,
  });

  const result = await input.store.runOnce(
    { workspaceId: envelope.workspaceId, key: envelope.idempotencyKey, requestHash },
    () => input.effect(envelope),
  );

  return { ...result, requestId: envelope.requestId };
}

export function stableHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}
