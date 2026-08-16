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

test("protected manual metrics fail closed without a valid session", async ({ page }) => {
  await page.goto("/metrics");
  await expect(page).toHaveURL(/\/auth\/sign-in\?next=%2Fmetrics/);
});

test("PostHog client metadata fails closed when the secure connector runtime is absent", async ({ request }) => {
  const response = await request.get("/connectors/posthog/client-metadata");
  expect(response.status()).toBe(503);
  await expect(response.json()).resolves.toEqual({ error: "connector_not_configured" });
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

test("founder previews manual metrics and traces a funnel conversion to its source", async ({ page }) => {
  await page.goto("/test-support/metrics");
  await page.getByLabel("CSV file").setInputFiles({
    name: "sprint3-demo.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("metric,value\nQualified visits,100\nActivated accounts,25"),
  });
  await page.getByRole("button", { name: "Preview CSV" }).click();
  await expect(page.getByText("2 rows are valid and ready to import.")).toBeVisible();
  await expect(page.getByRole("cell", { name: "100" })).toBeVisible();
  await page.getByRole("button", { name: "Import 2 rows" }).click();
  await expect(page.getByText("25.0%")).toBeVisible();
  await page.locator("details summary").first().click();
  await expect(page.getByText(/sprint3-demo\.csv/).first()).toBeVisible();
  await expect(page.getByText(/Evidence:/).first()).toBeVisible();
});

test("founder maps a PostHog Endpoint, replays safely, sees stale failure, and recovers", async ({ page }) => {
  await page.goto("/test-support/metrics");
  const connector = page.getByRole("region", { name: "PostHog aggregate Endpoints" });
  await connector.getByRole("button", { name: "Discover Endpoints" }).click();
  await connector.getByLabel("Aggregate Endpoint").nth(1).selectOption("weekly-activation");
  await connector.getByRole("button", { name: "Approve mapping" }).nth(1).click();
  await expect(connector.getByText("Founder-approved Endpoint mapping saved.")).toBeVisible();
  await connector.getByLabel("Window start").fill("2026-08-01");
  await connector.getByLabel("Window end").fill("2026-08-08");
  await connector.getByRole("button", { name: "Refresh 1 mapped metrics" }).click();
  await expect(connector.getByText("1 PostHog aggregate refreshed with source lineage.")).toBeVisible();
  await page.locator("details summary").nth(1).click();
  await expect(page.getByText(/PostHog weekly-activation v3/)).toBeVisible();
  await expect(page.getByText(/execution-demo-1/)).toBeVisible();

  await connector.getByRole("button", { name: "Refresh 1 mapped metrics" }).click();
  await expect(connector.getByText("Exact replay recovered with no duplicate observation.")).toBeVisible();
  await expect(connector.getByText("succeeded · 1/1")).toHaveCount(1);

  await connector.getByRole("button", { name: "Refresh 1 mapped metrics" }).click();
  await expect(connector.getByText(/rate limiting refreshes/i)).toBeVisible();
  await expect(connector.getByText("degraded", { exact: true })).toBeVisible();
  await expect(page.getByText("stale", { exact: true }).last()).toBeVisible();

  await connector.getByRole("button", { name: "Refresh 1 mapped metrics" }).click();
  await expect(connector.getByText("PostHog aggregate recovered from committed evidence.")).toBeVisible();
  await expect(connector.getByText("healthy", { exact: true })).toBeVisible();
  await expect(page.getByText("current", { exact: true }).last()).toBeVisible();
});
