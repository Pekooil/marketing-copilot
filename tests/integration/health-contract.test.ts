import { describe, expect, it } from "vitest";

import { GET } from "../../src/app/api/health/route";

describe("health contract", () => {
  it("returns a privacy-safe service status", async () => {
    const response = GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toEqual({
      status: "ok",
      service: "marketing-copilot-web",
      environment: "development",
      version: "local",
      migration: "20260815111000_mutation_receipt",
    });
  });
});
