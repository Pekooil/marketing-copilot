import { describe, expect, it } from "vitest";

import { assertWorkspaceHasActiveOwner, hasActiveOwner } from "@/domain/tenancy";

describe("workspace ownership invariant", () => {
  const owner = { userId: "founder-a", role: "owner", status: "active" } as const;

  it("accepts a roster with an active owner", () => {
    expect(hasActiveOwner([owner])).toBe(true);
    expect(() => assertWorkspaceHasActiveOwner([owner])).not.toThrow();
  });

  it("rejects inactive owners and active members", () => {
    expect(() =>
      assertWorkspaceHasActiveOwner([
        { ...owner, status: "inactive" },
        { userId: "member", role: "member", status: "active" },
      ]),
    ).toThrow("at least one active owner");
  });
});
