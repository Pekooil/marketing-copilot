import { access } from "node:fs/promises";

const required = [
  "docs/sprint-4/README.md",
  "docs/sprint-4/contracts.md",
  "docs/sprint-4/analytics.md",
  "docs/sprint-4/runbook-demo.md",
  "tests/evaluation/posthog-connector.eval.test.ts",
  "tests/release/invariant-matrix.md",
];

await Promise.all(required.map((path) => access(path)));

console.log(`Sprint 4 demo sequence:
1. Serve the production-domain CIMD document and authorize only endpoint:read.
2. Discover metadata for a founder-created one-row aggregate Endpoint.
3. Approve a version-pinned activation mapping.
4. Refresh one exact window and trace source, execution, checkpoint, and evidence.
5. Replay the same aggregate and show one observation effect.
6. Simulate a rate limit and show degraded connection plus stale metric state.
7. Retry exact committed evidence and show current recovered state without duplication.
8. Revoke access, preserve history, and reconnect the same project with empty mappings.
9. Run pnpm ci, pnpm test:e2e, pnpm db:rehearse, and pnpm db:gate; attach the invariant matrix.

Live gate evidence requires a provisioned secure runtime and dedicated non-production database.`);
