import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

export function createDatabase(databaseUrl: string) {
  const client = postgres(databaseUrl, {
    max: 5,
    prepare: false,
    idle_timeout: 20,
  });

  return {
    db: drizzle(client, { schema }),
    close: () => client.end(),
  };
}

export type Database = ReturnType<typeof createDatabase>["db"];
