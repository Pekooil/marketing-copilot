import { beforeEach, describe, expect, it } from "vitest";

import {
  canPerformWorkspaceAction,
  createWorkspaceService,
  WorkspaceAccessError,
  type WorkspaceMembership,
  type WorkspaceRecord,
  type WorkspaceRepository,
} from "@/domain/workspace";

class MemoryWorkspaceRepository implements WorkspaceRepository {
  workspaces: WorkspaceRecord[] = [];
  memberships: WorkspaceMembership[] = [];

  async createWithOwner(input: { userId: string; name: string; slug: string }) {
    const workspace = { id: `workspace-${this.workspaces.length + 1}`, ...input, createdBy: input.userId, revision: 1 };
    this.workspaces.push(workspace);
    this.memberships.push({ workspaceId: workspace.id, userId: input.userId, role: "owner", status: "active" });
    return workspace;
  }

  async findWorkspace(id: string) { return this.workspaces.find((workspace) => workspace.id === id) ?? null; }
  async findActiveMembership(userId: string, workspaceId: string) {
    return this.memberships.find((membership) => membership.userId === userId && membership.workspaceId === workspaceId && membership.status === "active") ?? null;
  }
  async listActiveMemberships(workspaceId: string) { return this.memberships.filter((membership) => membership.workspaceId === workspaceId && membership.status === "active"); }
  async listWorkspacesForUser(userId: string) {
    const ids = new Set(this.memberships.filter((membership) => membership.userId === userId && membership.status === "active").map(({ workspaceId }) => workspaceId));
    return this.workspaces.filter(({ id }) => ids.has(id));
  }
  async updateWorkspace(input: { workspaceId: string; name: string; expectedRevision: number }) {
    const workspace = await this.findWorkspace(input.workspaceId);
    if (!workspace || workspace.revision !== input.expectedRevision) throw new Error("conflict");
    workspace.name = input.name;
    workspace.revision += 1;
    return workspace;
  }
  async updateMembership(input: { workspaceId: string; userId: string; role?: "owner" | "member"; status?: "active" | "inactive" }) {
    const membership = this.memberships.find((item) => item.workspaceId === input.workspaceId && item.userId === input.userId);
    if (!membership) throw new WorkspaceAccessError();
    Object.assign(membership, input);
  }
}

describe("workspace authorization", () => {
  let repository: MemoryWorkspaceRepository;
  let service: ReturnType<typeof createWorkspaceService>;

  beforeEach(async () => {
    repository = new MemoryWorkspaceRepository();
    service = createWorkspaceService(repository);
    const workspace = await service.create("owner-a", { name: "Alpha", slug: "alpha" });
    repository.memberships.push({ workspaceId: workspace.id, userId: "member-a", role: "member", status: "active" });
    await service.create("owner-b", { name: "Beta", slug: "beta" });
  });

  it("uses an explicit role/action matrix", () => {
    expect(canPerformWorkspaceAction("member", "read")).toBe(true);
    expect(canPerformWorkspaceAction("member", "switch")).toBe(true);
    expect(canPerformWorkspaceAction("member", "update")).toBe(false);
    expect(canPerformWorkspaceAction("owner", "manage_members")).toBe(true);
  });

  it("lists and switches only among the caller's active workspaces", async () => {
    await expect(service.list("owner-a")).resolves.toHaveLength(1);
    await expect(service.get("owner-a", "workspace-1")).resolves.toMatchObject({ name: "Alpha" });
    await expect(service.get("owner-a", "workspace-2")).rejects.toEqual(new WorkspaceAccessError());
  });

  it("returns the same response for missing and forbidden workspace IDs", async () => {
    await expect(service.get("outsider", "workspace-1")).rejects.toMatchObject({ code: "WORKSPACE_NOT_FOUND_OR_FORBIDDEN" });
    await expect(service.get("outsider", "missing")).rejects.toMatchObject({ code: "WORKSPACE_NOT_FOUND_OR_FORBIDDEN" });
  });

  it("denies inactive memberships and member updates", async () => {
    repository.memberships.find(({ userId }) => userId === "member-a")!.status = "inactive";
    await expect(service.get("member-a", "workspace-1")).rejects.toBeInstanceOf(WorkspaceAccessError);
    repository.memberships.find(({ userId }) => userId === "member-a")!.status = "active";
    await expect(service.update("member-a", "workspace-1", { name: "Changed", expectedRevision: 1 })).rejects.toBeInstanceOf(WorkspaceAccessError);
  });

  it("protects the last active owner", async () => {
    await expect(service.changeMembership("owner-a", "workspace-1", "owner-a", { status: "inactive" })).rejects.toThrow("at least one active owner");
  });
});
