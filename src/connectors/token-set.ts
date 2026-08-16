import "server-only";

import { z } from "zod";

export const posthogTokenSetSchema = z.object({
  accessToken: z.string().regex(/^pha_[A-Za-z0-9_-]{8,}$/),
  refreshToken: z.string().regex(/^phr_[A-Za-z0-9_-]{8,}$/),
  expiresAt: z.iso.datetime(),
});

export type PosthogTokenSet = z.infer<typeof posthogTokenSetSchema>;
