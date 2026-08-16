# Sprint 1 release invariant matrix

| Invariant | Automated layer |
|---|---|
| Protected routes fail closed | Playwright browser + auth unit |
| Workspace role/action and last owner | Unit |
| Cross-tenant select/insert/update/delete denied | Isolation model + SQL policy contract; raw DB pending runtime |
| New tenant tables default deny | RLS event-trigger contract |
| Profile/objective/resource versions immutable | Domain + migration contract |
| One active objective under concurrency | Partial unique index + repository transaction contract |
| Duplicate submission has one effect | Concurrent idempotency unit |
| Mutation and audit correlate/commit together | Audit unit + repository transaction contract |
| Audit update/delete denied | Migration contract |
| Onboarding vague goal/zero baseline/resume | Component + Playwright |
| Onboarding server save/resume and stale-write safety | Authenticated RPC contract + raw DB gate pending runtime |
| Analytics schema excludes entered content | Unit |

The raw authenticated PostgreSQL matrix and forward/down/forward migration rehearsal are required before staging release. The executable harnesses are `pnpm db:gate` and `pnpm db:rehearse`; live evidence remains pending until `DATABASE_TEST_URL` is provisioned.
