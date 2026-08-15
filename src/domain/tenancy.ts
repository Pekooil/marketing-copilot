export type MembershipRole = "owner" | "member";
export type MembershipStatus = "active" | "inactive";

export interface MembershipState {
  userId: string;
  role: MembershipRole;
  status: MembershipStatus;
}

export function hasActiveOwner(memberships: readonly MembershipState[]) {
  return memberships.some(({ role, status }) => role === "owner" && status === "active");
}

export function assertWorkspaceHasActiveOwner(memberships: readonly MembershipState[]) {
  if (!hasActiveOwner(memberships)) {
    throw new Error("A workspace must retain at least one active owner.");
  }
}
