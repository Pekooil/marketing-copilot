"use server";

import { revalidatePath } from "next/cache";

import { requireIdentity } from "@/auth/require-identity";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createLogger } from "@/observability/logger";
import { extractProductUnderstanding } from "@/product-understanding/extractor";
import {
  PublicPageFetchError,
  fetchPublicPage,
} from "@/product-understanding/fetch-public-page";
import {
  analyzeProductUrlInputSchema,
  productUnderstandingStateSchema,
  verifyProductUnderstandingInputSchema,
  type AnalyzeProductUrlInput,
  type ProductUnderstandingActionResult,
  type ProductUnderstandingState,
  type VerifyProductUnderstandingInput,
} from "@/product-understanding/schema";
import { UnsafeProductUrlError } from "@/product-understanding/url-policy";

const logger = createLogger();
const extractorVersion = "deterministic-html-v1";

export async function loadProductUnderstandingState(
  workspaceId: string,
): Promise<ProductUnderstandingState> {
  await requireIdentity();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("get_product_understanding_state", {
    p_workspace_id: workspaceId,
  });
  if (error) {
    logger.error({ event: "product_understanding.load", result: "failed", errorClass: error.code });
    throw new Error("Product understanding could not be loaded.");
  }
  return productUnderstandingStateSchema.parse(data);
}

export async function analyzeProductUrl(
  rawInput: AnalyzeProductUrlInput,
): Promise<ProductUnderstandingActionResult> {
  const input = analyzeProductUrlInputSchema.safeParse(rawInput);
  if (!input.success) {
    return {
      ok: false,
      fieldErrors: { url: input.error.issues[0]?.message ?? "Enter a valid public HTTPS URL." },
      message: "Review the product URL.",
    };
  }

  const startedAt = Date.now();
  try {
    await requireIdentity();
    const page = await fetchPublicPage(input.data.url);
    const extracted = extractProductUnderstanding(page.html);
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc("save_product_understanding_proposal", {
      p_workspace_id: input.data.workspaceId,
      p_request_id: input.data.requestId,
      p_idempotency_key: input.data.idempotencyKey,
      p_requested_url: page.requestedUrl,
      p_final_url: page.finalUrl,
      p_content_hash: page.contentHash,
      p_observed_at: page.observedAt,
      p_source_metadata: {
        title: extracted.title,
        redirectCount: page.redirectCount,
        retainedRawBody: false,
      },
      p_candidate_payload: extracted.proposal,
      p_extractor_version: extractorVersion,
    });
    if (error) {
      logger.warn({ event: "product_understanding.analyze", result: "failed", errorClass: error.code });
      return { ok: false, message: mutationMessage(error.code) };
    }
    const state = productUnderstandingStateSchema.parse(data);
    logger.info({ event: "product_understanding.analyze", result: "succeeded", durationMs: Date.now() - startedAt });
    revalidatePath("/product-understanding");
    return { ok: true, state };
  } catch (error) {
    logger.warn({
      event: "product_understanding.analyze",
      result: "failed",
      durationMs: Date.now() - startedAt,
      errorClass: error instanceof Error ? error.constructor.name : "UNKNOWN_ERROR",
    });
    if (error instanceof UnsafeProductUrlError) {
      return { ok: false, fieldErrors: { url: error.message }, message: "This URL cannot be analyzed safely." };
    }
    if (error instanceof PublicPageFetchError) {
      return { ok: false, fieldErrors: { url: error.message }, message: "The public page could not be read." };
    }
    return { ok: false, message: "The page could not be analyzed. No profile changes were made." };
  }
}

export async function verifyProductUnderstanding(
  rawInput: VerifyProductUnderstandingInput,
): Promise<ProductUnderstandingActionResult> {
  const input = verifyProductUnderstandingInputSchema.safeParse(rawInput);
  if (!input.success) {
    const fieldErrors = Object.fromEntries(
      input.error.issues.map((issue) => [String(issue.path[0] ?? "form"), issue.message]),
    );
    return { ok: false, fieldErrors, message: "Review the highlighted profile fields." };
  }

  try {
    await requireIdentity();
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc("verify_product_understanding", {
      p_workspace_id: input.data.workspaceId,
      p_proposal_id: input.data.proposalId,
      p_expected_profile_version: input.data.expectedProfileVersion,
      p_company_name: input.data.companyName,
      p_product_summary: input.data.productSummary,
      p_target_customer: input.data.targetCustomer,
      p_request_id: input.data.requestId,
      p_idempotency_key: input.data.idempotencyKey,
    });
    if (error) {
      logger.warn({ event: "product_understanding.verify", result: "failed", errorClass: error.code });
      return { ok: false, message: mutationMessage(error.code) };
    }
    const state = productUnderstandingStateSchema.parse(data);
    logger.info({ event: "product_understanding.verify", result: "succeeded" });
    revalidatePath("/product-understanding");
    return { ok: true, state };
  } catch (error) {
    logger.warn({ event: "product_understanding.verify", result: "failed", errorClass: error instanceof Error ? error.constructor.name : "UNKNOWN_ERROR" });
    return { ok: false, message: "Verification could not be saved. Your edits remain on this page." };
  }
}

function mutationMessage(code: string) {
  if (code === "42501") return "That workspace is unavailable. Refresh and try again.";
  if (code === "40001") return "The company profile changed in another session. Refresh before verifying.";
  if (code === "23505") return "This request conflicts with an earlier save. Try again.";
  return "The product understanding could not be saved. No verified context was changed.";
}
