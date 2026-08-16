"use client";

import { ProductUnderstanding } from "@/app/product-understanding/product-understanding";
import type {
  AnalyzeProductUrlAction,
  ProductUnderstandingState,
  VerifyProductUnderstandingAction,
} from "@/product-understanding/schema";

const workspaceId = "a0000000-0000-4000-8000-000000000001";
const proposalId = "a0000000-0000-4000-8000-000000000002";
const sourceId = "a0000000-0000-4000-8000-000000000003";

const initialState: ProductUnderstandingState = {
  workspaceId,
  workspaceName: "Calyxa workspace",
  profileVersion: 1,
  proposal: null,
  verifiedSnapshot: null,
};

const proposalState: ProductUnderstandingState = {
  ...initialState,
  proposal: {
      id: proposalId,
      createdAt: "2026-08-16T12:00:00.000Z",
      extractorVersion: "deterministic-html-v1",
      source: {
        id: sourceId,
        url: "https://calyxa.example/",
        title: "Calyxa",
        observedAt: "2026-08-16T12:00:00.000Z",
        contentHash: "a".repeat(64),
      },
      candidate: {
        companyName: {
          value: "Calyxa",
          verificationState: "evidence_supported",
          confidence: 0.86,
          evidence: [{ selector: "page title", quote: "Calyxa" }],
        },
        productSummary: {
          value: "Adaptive math practice for middle-school students.",
          verificationState: "evidence_supported",
          confidence: 0.9,
          evidence: [
            {
              selector: "meta description",
              quote: "Adaptive math practice for middle-school students.",
            },
          ],
        },
      },
  },
};

const analyzeAction: AnalyzeProductUrlAction = async () => ({
  ok: true,
  state: proposalState,
});

const verifyAction: VerifyProductUnderstandingAction = async (input) => {
  return {
    ok: true,
    state: {
      ...proposalState,
      profileVersion: 2,
      verifiedSnapshot: {
        id: "a0000000-0000-4000-8000-000000000004",
        proposalId,
        sequence: 1,
        createdAt: "2026-08-16T12:05:00.000Z",
        profileVersion: 2,
        sourceIds: [sourceId],
        companyProfile: {
          companyName: input.companyName,
          website: "https://calyxa.example/",
          productSummary: input.productSummary,
          ...(input.targetCustomer ? { targetCustomer: input.targetCustomer } : {}),
        },
      },
    },
  };
};

export function ProductUnderstandingFixture() {
  return (
    <ProductUnderstanding
      initialState={initialState}
      analyzeAction={analyzeAction}
      verifyAction={verifyAction}
    />
  );
}
