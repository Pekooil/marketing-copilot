export type DatabaseAction = "select" | "insert" | "update" | "delete";

export interface TenantAccessContext {
  actor: "authenticated" | "worker" | "anonymous";
  actorUserId?: string;
  memberUserIds?: readonly string[];
  ownerUserIds?: readonly string[];
  workerWorkspaceId?: string;
}

export function allowsTenantRow(
  context: TenantAccessContext,
  action: DatabaseAction,
  rowWorkspaceId: string,
) {
  if (context.actor === "anonymous") return false;
  if (context.actor === "worker") return context.workerWorkspaceId === rowWorkspaceId;

  const userId = context.actorUserId;
  if (!userId) return false;
  const isMember = context.memberUserIds?.includes(userId) ?? false;
  const isOwner = context.ownerUserIds?.includes(userId) ?? false;
  if (action === "select") return isMember;
  return isOwner;
}
