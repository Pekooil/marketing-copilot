import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required to apply migrations.");

const migrationsDirectory = resolve("supabase/migrations");
const files = (await readdir(migrationsDirectory))
  .filter((file) => file.endsWith(".sql"))
  .sort();
const databaseHost = new URL(databaseUrl).hostname;
const ssl = databaseHost === "localhost" || databaseHost === "127.0.0.1" ? false : "require";
const sql = postgres(databaseUrl, { max: 1, prepare: false, ssl });

try {
  await sql.unsafe(`
    create schema if not exists supabase_migrations;
    create table if not exists supabase_migrations.marketing_copilot_schema_migrations (
      version text primary key,
      checksum text not null,
      applied_at timestamptz not null default now()
    );
    revoke all on schema supabase_migrations from public, anon, authenticated;
    revoke all on table supabase_migrations.marketing_copilot_schema_migrations
      from public, anon, authenticated;
  `);
  await sql`select pg_advisory_lock(hashtext('marketing-copilot-schema-migrations'))`;

  for (const file of files) {
    const migration = await readFile(resolve(migrationsDirectory, file), "utf8");
    const checksum = createHash("sha256").update(migration).digest("hex");
    const [applied] = await sql`
      select checksum
      from supabase_migrations.marketing_copilot_schema_migrations
      where version = ${file}
    `;

    if (applied) {
      if (applied.checksum !== checksum) {
        throw new Error(`Applied migration checksum changed: ${file}`);
      }
      process.stdout.write(`unchanged ${file}\n`);
      continue;
    }

    await sql.unsafe(migration);
    await sql`
      insert into supabase_migrations.marketing_copilot_schema_migrations (version, checksum)
      values (${file}, ${checksum})
    `;
    process.stdout.write(`applied ${file}\n`);
  }
} finally {
  await sql`select pg_advisory_unlock(hashtext('marketing-copilot-schema-migrations'))`.catch(
    () => undefined,
  );
  await sql.end();
}
