import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import postgres from "postgres";

const databaseUrl = process.env.DATABASE_TEST_URL;
if (!databaseUrl) throw new Error("DATABASE_TEST_URL is required for destructive rehearsal.");
if (process.env.ALLOW_DESTRUCTIVE_DB_REHEARSAL !== "1") {
  throw new Error("Set ALLOW_DESTRUCTIVE_DB_REHEARSAL=1 for the dedicated gate database.");
}

const allowedWorkspaceIds = new Set([
  "a0000000-0000-0000-0000-000000000001",
  "b0000000-0000-0000-0000-000000000002",
]);
const migrationDirectory = resolve("supabase/migrations");
const rollbackDirectory = resolve("supabase/rollbacks");
const migrationFiles = (await readdir(migrationDirectory))
  .filter((file) => file.endsWith(".sql"))
  .sort();
const rollbackFiles = (await readdir(rollbackDirectory))
  .filter((file) => file.endsWith(".down.sql"))
  .sort()
  .reverse();
const databaseHost = new URL(databaseUrl).hostname;
const ssl = databaseHost === "localhost" || databaseHost === "127.0.0.1" ? false : "require";
const sql = postgres(databaseUrl, { max: 1, prepare: false, ssl });

async function ensureHistory() {
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
}

async function apply(files) {
  await ensureHistory();
  for (const file of files) {
    const source = await readFile(resolve(migrationDirectory, file), "utf8");
    const checksum = createHash("sha256").update(source).digest("hex");
    const [existing] = await sql`
      select checksum from supabase_migrations.marketing_copilot_schema_migrations
      where version = ${file}
    `;
    if (existing) {
      if (existing.checksum !== checksum) throw new Error(`Migration checksum changed: ${file}`);
      continue;
    }
    await sql.unsafe(source);
    await sql`
      insert into supabase_migrations.marketing_copilot_schema_migrations (version, checksum)
      values (${file}, ${checksum})
    `;
  }
}

async function rollBackAll() {
  for (const file of rollbackFiles) {
    await sql.unsafe(await readFile(resolve(rollbackDirectory, file), "utf8"));
  }
  await sql`truncate table supabase_migrations.marketing_copilot_schema_migrations`;
}

async function seed() {
  await sql.unsafe(await readFile(resolve("supabase/seed.sql"), "utf8"));
}

try {
  const [appTable] = await sql`select to_regclass('app.workspace')::text as table_name`;
  if (appTable?.table_name) {
    const workspaces = await sql`select id::text from app.workspace`;
    const unexpected = workspaces.find(({ id }) => !allowedWorkspaceIds.has(id));
    if (unexpected) {
      throw new Error("Refusing destructive rehearsal: non-gate workspace data exists.");
    }
  }

  await apply(migrationFiles);
  await seed();
  process.stdout.write(`forward-empty: ${migrationFiles.length} migrations applied\n`);

  await rollBackAll();
  const priorFiles = migrationFiles.slice(0, -1);
  await apply(priorFiles);
  await seed();
  await apply(migrationFiles);
  process.stdout.write(`forward-prior: upgraded ${priorFiles.length} to ${migrationFiles.length} migrations\n`);

  await rollBackAll();
  await apply(migrationFiles);
  await seed();
  const [{ count: workspaceCount }] = await sql`
    select count(*)::integer as count from app.workspace
  `;
  if (workspaceCount !== 2) throw new Error("Final clean seed did not restore two workspaces.");
  process.stdout.write("down-forward: destructive test rollback restored a clean current schema\n");
} finally {
  await sql.end();
}
