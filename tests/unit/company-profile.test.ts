import { beforeEach, describe, expect, it } from "vitest";

import {
  createCompanyProfileService,
  ProfileVerificationError,
  ProfileVersionConflictError,
  type CompanyProfileRepository,
  type CompanyProfileVersion,
  type ProfileAuthor,
} from "@/domain/company-profile";

class MemoryProfiles implements CompanyProfileRepository {
  versions: CompanyProfileVersion[] = [];
  async current(workspaceId: string) { return this.versions.filter((item) => item.workspaceId === workspaceId).at(-1) ?? null; }
  async history(workspaceId: string) { return this.versions.filter((item) => item.workspaceId === workspaceId); }
  async append(input: Parameters<CompanyProfileRepository["append"]>[0]) {
    const version = { id: `version-${this.versions.length + 1}`, profileId: `profile-${input.workspaceId}`, ...input, version: input.expectedVersion + 1 };
    this.versions.push(version);
    return version;
  }
}

const founder: ProfileAuthor = { actorId: "founder-a", actorType: "founder" };
const payload = {
  companyName: { value: "Acme", verificationState: "founder_provided", confidence: 1, evidenceIds: [] },
};

describe("versioned Company Profile", () => {
  let repository: MemoryProfiles;
  let service: ReturnType<typeof createCompanyProfileService>;

  beforeEach(() => {
    repository = new MemoryProfiles();
    service = createCompanyProfileService(repository, async (actorId, workspaceId) => {
      if (actorId !== "founder-a" || workspaceId !== "workspace-a") throw new Error("forbidden");
    });
  });

  it("creates a minimal manual profile and monotonic edit history", async () => {
    const first = await service.createManual("workspace-a", payload, founder);
    const second = await service.edit("workspace-a", 1, { ...payload, productSummary: { value: "Analytics", verificationState: "founder_provided", confidence: 1, evidenceIds: [] } }, founder);
    expect([first.version, second.version]).toEqual([1, 2]);
    await expect(service.history("founder-a", "workspace-a")).resolves.toHaveLength(2);
  });

  it("rejects optimistic conflicts", async () => {
    await service.createManual("workspace-a", payload, founder);
    await expect(service.edit("workspace-a", 0, payload, founder)).rejects.toBeInstanceOf(ProfileVersionConflictError);
  });

  it("prevents an agent from claiming founder verification", async () => {
    const verified = { companyName: { ...payload.companyName, verificationState: "founder_verified" } };
    await expect(service.createManual("workspace-a", verified, { actorId: "founder-a", actorType: "agent" })).rejects.toBeInstanceOf(ProfileVerificationError);
  });

  it("requires an attributable founder decision for verification", async () => {
    const verified = { companyName: { ...payload.companyName, verificationState: "founder_verified" } };
    await expect(service.createManual("workspace-a", verified, founder)).rejects.toBeInstanceOf(ProfileVerificationError);
    await expect(service.createManual("workspace-a", verified, { ...founder, founderDecisionRef: "decision-1" })).resolves.toMatchObject({ version: 1 });
  });

  it("enforces tenant authorization before reading history", async () => {
    await expect(service.history("founder-b", "workspace-a")).rejects.toThrow("forbidden");
  });
});
