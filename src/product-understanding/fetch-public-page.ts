import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { request } from "node:https";

import {
  assertPublicAddress,
  normalizeProductUrl,
  UnsafeProductUrlError,
} from "./url-policy";

const maxResponseBytes = 1_000_000;
const maxRedirects = 3;

export interface PublicPage {
  requestedUrl: string;
  finalUrl: string;
  html: string;
  contentHash: string;
  observedAt: string;
  redirectCount: number;
}

export class PublicPageFetchError extends Error {
  readonly code = "PUBLIC_PAGE_FETCH_FAILED";
}

export async function fetchPublicPage(
  rawUrl: string,
  dependencies: {
    resolve?: typeof resolvePublicAddresses;
    requestOnce?: typeof requestOnce;
    now?: () => Date;
  } = {},
): Promise<PublicPage> {
  const requestedUrl = normalizeProductUrl(rawUrl);
  const resolve = dependencies.resolve ?? resolvePublicAddresses;
  const fetchOnce = dependencies.requestOnce ?? requestOnce;
  let currentUrl = requestedUrl;

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const url = new URL(currentUrl);
    const addresses = await resolve(url.hostname);
    const response = await fetchOnce(url, addresses);

    if (response.status >= 300 && response.status < 400 && response.location) {
      if (redirectCount === maxRedirects) {
        throw new PublicPageFetchError("The page redirected too many times.");
      }
      currentUrl = normalizeProductUrl(new URL(response.location, url).toString());
      continue;
    }
    if (response.status < 200 || response.status >= 300) {
      throw new PublicPageFetchError(`The page returned HTTP ${response.status}.`);
    }
    if (!response.contentType.toLowerCase().startsWith("text/html")) {
      throw new PublicPageFetchError("The URL did not return an HTML page.");
    }

    return {
      requestedUrl,
      finalUrl: currentUrl,
      html: response.body,
      contentHash: createHash("sha256").update(response.body).digest("hex"),
      observedAt: (dependencies.now?.() ?? new Date()).toISOString(),
      redirectCount,
    };
  }

  throw new PublicPageFetchError("The page could not be fetched.");
}

export async function resolvePublicAddresses(hostname: string) {
  const results = await lookup(hostname, { all: true, verbatim: true });
  if (results.length === 0) {
    throw new PublicPageFetchError("The domain did not resolve.");
  }
  return results.map(({ address }) => assertPublicAddress(address));
}

export interface PageResponse {
  status: number;
  location?: string;
  contentType: string;
  body: string;
}

export async function requestOnce(url: URL, addresses: string[]): Promise<PageResponse> {
  let lastError: unknown;
  for (const address of addresses) {
    try {
      return await requestAddress(url, address);
    } catch (error) {
      if (error instanceof UnsafeProductUrlError || error instanceof PublicPageFetchError) {
        throw error;
      }
      lastError = error;
    }
  }
  throw new PublicPageFetchError(
    lastError instanceof Error ? `The page could not be reached: ${lastError.name}.` : "The page could not be reached.",
  );
}

function requestAddress(url: URL, address: string) {
  return new Promise<PageResponse>((resolve, reject) => {
    const networkRequest = request(
      {
        protocol: "https:",
        hostname: address,
        port: 443,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        servername: url.hostname,
        headers: {
          host: url.hostname,
          accept: "text/html,application/xhtml+xml",
          "user-agent": "MarketingCopilotSourceReader/1.0",
        },
        timeout: 8_000,
      },
      (response) => {
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxResponseBytes) {
            response.destroy(new PublicPageFetchError("The page is too large to analyze safely."));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => {
          resolve({
            status: response.statusCode ?? 0,
            location: response.headers.location,
            contentType: String(response.headers["content-type"] ?? ""),
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
        response.on("error", reject);
      },
    );
    networkRequest.on("timeout", () =>
      networkRequest.destroy(new PublicPageFetchError("The page took too long to respond.")),
    );
    networkRequest.on("error", reject);
    networkRequest.end();
  });
}
