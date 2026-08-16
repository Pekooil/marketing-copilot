import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

import { ConnectorError } from "./errors";
import { connectorConnectionInputSchema } from "./contracts";

const oauthStateSchema = z.object({
  userId: z.uuid(),
  workspaceId: z.uuid(),
  connectionId: z.uuid(),
  connection: connectorConnectionInputSchema,
  state: z.string().min(20).max(200),
  codeVerifier: z.string().min(43).max(128),
  expiresAt: z.number().int().positive(),
});

export type ConnectorOAuthState = z.infer<typeof oauthStateSchema>;

export function sealOAuthState(input: ConnectorOAuthState, secret: string) {
  const body = Buffer.from(JSON.stringify(oauthStateSchema.parse(input))).toString("base64url");
  return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
}

export function openOAuthState(value: string | undefined, secret: string, now = Date.now()) {
  if (!value) throw invalidState();
  const [body, signature] = value.split(".");
  if (!body || !signature) throw invalidState();
  const expected = createHmac("sha256", secret).update(body).digest();
  const received = Buffer.from(signature, "base64url");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) throw invalidState();
  const parsed = oauthStateSchema.safeParse(JSON.parse(Buffer.from(body, "base64url").toString("utf8")));
  if (!parsed.success || parsed.data.expiresAt <= now) throw invalidState();
  return parsed.data;
}

function invalidState() {
  return new ConnectorError({ code: "CONNECTOR_OAUTH_STATE_INVALID", classification: "credential", message: "The PostHog authorization attempt expired. Start again." });
}
