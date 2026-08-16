import { expect, test } from "@playwright/test";

test("public shell and health contract are available", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /calm operating system/i })).toBeVisible();
  const health = await request.get("/api/health");
  expect(health.ok()).toBeTruthy();
  await expect(health.json()).resolves.toMatchObject({ status: "ok", environment: "test" });
});

test("protected onboarding fails closed without a valid session", async ({ page }) => {
  await page.goto("/onboarding");
  await expect(page).toHaveURL(/\/auth\/sign-in\?next=%2Fonboarding/);
  await expect(page.getByRole("heading", { name: "Sign in to your workspace" })).toBeVisible();
});

test("protected product understanding fails closed without a valid session", async ({ page }) => {
  await page.goto("/product-understanding");
  await expect(page).toHaveURL(/\/auth\/sign-in\?next=%2Fproduct-understanding/);
});

test("onboarding rejects vague goals and completes a five-hour/$100 review", async ({ page }) => {
  await page.goto("/test-support/onboarding");
  await page.getByLabel(/Workspace name/).fill("Acme workspace");
  await page.getByLabel(/Company name/).fill("Acme");
  await page.getByLabel(/What does the product help/).fill("Helps founders understand activation.");
  await page.getByRole("button", { name: "Save and continue" }).click();

  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByText("Name the metric.")).toBeVisible();
  await page.getByLabel(/Metric name/).fill("Weekly activated accounts");
  await page.getByLabel(/Metric definition/).fill("Accounts completing activation in a UTC week");
  await page.getByLabel(/Target value/).fill("20");
  await page.getByRole("radio", { name: "Known", exact: true }).check();
  await page.getByLabel(/Baseline value/).fill("0");
  await page.getByLabel(/Deadline/).fill("2099-09-30");
  await page.getByLabel(/Target segment/).fill("Self-serve technical founders");
  await page.getByLabel(/Why does this matter now/).fill("Activation is the current constraint.");
  await page.getByRole("button", { name: "Save and continue" }).click();

  await expect(page.getByLabel(/Founder hours per week/)).toHaveValue("5");
  await expect(page.getByLabel(/Cash budget/)).toHaveValue("100");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByText(/5 hours\/week · USD 100 · low risk/i)).toBeVisible();
  await expect(page.getByText(/cannot authorize external sending/i)).toBeVisible();
});

test("founder reviews evidence and creates a verified context snapshot", async ({ page }) => {
  await page.goto("/test-support/product-understanding");
  await page.getByLabel("Public product URL").fill("https://calyxa.example/");
  await page.getByRole("button", { name: "Analyze page" }).click();
  await expect(page.getByText("Founder verification required")).toBeVisible();
  await expect(page.getByText("No verified snapshot yet")).toBeVisible();
  await page.getByLabel("Company name").fill("Calyxa Learning");
  await page.getByRole("button", { name: "Verify and create context snapshot" }).click();
  await expect(page.getByRole("heading", { name: "Calyxa Learning" })).toBeVisible();
  await expect(page.getByText("v2")).toBeVisible();
});
