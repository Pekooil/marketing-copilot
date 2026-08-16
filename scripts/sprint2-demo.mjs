import { access } from "node:fs/promises";

const required = [
  "docs/sprint-2/README.md",
  "docs/sprint-2/runbook-demo.md",
  "tests/evaluation/product-understanding.eval.test.ts",
  "tests/release/invariant-matrix.md",
];

await Promise.all(required.map((path) => access(path)));

console.log(`Sprint 2 demo sequence:
1. Sign in to a completed Sprint 1 workspace and open Product understanding.
2. Submit an unsafe/private URL and show the safe, non-revealing rejection.
3. Analyze a public product page and inspect its URL, observation time, evidence ID, and exact claim snippets.
4. Confirm the proposal is labeled unverified and no context snapshot exists.
5. Correct one field and verify; show the immutable profile version and context snapshot.
6. Re-analyze to demonstrate that a new proposal does not overwrite the verified snapshot.
7. Attempt cross-tenant reads and evidence mutation through the database gate.
8. Run pnpm test:release and attach the invariant matrix.

Live gate evidence requires DATABASE_TEST_URL and the dedicated non-production database.`);
