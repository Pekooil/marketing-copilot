import { z } from "zod";

import { assertWorkspaceHasActiveOwner, type MembershipRole, type MembershipState } from "./tenancy";

export type WorkspaceAction = "read" | "switch" | "update" | "manage_members";

export interface WorkspaceRecord {
  id: string;
  name: string;
  slug: string;
  createdBy: string;
  revision: number;
}

export interface WorkspaceMembership extends MembershipState {
  workspaceId: string;
}

export interface WorkspaceRepository {
  createWithOwner(input: { userId: string; name: string; slug: string }): Promise<WorkspaceRecord>;
  findWorkspace(workspaceId: string): Promise<WorkspaceRecord | null>;
  findActiveMembership(userId: string, workspaceId: string): Promise<WorkspaceMembership | null>;
  listActiveMemberships(workspaceId: string): Promise<WorkspaceMembership[]>;
  listWorkspacesForUser(userId: string): Promise<WorkspaceRecord[]>;
  updateWorkspace(input: { workspaceId: string; name: string; expectedRevision: number }): Promise<WorkspaceRecord>;
  updateMembership(input: { workspaceId: string; userId: string; role?: MembershipRole; status?: "active" | "inactive" }): Promise<void>;
}

export class WorkspaceAccessError extends Error {
  readonly code = "WORKSPACE_NOT_FOUND_OR_FORBIDDEN";

  constructor() {
    super("Workspace not found or access is not permitted.");
  }
}

export class WorkspaceConflictError extends Error {
  readonly code = "WORKSPACE_CONFLICT";
}

const createWorkspaceSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(63),
});

const updateWorkspaceSchema = z.object({
  name: z.string().trim().min(1).max(120),
  expectedRevision: z.number().int().positive(),
});

export function canPerformWorkspaceAction(role: MembershipRole, action: WorkspaceAction) {
  if (action === "read" || action === "switch") return true;
  return role === "owner";
}

export function createWorkspaceService(repository: WorkspaceRepository) {
  async function authorize(userId: string, workspaceId: string, action: WorkspaceAction) {
    const membership = await repository.findActiveMembership(userId, workspaceId);
    if (!membership || !canPerformWorkspaceAction(membership.role, action)) {
      throw new WorkspaceAccessError();
    }
    return membership;
  }

  return {
    async create(userId: string, input: unknown) {
      const data = createWorkspaceSchema.parse(input);
      return repository.createWithOwner({ userId, ...data });
    },

    list(userId: string) {
      return repository.listWorkspacesForUser(userId);
    },

    async get(userId: string, workspaceId: string) {
      await authorize(userId, workspaceId, "read");
      const workspace = await repository.findWorkspace(workspaceId);
      if (!workspace) throw new WorkspaceAccessError();
      return workspace;
    },

    async update(userId: string, workspaceId: string, input: unknown) {
      await authorize(userId, workspaceId, "update");
      const data = updateWorkspaceSchema.parse(input);
      return repository.updateWorkspace({ workspaceId, ...data });
    },

    async changeMembership(
      actorId: string,
      workspaceId: string,
      targetUserId: string,
      change: { role?: MembershipRole; status?: "active" | "inactive" },
    ) {
      await authorize(actorId, workspaceId, "manage_members");
      const memberships = await repository.listActiveMemberships(workspaceId);
      const projected = memberships.map((membership) =>
        membership.userId === targetUserId ? { ...membership, ...change } : membership,
      );
      assertWorkspaceHasActiveOwner(projected);
      await repository.updateMembership({ workspaceId, userId: targetUserId, ...change });
    },
  };
}
