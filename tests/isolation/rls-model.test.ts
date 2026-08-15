import { describe, expect, it } from "vitest";

import { allowsTenantRow, type DatabaseAction } from "@/security/rls-model";

const actions: DatabaseAction[] = ["select", "insert", "update", "delete"];

describe("two-tenant RLS matrix", () => {
  it("denies every operation for anonymous and cross-tenant callers", () => {
    for (const action of actions) {
      expect(allowsTenantRow({ actor: "anonymous" }, action, "workspace-a")).toBe(false);
      expect(allowsTenantRow({ actor: "authenticated", actorUserId: "founder-b", memberUserIds: [], ownerUserIds: [] }, action, "workspace-a")).toBe(false);
    }
  });

  it("allows members to read and owners to mutate", () => {
    const member = { actor: "authenticated", actorUserId: "member-a", memberUserIds: ["member-a"], ownerUserIds: [] } as const;
    expect(allowsTenantRow(member, "select", "workspace-a")).toBe(true);
    expect(allowsTenantRow(member, "update", "workspace-a")).toBe(false);

    const owner = { ...member, actorUserId: "owner-a", memberUserIds: ["owner-a"], ownerUserIds: ["owner-a"] } as const;
    for (const action of actions) expect(allowsTenantRow(owner, action, "workspace-a")).toBe(true);
  });

  it("requires an exact worker workspace scope", () => {
    const worker = { actor: "worker", workerWorkspaceId: "workspace-a" } as const;
    expect(allowsTenantRow(worker, "select", "workspace-a")).toBe(true);
    expect(allowsTenantRow(worker, "select", "workspace-b")).toBe(false);
    expect(allowsTenantRow({ actor: "worker" }, "select", "workspace-a")).toBe(false);
  });
});
