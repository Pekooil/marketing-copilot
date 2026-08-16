import { describe, expect, it } from "vitest";

import {
  assertPublicAddress,
  normalizeProductUrl,
  UnsafeProductUrlError,
} from "@/product-understanding/url-policy";

describe("public product URL policy", () => {
  it("normalizes a public HTTPS URL without fragments", () => {
    expect(normalizeProductUrl("https://Example.COM/pricing?q=1#plans")).toBe(
      "https://example.com/pricing?q=1",
    );
  });

  it.each([
    "http://example.com",
    "https://localhost",
    "https://127.0.0.1",
    "https://user:secret@example.com",
    "https://example.com:8443",
    "https://service.internal",
  ])("rejects unsafe target %s", (url) => {
    expect(() => normalizeProductUrl(url)).toThrow(UnsafeProductUrlError);
  });

  it.each([
    "0.0.0.0",
    "10.2.3.4",
    "100.64.1.1",
    "127.0.0.1",
    "169.254.4.2",
    "172.16.4.2",
    "192.168.1.1",
    "::1",
    "fd00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
  ])("rejects non-public resolved address %s", (address) => {
    expect(() => assertPublicAddress(address)).toThrow(UnsafeProductUrlError);
  });

  it.each(["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])(
    "accepts public address %s",
    (address) => expect(assertPublicAddress(address)).toBe(address),
  );
});
