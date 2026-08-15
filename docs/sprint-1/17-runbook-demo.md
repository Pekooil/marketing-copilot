# S1-017 support trace, rollback, and demo

## Support trace procedure

1. Obtain founder-approved, time-bound access for exactly one workspace and state the support reason.
2. Use the request ID supplied by the founder or UI error. Never search all tenants, emails, goal text, or company content.
3. Resolve only `(workspace_id, request_id)` across mutation receipt, audit, and structured trace metadata.
4. Record `support.trace.read` through the immutable audit transaction.
5. Revoke the grant when the case closes or let it expire. Do not copy trace data into general notes.

Absent, expired, or revoked authorization fails before any trace query. Returned items contain action/result/timestamp/reference—not entered payloads.

## Troubleshooting

- Sign-in loop: verify exact Supabase site/callback URLs, cookie headers, server time, and publishable key. Never request a token from the founder.
- Protected-route 307: expected without a verified session or when auth configuration is absent.
- Validation failure: use public field categories and request ID; do not log form values.
- Version conflict: reload current immutable version and ask the founder to review; never force overwrite.
- Cross-tenant denial: confirm active membership using hashed workspace correlation; do not test by broad query.
- Mutation/audit inconsistency: stop release traffic, preserve evidence, and page the on-call owner.
- Migration failure: stop forward rollout, retain existing data/audit, and issue a reviewed corrective migration.

## Rollback order

1. Turn off `FEATURE_ONBOARDING`; authenticated users see setup-pending and data remains.
2. Roll back the application deployment to the previous qualified build.
3. Revoke support/worker grants if authorization behavior is suspect.
4. Prefer a forward database correction. Never disable RLS, delete version history, or drop audit events in normal recovery.
5. Re-run `pnpm test:release`, raw two-tenant DB scenarios, and a clean-seed staging demo before re-enabling.

## Known limits / production blockers

- No Docker-compatible local Supabase runtime or test database is provisioned, so forward/down/forward and raw authenticated RLS execution remain unrun.
- Production Supabase/Vercel credentials and exact callback allowlists are intentionally deferred.
- Onboarding UI save/resume is browser-session scoped until the server persistence adapter is connected to the versioned repositories.
- Analytics has a provider-neutral sink only; no production analytics vendor or durable outbox is configured.
- Invitations, URL analysis, external connectors, AI generation, and all Class D–F execution remain out of scope.
- Real founder field testing is deferred by founder decision; Sprint 0 evidence gate remains overridden, not passed.

## Demo

Run `pnpm demo:sprint1` for the scripted order, then `pnpm test:release`. On a clean seeded staging stack, demonstrate Founder A setup, vague-goal failure, known-zero baseline, five-hour/$100 envelope, retry/conflict safety, Founder B isolation at application and raw DB layers, and audited support reconstruction.

The sprint gate is not release-ready until the three database-backed scenarios and server persistence adapter pass on staging.
