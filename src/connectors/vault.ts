import "server-only";

import { z } from "zod";

import { ConnectorError } from "./errors";

const tokenSetSchema = z.object({
  accessToken: z.string().regex(/^pha_[A-Za-z0-9_-]{8,}$/),
  refreshToken: z.string().regex(/^phr_[A-Za-z0-9_-]{8,}$/),
  expiresAt: z.iso.datetime(),
});
const writeResponseSchema = z.object({ reference: z.string().min(8).max(500).refine((value) => !/pha_|phr_/.test(value)) });

export type OAuthTokenSet = z.infer<typeof tokenSetSchema>;

export class ManagedConnectorVault {
  constructor(private readonly config: { url: string; token: string }, private readonly fetcher: typeof fetch = fetch) {}

  async write(connectionId: string, tokenSet: OAuthTokenSet) {
    const response = await this.#request("/v1/secrets", { method: "POST", body: JSON.stringify({ connectionId, ...tokenSetSchema.parse(tokenSet) }) });
    return writeResponseSchema.parse(await response.json()).reference;
  }

  async read(reference: string) {
    const response = await this.#request(`/v1/secrets/${encodeURIComponent(reference)}/read`, { method: "POST" });
    return tokenSetSchema.parse(await response.json());
  }

  async revoke(reference: string) {
    await this.#request(`/v1/secrets/${encodeURIComponent(reference)}/revoke`, { method: "POST" }, true);
  }

  async #request(path: string, init: RequestInit, allowMissing = false) {
    const response = await this.fetcher(`${this.config.url.replace(/\/$/, "")}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${this.config.token}`, "Content-Type": "application/json", Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok && !(allowMissing && response.status === 404)) throw new ConnectorError({ code: "CONNECTOR_VAULT_UNAVAILABLE", classification: "temporary", message: "Secure connector storage is temporarily unavailable.", retryable: response.status >= 500 });
    return response;
  }
}
