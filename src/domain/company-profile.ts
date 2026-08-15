import { z } from "zod";

export const verificationStateSchema = z.enum([
  "unverified",
  "founder_provided",
  "evidence_supported",
  "founder_verified",
]);

const profileFieldSchema = z.object({
  value: z.string().trim().min(1).max(2_000),
  verificationState: verificationStateSchema,
  confidence: z.number().min(0).max(1),
  evidenceIds: z.array(z.string().trim().min(1)).max(20).default([]),
});

export const companyProfilePayloadSchema = z.object({
  companyName: profileFieldSchema,
  website: profileFieldSchema.optional(),
  productSummary: profileFieldSchema.optional(),
  targetCustomer: profileFieldSchema.optional(),
});

export type CompanyProfilePayload = z.infer<typeof companyProfilePayloadSchema>;

export interface ProfileAuthor {
  actorId: string;
  actorType: "founder" | "agent" | "worker";
  founderDecisionRef?: string;
}

export interface CompanyProfileVersion {
  id: string;
  profileId: string;
  workspaceId: string;
  version: number;
  payload: CompanyProfilePayload;
  author: ProfileAuthor;
}

export interface CompanyProfileRepository {
  current(workspaceId: string): Promise<CompanyProfileVersion | null>;
  append(input: {
    workspaceId: string;
    expectedVersion: number;
    payload: CompanyProfilePayload;
    author: ProfileAuthor;
  }): Promise<CompanyProfileVersion>;
  history(workspaceId: string): Promise<CompanyProfileVersion[]>;
}

export class ProfileVerificationError extends Error {
  readonly code = "PROFILE_VERIFICATION_INVALID";
}

export class ProfileVersionConflictError extends Error {
  readonly code = "PROFILE_VERSION_CONFLICT";
}

export function validateProfileVerification(payload: CompanyProfilePayload, author: ProfileAuthor) {
  const fields = Object.values(payload);
  const claimsFounderVerification = fields.some(
    (field) => field?.verificationState === "founder_verified",
  );
  if (
    claimsFounderVerification &&
    (author.actorType !== "founder" || !author.founderDecisionRef?.trim())
  ) {
    throw new ProfileVerificationError(
      "Founder-verified fields require a founder-authored decision reference.",
    );
  }
}

export function createCompanyProfileService(
  repository: CompanyProfileRepository,
  authorizeWorkspace: (actorId: string, workspaceId: string) => Promise<void>,
) {
  async function save(
    workspaceId: string,
    expectedVersion: number,
    input: unknown,
    author: ProfileAuthor,
  ) {
    await authorizeWorkspace(author.actorId, workspaceId);
    const payload = companyProfilePayloadSchema.parse(input);
    validateProfileVerification(payload, author);

    const current = await repository.current(workspaceId);
    const actualVersion = current?.version ?? 0;
    if (actualVersion !== expectedVersion) {
      throw new ProfileVersionConflictError(
        `Expected version ${expectedVersion}; current version is ${actualVersion}.`,
      );
    }

    return repository.append({ workspaceId, expectedVersion, payload, author });
  }

  return {
    createManual(workspaceId: string, input: unknown, author: ProfileAuthor) {
      return save(workspaceId, 0, input, author);
    },
    edit(
      workspaceId: string,
      expectedVersion: number,
      input: unknown,
      author: ProfileAuthor,
    ) {
      return save(workspaceId, expectedVersion, input, author);
    },
    async history(actorId: string, workspaceId: string) {
      await authorizeWorkspace(actorId, workspaceId);
      return repository.history(workspaceId);
    },
  };
}
