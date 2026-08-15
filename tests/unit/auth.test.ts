import { describe, expect, it } from "vitest";

import { AuthenticationError, resolveIdentity, type SessionVerifier } from "@/auth/identity";
import { safeReturnPath } from "@/auth/redirect";

const verified = {
  userId: "founder-a",
  sessionId: "session-a",
  expiresAt: 2_000,
};

describe("session identity", () => {
  it("accepts a current verified session without accepting a client role", async () => {
    const verifier: SessionVerifier = { verify: async () => verified };
    await expect(resolveIdentity(verifier, 1_000)).resolves.toEqual(verified);
    expect(verified).not.toHaveProperty("workspaceRole");
  });

  it("fails closed for missing, expired, and revoked sessions", async () => {
    await expect(resolveIdentity({ verify: async () => null }, 1_000)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(resolveIdentity({ verify: async () => ({ ...verified, expiresAt: 999 }) }, 1_000)).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
    await expect(resolveIdentity({ verify: async () => { throw new Error("revoked"); } }, 1_000)).rejects.toEqual(new AuthenticationError("SESSION_REVOKED"));
  });
});

describe("authentication return path", () => {
  it.each(["https://evil.test", "//evil.test/path", "/\\evil.test"])("rejects an open redirect: %s", (value) => {
    expect(safeReturnPath(value)).toBe("/onboarding");
  });

  it("retains a local path and query", () => {
    expect(safeReturnPath("/onboarding?step=objective")).toBe("/onboarding?step=objective");
  });
});
