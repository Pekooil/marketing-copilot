import { z } from "zod";

import { productUnderstandingProposalSchema } from "./extractor";
import { productUrlSchema } from "./url-policy";

export const sourceSummarySchema = z.object({
  id: z.uuid(),
  url: z.url(),
  title: z.string().max(300),
  observedAt: z.iso.datetime({ offset: true }),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
});

export const savedProposalSchema = z.object({
  id: z.uuid(),
  createdAt: z.iso.datetime({ offset: true }),
  extractorVersion: z.string().min(1).max(80),
  source: sourceSummarySchema,
  candidate: productUnderstandingProposalSchema,
});

export const verifiedContextSnapshotSchema = z.object({
  id: z.uuid(),
  proposalId: z.uuid(),
  sequence: z.number().int().positive(),
  createdAt: z.iso.datetime({ offset: true }),
  profileVersion: z.number().int().positive(),
  sourceIds: z.array(z.uuid()).min(1).max(20),
  companyProfile: z.object({
    companyName: z.string().min(1).max(200),
    website: z.url(),
    productSummary: z.string().min(1).max(2_000),
    targetCustomer: z.string().max(2_000).optional(),
  }),
});

export const productUnderstandingStateSchema = z.object({
  workspaceId: z.uuid(),
  workspaceName: z.string().min(1).max(120),
  profileVersion: z.number().int().nonnegative(),
  proposal: savedProposalSchema.nullable(),
  verifiedSnapshot: verifiedContextSnapshotSchema.nullable(),
});

export type ProductUnderstandingState = z.infer<
  typeof productUnderstandingStateSchema
>;

export const analyzeProductUrlInputSchema = z.object({
  workspaceId: z.uuid(),
  url: productUrlSchema,
  requestId: z.uuid(),
  idempotencyKey: z.string().min(8).max(128),
});

export const verifyProductUnderstandingInputSchema = z.object({
  workspaceId: z.uuid(),
  proposalId: z.uuid(),
  expectedProfileVersion: z.number().int().nonnegative(),
  companyName: z.string().trim().min(1).max(200),
  productSummary: z.string().trim().min(1).max(2_000),
  targetCustomer: z.string().trim().max(2_000),
  requestId: z.uuid(),
  idempotencyKey: z.string().min(8).max(128),
});

export type AnalyzeProductUrlInput = z.input<typeof analyzeProductUrlInputSchema>;
export type VerifyProductUnderstandingInput = z.input<
  typeof verifyProductUnderstandingInputSchema
>;

export type ProductUnderstandingActionResult =
  | { ok: true; state: ProductUnderstandingState }
  | { ok: false; fieldErrors?: Record<string, string>; message: string };

export type AnalyzeProductUrlAction = (
  input: AnalyzeProductUrlInput,
) => Promise<ProductUnderstandingActionResult>;

export type VerifyProductUnderstandingAction = (
  input: VerifyProductUnderstandingInput,
) => Promise<ProductUnderstandingActionResult>;
