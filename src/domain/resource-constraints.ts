import { z } from "zod";

const uniqueNonEmptyStrings = z
  .array(z.string().trim().min(1).max(500))
  .max(50)
  .superRefine((items, context) => {
    const normalized = items.map((item) => item.toLocaleLowerCase());
    if (new Set(normalized).size !== normalized.length) {
      context.addIssue({ code: "custom", message: "Entries must be unique." });
    }
  });

export const resourceConstraintsSchema = z.object({
  founderMinutesPerWeek: z.number().int().min(0).max(10_080),
  cashBudgetMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  currency: z.string().regex(/^[A-Z]{3}$/),
  riskTolerance: z.enum(["low", "medium", "high"]),
  prohibitedTactics: uniqueNonEmptyStrings.default([]),
  brandRules: uniqueNonEmptyStrings.default([]),
  audienceLimits: uniqueNonEmptyStrings.default([]),
  geographyLimits: uniqueNonEmptyStrings.default([]),
  approvalPreferences: z.object({
    requirePreparationApproval: z.boolean().default(true),
    requestedActionClasses: z.array(z.enum(["A", "B", "C", "D", "E", "F"])).default([]),
  }),
});

export type ResourceConstraints = z.infer<typeof resourceConstraintsSchema>;
export type ActionClass = "A" | "B" | "C" | "D" | "E" | "F";

export interface ResourceConstraintVersion {
  id: string;
  workspaceId: string;
  objectiveId: string;
  version: number;
  data: ResourceConstraints;
  createdBy: string;
}

export interface ResourceConstraintRepository {
  current(workspaceId: string, objectiveId: string): Promise<ResourceConstraintVersion | null>;
  append(input: { workspaceId: string; objectiveId: string; expectedVersion: number; data: ResourceConstraints; createdBy: string }): Promise<ResourceConstraintVersion>;
  history(workspaceId: string, objectiveId: string): Promise<ResourceConstraintVersion[]>;
}

export class ResourceConstraintConflictError extends Error {
  readonly code = "RESOURCE_CONSTRAINT_CONFLICT";
}

export function isActionClassAllowed(actionClass: ActionClass) {
  return actionClass === "A" || actionClass === "B" || actionClass === "C";
}

export function assertActionClassAllowed(actionClass: ActionClass) {
  if (!isActionClassAllowed(actionClass)) {
    throw new Error(`Action class ${actionClass} is globally prohibited in V1.`);
  }
}

export function createResourceConstraintService(
  repository: ResourceConstraintRepository,
  authorizeWorkspace: (actorId: string, workspaceId: string) => Promise<void>,
) {
  return {
    async save(actorId: string, workspaceId: string, objectiveId: string, expectedVersion: number, input: unknown) {
      await authorizeWorkspace(actorId, workspaceId);
      const data = resourceConstraintsSchema.parse(input);
      const current = await repository.current(workspaceId, objectiveId);
      if ((current?.version ?? 0) !== expectedVersion) {
        throw new ResourceConstraintConflictError("Constraints changed before this save.");
      }
      return repository.append({ workspaceId, objectiveId, expectedVersion, data, createdBy: actorId });
    },
    async history(actorId: string, workspaceId: string, objectiveId: string) {
      await authorizeWorkspace(actorId, workspaceId);
      return repository.history(workspaceId, objectiveId);
    },
  };
}
