import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { OnboardingWizard } from "@/app/onboarding/wizard";

describe("onboarding wizard", () => {
  beforeEach(() => window.sessionStorage.clear());

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
});
