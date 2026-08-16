import { isIP } from "node:net";

import { z } from "zod";

const hostnameLabel = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const reservedSuffixes = [".local", ".localhost", ".internal", ".invalid", ".test"];

export class UnsafeProductUrlError extends Error {
  readonly code = "UNSAFE_PRODUCT_URL";
}

export const productUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(2_048)
  .transform((value, context) => {
    try {
      return normalizeProductUrl(value);
    } catch (error) {
      context.addIssue({
        code: "custom",
        message:
          error instanceof UnsafeProductUrlError
            ? error.message
            : "Enter a valid public HTTPS URL.",
      });
      return z.NEVER;
    }
  });

export function normalizeProductUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new UnsafeProductUrlError("Enter a valid public HTTPS URL.");
  }

  if (url.protocol !== "https:") {
    throw new UnsafeProductUrlError("Only public HTTPS URLs can be analyzed.");
  }
  if (url.username || url.password) {
    throw new UnsafeProductUrlError("URLs containing credentials cannot be analyzed.");
  }
  if (url.port && url.port !== "443") {
    throw new UnsafeProductUrlError("Custom network ports cannot be analyzed.");
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    hostname === "localhost" ||
    isIP(hostname) !== 0 ||
    reservedSuffixes.some((suffix) => hostname.endsWith(suffix)) ||
    !hostname.includes(".") ||
    hostname.split(".").some((label) => !hostnameLabel.test(label))
  ) {
    throw new UnsafeProductUrlError("Only public domain names can be analyzed.");
  }

  url.hostname = hostname;
  url.port = "";
  url.hash = "";
  return url.toString();
}

export function assertPublicAddress(address: string) {
  const family = isIP(address);
  if (family === 0 || (family === 4 ? isUnsafeIpv4(address) : isUnsafeIpv6(address))) {
    throw new UnsafeProductUrlError("The URL resolves to a non-public network address.");
  }
  return address;
}

function isUnsafeIpv4(address: string) {
  const [a, b] = address.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 88) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19 || b === 51)) ||
    (a === 203 && b === 0)
  );
}

function isUnsafeIpv6(address: string) {
  const normalized = address.toLowerCase();
  if (normalized === "::" || normalized === "::1") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (/^fe[89ab]/.test(normalized)) return true;
  if (normalized.startsWith("ff")) return true;
  if (normalized.startsWith("100:")) return true;
  if (normalized.startsWith("2001:db8:")) return true;
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  return mapped ? isUnsafeIpv4(mapped) : false;
}
