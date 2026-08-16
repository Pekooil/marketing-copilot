# S1-016 isolation and release suite

`pnpm test:release` is the local release command. It runs lint, type checks, canonical schema and migration checks, unit/component/integration/isolation projects, the production build, and desktop/mobile Chromium stories.

The browser suite covers the public/health boundary, protected-route denial, vague-goal blocking, known-zero baseline, five-hour/$100 resource envelope, responsive layout, and visible action-policy warning. The invariant matrix maps API/domain/repository/RLS/migration/audit/concurrency evidence.

CI installs the Playwright-pinned headless Chromium shell and retains JUnit, screenshots/traces on failure, and reports.

## Live database evidence — 2026-08-16

The dedicated Supabase `marketing-copilot` gate project (`qeoqhunqsjfxpwgliixq`, West US) supplied the previously missing database runtime. The live rehearsal passed:

- clean forward apply: 9 checksum-tracked migrations and 2 seeded workspaces;
- prior-schema upgrade: the first 8 migrations plus seed upgraded to all 9 migrations;
- destructive test-only down/forward: all rollbacks followed by all 9 migrations restored exactly 2 gate workspaces;
- raw isolation/invariant matrix: 10 scenarios covering authenticated, anonymous, worker, cross-tenant, owner, active-objective, audit, and default-deny behavior;
- onboarding persistence: 4 scenarios covering idempotent replay, stale-write rejection, activation persistence, and denied cross-tenant audit attribution.

Supabase enforces audit immutability at either the grant layer (`42501`) or the append-only trigger (`55000`). The live gate accepts both secure outcomes.
