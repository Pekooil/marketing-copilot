import { describe, expect, it, vi } from "vitest";

import { fetchPublicPage } from "@/product-understanding/fetch-public-page";

describe("bounded public page fetch", () => {
  it("records a deterministic hash and observation metadata", async () => {
    const resolve = vi.fn().mockResolvedValue(["93.184.216.34"]);
    const requestOnce = vi.fn().mockResolvedValue({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: "<html><title>Example</title></html>",
    });
    const page = await fetchPublicPage("https://example.com", {
      resolve,
      requestOnce,
      now: () => new Date("2026-08-16T12:00:00.000Z"),
    });
    expect(page).toMatchObject({
      requestedUrl: "https://example.com/",
      finalUrl: "https://example.com/",
      observedAt: "2026-08-16T12:00:00.000Z",
      redirectCount: 0,
      contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(requestOnce).toHaveBeenCalledWith(new URL("https://example.com/"), ["93.184.216.34"]);
  });

  it("revalidates redirect targets and blocks private IP redirects", async () => {
    const requestOnce = vi.fn().mockResolvedValue({
      status: 302,
      location: "https://127.0.0.1/admin",
      contentType: "text/html",
      body: "",
    });
    await expect(fetchPublicPage("https://example.com", {
      resolve: vi.fn().mockResolvedValue(["93.184.216.34"]),
      requestOnce,
    })).rejects.toThrow(/public domain names/i);
    expect(requestOnce).toHaveBeenCalledTimes(1);
  });

  it("rejects successful non-HTML responses", async () => {
    await expect(fetchPublicPage("https://example.com/file.pdf", {
      resolve: vi.fn().mockResolvedValue(["93.184.216.34"]),
      requestOnce: vi.fn().mockResolvedValue({
        status: 200,
        contentType: "application/pdf",
        body: "%PDF",
      }),
    })).rejects.toThrow(/HTML page/i);
  });
});
