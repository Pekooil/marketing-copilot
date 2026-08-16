import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ProductUnderstanding } from "@/app/product-understanding/product-understanding";
import type { ProductUnderstandingState } from "@/product-understanding/schema";

const workspaceId = "a0000000-0000-4000-8000-000000000001";
const proposalId = "a0000000-0000-4000-8000-000000000002";
const sourceId = "a0000000-0000-4000-8000-000000000003";

const emptyState: ProductUnderstandingState = {
  workspaceId,
  workspaceName: "Calyxa workspace",
  profileVersion: 1,
  proposal: null,
  verifiedSnapshot: null,
};

const proposedState: ProductUnderstandingState = {
  ...emptyState,
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
        value: "Adaptive math practice for students.",
        verificationState: "evidence_supported",
        confidence: 0.9,
        evidence: [{ selector: "meta description", quote: "Adaptive math practice for students." }],
      },
    },
  },
};

describe("product understanding review", () => {
  it("keeps analysis visibly unverified and shows source evidence", () => {
    render(
      <ProductUnderstanding
        initialState={proposedState}
        analyzeAction={vi.fn()}
        verifyAction={vi.fn()}
      />,
    );
    expect(screen.getByText("Founder verification required")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Calyxa" })).toHaveAttribute(
      "href",
      "https://calyxa.example/",
    );
    expect(screen.getByText("Adaptive math practice for students.", { selector: "q" })).toBeInTheDocument();
    expect(screen.getByText("No verified snapshot yet")).toBeInTheDocument();
  });

  it("submits founder corrections and renders the immutable snapshot", async () => {
    const user = userEvent.setup();
    const verifiedState: ProductUnderstandingState = {
      ...proposedState,
      profileVersion: 2,
      verifiedSnapshot: {
        id: "a0000000-0000-4000-8000-000000000004",
        proposalId,
        sequence: 1,
        createdAt: "2026-08-16T12:05:00.000Z",
        profileVersion: 2,
        sourceIds: [sourceId],
        companyProfile: {
          companyName: "Calyxa Learning",
          website: "https://calyxa.example/",
          productSummary: "Adaptive math practice for students.",
        },
      },
    };
    const verifyAction = vi.fn().mockResolvedValue({ ok: true, state: verifiedState });
    render(
      <ProductUnderstanding
        initialState={proposedState}
        analyzeAction={vi.fn()}
        verifyAction={verifyAction}
      />,
    );

    await user.clear(screen.getByLabelText("Company name"));
    await user.type(screen.getByLabelText("Company name"), "Calyxa Learning");
    await user.click(screen.getByRole("button", { name: "Verify and create context snapshot" }));

    await waitFor(() => expect(verifyAction).toHaveBeenCalledOnce());
    expect(verifyAction).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId,
      proposalId,
      expectedProfileVersion: 1,
      companyName: "Calyxa Learning",
      idempotencyKey: expect.stringMatching(/^product-verification-/),
    }));
    expect(await screen.findByRole("heading", { name: "Calyxa Learning" })).toBeInTheDocument();
    expect(screen.getByText("Profile version").nextSibling).toHaveTextContent("v2");
  });
});
