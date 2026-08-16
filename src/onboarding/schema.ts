import { z } from "zod";

import { validateObjectiveForActivation, type ObjectiveDraft } from "@/domain/objective";
import { resourceConstraintsSchema } from "@/domain/resource-constraints";

export const onboardingDraftSchema = z.object({
  workspaceName: z.string().max(120),
  companyName: z.string().max(200),
  productSummary: z.string().max(2_000),
  metricName: z.string().max(120),
  metricDefinition: z.string().max(1_000),
  direction: z.enum(["increase", "decrease"]),
  targetValue: z.string().max(80),
  baselineState: z.enum(["known", "unknown"]),
  baselineValue: z.string().max(80),
  deadline: z.string().max(10),
  targetSegment: z.string().max(500),
  rationale: z.string().max(1_000),
  founderHours: z.string().max(80),
  cashBudget: z.string().max(80),
  currency: z.string().max(3),
  riskTolerance: z.enum(["low", "medium", "high"]),
  prohibitedTactics: z.string().max(5_000),
  brandRules: z.string().max(5_000),
});

export type OnboardingDraft = z.infer<typeof onboardingDraftSchema>;

export const emptyOnboardingDraft: OnboardingDraft = {
  workspaceName: "",
  companyName: "",
  productSummary: "",
  metricName: "",
  metricDefinition: "",
  direction: "increase",
  targetValue: "",
  baselineState: "unknown",
  baselineValue: "",
  deadline: "",
  targetSegment: "",
  rationale: "",
  founderHours: "5",
  cashBudget: "100",
  currency: "USD",
  riskTolerance: "low",
  prohibitedTactics: "",
  brandRules: "",
};

export const onboardingStateSchema = z.object({
  workspaceId: z.uuid().nullable(),
  step: z.number().int().min(0).max(3),
  activated: z.boolean(),
  draft: onboardingDraftSchema,
});

export type OnboardingState = z.infer<typeof onboardingStateSchema>;

export const emptyOnboardingState: OnboardingState = {
  workspaceId: null,
  step: 0,
  activated: false,
  draft: emptyOnboardingDraft,
};

export const onboardingSaveInputSchema = z.object({
  workspaceId: z.uuid().nullable(),
  step: z.number().int().min(0).max(3),
  activate: z.boolean(),
  requestId: z.uuid(),
  idempotencyKey: z.string().min(8).max(128),
  draft: onboardingDraftSchema,
});

export type OnboardingSaveInput = z.infer<typeof onboardingSaveInputSchema>;

export type OnboardingSaveResult =
  | { ok: true; state: OnboardingState }
  | { ok: false; fieldErrors?: Record<string, string>; message: string };

export type SaveOnboardingAction = (
  input: OnboardingSaveInput,
) => Promise<OnboardingSaveResult>;

export function validateOnboardingStep(step: number, draft: OnboardingDraft) {
  if (step === 0) {
    return compactErrors({
      workspaceName: draft.workspaceName.trim() ? "" : "Enter a workspace name.",
      companyName: draft.companyName.trim() ? "" : "Enter a company name.",
      productSummary: draft.productSummary.trim() ? "" : "Describe the product briefly.",
    });
  }

  if (step === 1) {
    const objective = toObjectiveDraft(draft);
    try {
      validateObjectiveForActivation(objective);
      return {};
    } catch (error) {
      return "fieldErrors" in (error as object)
        ? (error as { fieldErrors: Record<string, string> }).fieldErrors
        : { form: "Review the objective." };
    }
  }

  if (step === 2) {
    const result = resourceConstraintsSchema.safeParse(toResourceConstraints(draft));
    if (result.success) return {};
    const flattened = result.error.flatten().fieldErrors;
    return compactErrors({
      founderHours: flattened.founderMinutesPerWeek?.[0] ?? "",
      cashBudget: flattened.cashBudgetMinor?.[0] ?? "",
      currency: flattened.currency?.[0] ?? "",
      prohibitedTactics: flattened.prohibitedTactics?.[0] ?? "",
      brandRules: flattened.brandRules?.[0] ?? "",
    });
  }

  return {};
}

export function validateOnboardingSave(input: OnboardingSaveInput) {
  for (let step = 0; step <= Math.min(input.step, 2); step += 1) {
    const errors = validateOnboardingStep(step, input.draft);
    if (Object.keys(errors).length > 0) return errors;
  }
  return {};
}

export function toObjectiveDraft(draft: OnboardingDraft): ObjectiveDraft {
  return {
    metricName: draft.metricName,
    metricDefinition: draft.metricDefinition,
    direction: draft.direction,
    targetValue: draft.targetValue === "" ? undefined : Number(draft.targetValue),
    baselineState: draft.baselineState,
    baselineValue:
      draft.baselineState === "unknown"
        ? null
        : draft.baselineValue === ""
          ? null
          : Number(draft.baselineValue),
    deadline: draft.deadline,
    targetSegment: draft.targetSegment,
    rationale: draft.rationale,
  };
}

export function toResourceConstraints(draft: OnboardingDraft) {
  return {
    founderMinutesPerWeek: Number(draft.founderHours) * 60,
    cashBudgetMinor: Math.round(Number(draft.cashBudget) * 100),
    currency: draft.currency.toUpperCase(),
    riskTolerance: draft.riskTolerance,
    prohibitedTactics: splitList(draft.prohibitedTactics),
    brandRules: splitList(draft.brandRules),
    audienceLimits: [],
    geographyLimits: [],
    approvalPreferences: {
      requirePreparationApproval: true,
      requestedActionClasses: ["C"],
    },
  };
}

function splitList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function compactErrors(errors: Record<string, string>) {
  return Object.fromEntries(Object.entries(errors).filter(([, value]) => value));
}
