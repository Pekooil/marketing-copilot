"use server";

import { revalidatePath } from "next/cache";

import { requireIdentity } from "@/auth/require-identity";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  emptyOnboardingState,
  onboardingSaveInputSchema,
  onboardingStateSchema,
  validateOnboardingSave,
  type OnboardingSaveInput,
  type OnboardingSaveResult,
  type OnboardingState,
} from "@/onboarding/schema";
import { createLogger } from "@/observability/logger";

const logger = createLogger();

export async function loadOnboardingState(): Promise<OnboardingState> {
  await requireIdentity();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("get_onboarding_state", {
    p_workspace_id: null,
  });

  if (error) {
    logger.error({ event: "onboarding.load", result: "failed", errorClass: error.code });
    throw new Error("Onboarding data could not be loaded.");
  }

  if (data == null) return emptyOnboardingState;
  return onboardingStateSchema.parse(data);
}

export async function saveOnboarding(
  rawInput: OnboardingSaveInput,
): Promise<OnboardingSaveResult> {
  const input = onboardingSaveInputSchema.safeParse(rawInput);
  if (!input.success) {
    return { ok: false, message: "Review the onboarding fields and try again." };
  }

  const fieldErrors = validateOnboardingSave(input.data);
  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors, message: "Review the highlighted fields." };
  }

  try {
    await requireIdentity();
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc("save_onboarding", {
      p_workspace_id: input.data.workspaceId,
      p_step: input.data.step,
      p_activate: input.data.activate,
      p_request_id: input.data.requestId,
      p_idempotency_key: input.data.idempotencyKey,
      p_draft: input.data.draft,
    });

    if (error) {
      logger.warn({ event: "onboarding.save", result: "failed", errorClass: error.code });
      return {
        ok: false,
        message:
          error.code === "42501"
            ? "That workspace is unavailable. Refresh and try again."
            : "Your draft could not be saved. Your entries remain on this page.",
      };
    }

    const state = onboardingStateSchema.parse(data);
    logger.info({
      event: input.data.activate ? "onboarding.activate" : "onboarding.save",
      result: "succeeded",
    });
    revalidatePath("/onboarding");
    return { ok: true, state };
  } catch (error) {
    logger.warn({
      event: "onboarding.save",
      result: "failed",
      errorClass: error instanceof Error ? error.constructor.name : "UNKNOWN_ERROR",
    });
    return {
      ok: false,
      message: "Your draft could not be saved. Your entries remain on this page.",
    };
  }
}
