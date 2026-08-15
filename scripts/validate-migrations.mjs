import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const migrationsDirectory = path.resolve("supabase/migrations");

if (!existsSync(migrationsDirectory)) {
  console.log("No migrations exist yet; migration structure gate is ready.");
  process.exit(0);
}

const files = (await readdir(migrationsDirectory)).filter((file) => file.endsWith(".sql")).sort();
const migrationName = /^\d{14}_[a-z0-9_]+\.sql$/;

for (const file of files) {
  if (!migrationName.test(file)) {
    throw new Error(`Invalid migration filename: ${file}`);
  }

  const sql = await readFile(path.join(migrationsDirectory, file), "utf8");
  if (!/^begin;/im.test(sql) || !/^commit;/im.test(sql)) {
    throw new Error(`${file} must use an explicit transaction.`);
  }
  if (/disable\s+row\s+level\s+security/i.test(sql)) {
    throw new Error(`${file} attempts to disable row-level security.`);
  }
}

if (new Set(files).size !== files.length) {
  throw new Error("Migration filenames must be unique.");
}

console.log(`Validated ${files.length} migration file(s).`);
