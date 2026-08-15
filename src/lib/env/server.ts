import "server-only";

import { z } from "zod";

const serverEnvironmentSchema = z.object({
  APP_ENV: z
    .enum(["development", "test", "staging", "production"])
    .default("development"),
  APP_VERSION: z.string().trim().min(1).default("local"),
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
});

export const serverEnvironment = serverEnvironmentSchema.parse({
  APP_ENV: process.env.APP_ENV,
  APP_VERSION: process.env.APP_VERSION,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
});

export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;
