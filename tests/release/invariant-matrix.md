# Release invariant matrix

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
| URL analysis accepts only pinned public HTTPS addresses and safe redirects | URL/fetch unit + adversarial evaluation |
| Extracted claims remain unverified and source-grounded | Extraction unit + evaluation + migration contract |
| Source/proposal/review/context history is immutable | Migration contract + raw DB gate |
| Product-understanding records cannot cross tenants | Isolation policy contract + raw authenticated DB gate |
| Founder correction creates one attributable profile version and context snapshot | Component + RPC contract + raw DB gate |
| Unknown metric values never become zero | Unit + evaluation + component + raw DB gate |
| Malformed CSV commits nothing and raw bodies are not retained | Unit + server-action contract + migration contract |
| Exact manual import replay has one effect | Unit identity + migration contract + raw DB gate |
| Conflicting observations are valueless, retain all evidence, and are never averaged | Evaluation + migration contract + raw DB gate |
| Metric observations and snapshots are immutable and tenant isolated | Isolation/migration contract + raw DB gate |
| Funnel conversions require current, compatible scope | Unit + evaluation + component + browser |
| Displayed funnel numbers expose source and evidence lineage | Component + browser |
| Manual-metrics analytics excludes customer content and identifiers | Unit |
| PostHog authorization uses CIMD, PKCE, sealed expiring state, HTTPS production callback, and only `endpoint:read` | Unit + route contract + browser fail-closed gate |
| Access/refresh tokens never enter application tables, logs, analytics, or model context | Schema/migration + unit + raw DB gate |
| Adapter cannot execute `/query`, raw events, persons, or arbitrary provider-native queries | Capability contract + adversarial evaluation |
| Founder mapping pins one approved metric to one Endpoint version | Component + migration contract + raw DB gate |
| Endpoint output is one exact-scope aggregate row; zero and unknown remain distinct | Unit + evaluation + raw DB gate |
| Exact connector replay has one source/observation effect | Stable identity evaluation + migration + raw DB gate |
| Provider failure preserves prior evidence as stale and blocks current-quality conclusions | Component/browser + migration + raw DB gate |
| Exact committed replay can recover stale state without duplicating observations | Evaluation + browser + raw DB gate |
| Connector state, mapping, runs, lineage, and worker commits remain tenant isolated | Isolation/migration + raw DB gate |
| Connector analytics rejects project, Endpoint, metric, scope, value, and lineage identifiers | Unit |

The raw authenticated PostgreSQL matrix and forward/down/forward migration rehearsal are required before staging release. The executable harnesses are `pnpm db:gate` and `pnpm db:rehearse`; live evidence remains pending until `DATABASE_TEST_URL` is provisioned.
