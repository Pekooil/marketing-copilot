import { describe, expect, it } from "vitest";

import { productUnderstandingStateSchema } from "@/product-understanding/schema";

describe("product understanding state schema", () => {
  it("accepts PostgreSQL timestamptz values with an explicit UTC offset", () => {
    const state = productUnderstandingStateSchema.parse({
      workspaceId: "a0000000-0000-4000-8000-000000000001",
      workspaceName: "Founder workspace",
      profileVersion: 1,
      proposal: {
        id: "a0000000-0000-4000-8000-000000000002",
        createdAt: "2026-08-17T01:26:26.933+00:00",
        extractorVersion: "deterministic-html-v1",
        source: {
          id: "a0000000-0000-4000-8000-000000000003",
          url: "https://example.com",
          title: "Example",
          observedAt: "2026-08-17T01:26:26.933+00:00",
          contentHash: "a".repeat(64),
        },
        candidate: {
          companyName: {
            value: "Example",
            verificationState: "evidence_supported",
            confidence: 1,
            evidence: [{ selector: "page title", quote: "Example" }],
          },
          productSummary: {
            value: "Example product",
            verificationState: "evidence_supported",
            confidence: 1,
            evidence: [
              { selector: "meta description", quote: "Example product" },
            ],
          },
        },
      },
      verifiedSnapshot: null,
    });

    expect(state.proposal?.createdAt).toBe("2026-08-17T01:26:26.933+00:00");
    expect(state.proposal?.source.observedAt).toBe(
      "2026-08-17T01:26:26.933+00:00",
    );
  });

  it("accepts a null optional target customer in a verified database snapshot", () => {
    const state = productUnderstandingStateSchema.parse({
      workspaceId: "a0000000-0000-4000-8000-000000000001",
      workspaceName: "Founder workspace",
      profileVersion: 2,
      proposal: null,
      verifiedSnapshot: {
        id: "a0000000-0000-4000-8000-000000000004",
        proposalId: "a0000000-0000-4000-8000-000000000002",
        sequence: 1,
        createdAt: "2026-08-17T03:31:56.508+00:00",
        profileVersion: 2,
        sourceIds: ["a0000000-0000-4000-8000-000000000003"],
        companyProfile: {
          companyName: "Calyxa",
          website: "https://calyxa.app/",
          productSummary: "Adaptive homework support.",
          targetCustomer: null,
        },
      },
    });

    expect(state.verifiedSnapshot?.companyProfile.targetCustomer).toBeNull();
  });
});
