import "server-only";

import { z } from "zod";

import { ConnectorError } from "./errors";

const schema = z.object({
  appUrl: z.url(),
  stateSecret: z.string().min(32),
  databaseUrl: z.url().refine((value) => ["postgres:", "postgresql:"].includes(new URL(value).protocol)),
});

export function getConnectorRuntimeConfig() {
  const parsed = schema.safeParse({
    appUrl: process.env.NEXT_PUBLIC_APP_URL,
    stateSecret: process.env.CONNECTOR_STATE_SECRET,
    databaseUrl: process.env.CONNECTOR_DATABASE_URL,
  });
  if (!parsed.success) throw new ConnectorError({ code: "CONNECTOR_RUNTIME_UNAVAILABLE", classification: "configuration", message: "Secure connector setup is not configured for this environment." });
  const appUrl = new URL(parsed.data.appUrl);
  if (process.env.NODE_ENV === "production" && appUrl.protocol !== "https:") throw new ConnectorError({ code: "CONNECTOR_RUNTIME_UNAVAILABLE", classification: "configuration", message: "Secure connector setup is not configured for this environment." });
  return {
    ...parsed.data,
    appUrl: appUrl.origin,
    clientId: new URL("/connectors/posthog/client-metadata", appUrl).toString(),
    redirectUri: new URL("/connectors/posthog/callback", appUrl).toString(),
  };
}
