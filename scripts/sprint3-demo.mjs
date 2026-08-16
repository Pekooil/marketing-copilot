import { access } from "node:fs/promises";

const required = [
  "docs/sprint-3/README.md",
  "docs/sprint-3/contracts.md",
  "docs/sprint-3/analytics.md",
  "docs/sprint-3/runbook-demo.md",
  "tests/evaluation/manual-metrics.eval.test.ts",
  "tests/release/invariant-matrix.md",
];

await Promise.all(required.map((path) => access(path)));

console.log(`Sprint 3 demo sequence:
1. Open Manual metrics in a completed, verified workspace.
2. Define two founder-approved metric contracts with scope, timezone, and freshness.
3. Preview a malformed CSV and show that no data is committed.
4. Preview and import valid rows, including an observed zero and an unknown blank.
5. Replay the same file and show that observations are not duplicated.
6. Import a disagreeing candidate and inspect the conflicted state and both evidence references.
7. Approve an ordered funnel mapping and inspect available and explicitly unavailable conversions.
8. Expand a stage to trace its number to filename, source record, and evidence identifiers.
9. Run pnpm run ci, pnpm test:e2e, pnpm db:rehearse, and pnpm db:gate; attach the invariant matrix.

Live gate evidence requires DATABASE_TEST_URL and the dedicated non-production database.`);
