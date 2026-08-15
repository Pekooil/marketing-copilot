import { access } from "node:fs/promises";

const required = [
  "supabase/seed.sql",
  "docs/sprint-1/17-runbook-demo.md",
  "tests/release/invariant-matrix.md",
];

await Promise.all(required.map((path) => access(path)));

console.log(`Sprint 1 demo sequence:
1. Reset the local Supabase database and apply the two-workspace seed.
2. Sign in as Founder A; complete company, measurable objective, and 5h/$100 resources.
3. Show vague-objective rejection, safe duplicate retry, and version conflict.
4. Attempt Founder B access to Founder A and show API/raw-RLS denial.
5. Reconstruct Founder A's request and Founder B's denial from audit/support trace.
6. Run pnpm test:release and attach the invariant matrix.

Release evidence still requires a Docker-compatible Supabase runtime or DATABASE_TEST_URL.`);
