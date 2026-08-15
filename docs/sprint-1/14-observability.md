# S1-014 feature flags and observability

`authentication` and `onboarding` are evaluated on the server. Turning onboarding off returns an authenticated setup-pending screen and retains data. Turning authentication off never creates anonymous fallback access; protected routes continue to fail closed.

Structured JSON records carry request ID, trace ID, action, latency, result class, and salted actor/workspace hashes. A recursive redactor removes authorization, cookie, password, secret, token, email, payload, entered goal, brand, rationale, and content fields. Production refuses to hash identifiers without `OBSERVABILITY_HASH_SALT`.

## Baseline dashboard and alert queries

- Request health: count and p50/p95 `durationMs` by action/result over 5m and 1h.
- Authorization: count denials by action/reason and privacy-safe workspace hash.
- Auth: success/failure class and latency, never email or token.
- Audit consistency: any `event=mutation_audit_inconsistency` is release-blocking and pages the on-call owner.
- Error capture: group by `errorClass`, release, and environment; sample repeated internal failures, never authorization denials.

One request can be reconstructed from `requestId`/`traceId` across `mutation_started`, `audit_appended`, and `mutation_completed`. Raw domain payloads are not logged.
