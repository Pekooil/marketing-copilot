import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OnboardingWizard } from "@/app/onboarding/wizard";

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));

describe("onboarding wizard", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    pushMock.mockReset();
  });

  it("exposes labeled controls and preserves input after validation errors", async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard />);
    const company = screen.getByLabelText("Company name");
    await user.type(company, "Acme");
    await user.click(screen.getByRole("button", { name: "Save and continue" }));
    expect(company).toHaveValue("Acme");
    expect(screen.getAllByRole("alert").map((alert) => alert.textContent).join(" ")).toMatch(/workspace name|Describe the product/i);
  });

  it("supports keyboard-first progression and browser-session resume", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<OnboardingWizard />);
    await user.type(screen.getByLabelText(/Workspace name/), "Acme workspace");
    await user.type(screen.getByLabelText(/Company name/), "Acme");
    await user.type(screen.getByLabelText(/What does the product help customers do/), "Helps founders understand activation.");
    await user.tab();
    await user.click(screen.getByRole("button", { name: "Save and continue" }));
    expect(screen.getByRole("heading", { name: "Make the goal measurable." })).toHaveFocus();
    unmount();
    render(<OnboardingWizard />);
    expect(await screen.findByRole("heading", { name: "Make the goal measurable." })).toBeInTheDocument();
    expect(screen.getByText("Draft resumed from this browser session")).toBeInTheDocument();
  });

  it("keeps unknown baseline distinct from a numeric zero", async () => {
    const user = userEvent.setup();
    window.sessionStorage.setItem("marketing-copilot:onboarding-draft:v1", JSON.stringify({ step: 1, draft: { workspaceName: "Acme", companyName: "Acme", productSummary: "Product" } }));
    render(<OnboardingWizard />);
    await screen.findByRole("heading", { name: "Make the goal measurable." });
    expect(await screen.findByLabelText("Unknown")).toBeChecked();
    expect(screen.queryByLabelText("Baseline value")).not.toBeInTheDocument();
    await user.click(screen.getByLabelText(/Known/));
    const baseline = await screen.findByLabelText(/Baseline value/);
    await user.type(baseline, "0");
    expect(baseline).toHaveValue(0);
  });

  it("persists through the authenticated server adapter when provided", async () => {
    const user = userEvent.setup();
    const saveAction = vi.fn().mockResolvedValue({
      ok: true,
      state: {
        workspaceId: "a0000000-0000-4000-8000-000000000001",
        step: 1,
        activated: false,
        versions: { workspace: 1, profile: 1, objective: 0, constraints: 0 },
        draft: {
          workspaceName: "Acme workspace",
          companyName: "Acme",
          productSummary: "Helps founders understand activation.",
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
        },
      },
    });

    render(<OnboardingWizard saveAction={saveAction} />);
    await user.type(screen.getByLabelText(/Workspace name/), "Acme workspace");
    await user.type(screen.getByLabelText(/Company name/), "Acme");
    await user.type(
      screen.getByLabelText(/What does the product help customers do/),
      "Helps founders understand activation.",
    );
    await user.click(screen.getByRole("button", { name: "Save and continue" }));

    await waitFor(() => expect(saveAction).toHaveBeenCalledOnce());
    expect(saveAction).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: null,
        step: 0,
        activate: false,
        expectedVersions: { workspace: 0, profile: 0, objective: 0, constraints: 0 },
        idempotencyKey: expect.stringMatching(/^onboarding-/),
      }),
    );
    expect(screen.getByText("Draft saved securely")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Make the goal measurable." })).toBeInTheDocument();
    expect(window.sessionStorage).toHaveLength(0);
  });

  it("advances to product understanding after objective activation", async () => {
    const user = userEvent.setup();
    const initialState = {
      workspaceId: "a0000000-0000-4000-8000-000000000001",
      step: 3,
      activated: false,
      versions: { workspace: 1, profile: 1, objective: 1, constraints: 1 },
      draft: {
        workspaceName: "Acme workspace",
        companyName: "Acme",
        productSummary: "Helps founders understand activation.",
        metricName: "Weekly activated accounts",
        metricDefinition: "Accounts completing activation in a UTC week",
        direction: "increase" as const,
        targetValue: "20",
        baselineState: "known" as const,
        baselineValue: "0",
        deadline: "2099-09-30",
        targetSegment: "Self-serve founders",
        rationale: "Activation is the current constraint.",
        founderHours: "5",
        cashBudget: "100",
        currency: "USD",
        riskTolerance: "low" as const,
        prohibitedTactics: "unsolicited outreach",
        brandRules: "no unsupported superlatives",
      },
    };
    const saveAction = vi.fn().mockResolvedValue({ ok: true, state: { ...initialState, activated: true } });

    render(<OnboardingWizard initialState={initialState} saveAction={saveAction} />);
    await user.click(screen.getByRole("button", { name: "Activate objective" }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/product-understanding"));
    expect(saveAction).toHaveBeenCalledWith(expect.objectContaining({ step: 3, activate: true }));
  });
});
