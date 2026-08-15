import { z } from "zod";

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

export const objectiveDraftSchema = z.object({
  metricName: z.string().trim().max(120).optional(),
  metricDefinition: z.string().trim().max(1_000).optional(),
  direction: z.enum(["increase", "decrease"]).optional(),
  targetValue: z.number().finite().optional(),
  baselineState: z.enum(["known", "unknown"]).default("unknown"),
  baselineValue: z.number().finite().nullable().optional(),
  deadline: z.string().regex(isoDate).optional(),
  targetSegment: z.string().trim().max(500).optional(),
  rationale: z.string().trim().max(1_000).optional(),
});

export type ObjectiveDraft = z.infer<typeof objectiveDraftSchema>;
export type ObjectiveStatus = "draft" | "active" | "superseded";

export interface ObjectiveVersion {
  id: string;
  objectiveId: string;
  workspaceId: string;
  version: number;
  data: ObjectiveDraft;
  createdBy: string;
}

export interface ObjectiveRecord {
  id: string;
  workspaceId: string;
  status: ObjectiveStatus;
  current: ObjectiveVersion;
}

export interface ObjectiveRepository {
  createDraft(input: { workspaceId: string; data: ObjectiveDraft; createdBy: string }): Promise<ObjectiveRecord>;
  appendDraft(input: { objectiveId: string; workspaceId: string; expectedVersion: number; data: ObjectiveDraft; createdBy: string }): Promise<ObjectiveRecord>;
  activateAndSupersede(input: { objectiveId: string; workspaceId: string; expectedVersion: number }): Promise<ObjectiveRecord>;
  history(objectiveId: string, workspaceId: string): Promise<ObjectiveVersion[]>;
}

export type ObjectiveField = keyof ObjectiveDraft;

export class ObjectiveValidationError extends Error {
  readonly code = "OBJECTIVE_VALIDATION_FAILED";
  constructor(readonly fieldErrors: Partial<Record<ObjectiveField, string>>) {
    super("Objective is not measurable enough to activate.");
  }
}

export class ObjectiveVersionConflictError extends Error {
  readonly code = "OBJECTIVE_VERSION_CONFLICT";
}

export function validateObjectiveForActivation(
  draft: ObjectiveDraft,
  today = new Date().toISOString().slice(0, 10),
) {
  const errors: Partial<Record<ObjectiveField, string>> = {};
  if (!draft.metricName?.trim()) errors.metricName = "Name the metric.";
  if (!draft.metricDefinition?.trim()) errors.metricDefinition = "Define exactly how the metric is calculated.";
  if (!draft.direction) errors.direction = "Choose whether the metric should increase or decrease.";
  if (draft.targetValue === undefined) errors.targetValue = "Enter a numeric target.";
  if (!draft.deadline || draft.deadline <= today) errors.deadline = "Choose a future deadline.";
  if (!draft.targetSegment?.trim()) errors.targetSegment = "Define the target segment.";
  if (!draft.rationale?.trim()) errors.rationale = "Explain why this objective matters.";

  if (draft.baselineState === "known" && draft.baselineValue == null) {
    errors.baselineValue = "Enter the known baseline, including zero when zero is observed.";
  }
  if (draft.baselineState === "unknown" && draft.baselineValue != null) {
    errors.baselineValue = "An unknown baseline cannot include a numeric value.";
  }
  if (
    draft.baselineState === "known" &&
    draft.baselineValue != null &&
    draft.targetValue !== undefined &&
    ((draft.direction === "increase" && draft.targetValue <= draft.baselineValue) ||
      (draft.direction === "decrease" && draft.targetValue >= draft.baselineValue))
  ) {
    errors.targetValue = `Target must ${draft.direction} from the baseline.`;
  }

  if (Object.keys(errors).length > 0) throw new ObjectiveValidationError(errors);
  return draft;
}

export function createObjectiveService(
  repository: ObjectiveRepository,
  authorizeWorkspace: (actorId: string, workspaceId: string) => Promise<void>,
) {
  return {
    async createDraft(actorId: string, workspaceId: string, input: unknown) {
      await authorizeWorkspace(actorId, workspaceId);
      return repository.createDraft({ workspaceId, createdBy: actorId, data: objectiveDraftSchema.parse(input) });
    },
    async editDraft(actorId: string, objectiveId: string, workspaceId: string, expectedVersion: number, input: unknown) {
      await authorizeWorkspace(actorId, workspaceId);
      return repository.appendDraft({ objectiveId, workspaceId, expectedVersion, createdBy: actorId, data: objectiveDraftSchema.parse(input) });
    },
    async activate(actorId: string, objective: ObjectiveRecord, today?: string) {
      await authorizeWorkspace(actorId, objective.workspaceId);
      validateObjectiveForActivation(objective.current.data, today);
      return repository.activateAndSupersede({ objectiveId: objective.id, workspaceId: objective.workspaceId, expectedVersion: objective.current.version });
    },
    async history(actorId: string, objectiveId: string, workspaceId: string) {
      await authorizeWorkspace(actorId, workspaceId);
      return repository.history(objectiveId, workspaceId);
    },
  };
}
