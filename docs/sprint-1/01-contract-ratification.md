# S1-001 — contract ratification and threat model

**Decision:** Accepted for Sprint 1 implementation  
**Approver:** Founder/product owner  
**Date:** August 15, 2026

## Accepted contracts

- [Canonical glossary](../sprint-0/07-domain-contracts/glossary.md)
- [V1 action-risk policy](../sprint-0/07-domain-contracts/action-policy.md)
- [State transitions](../domain/state-transitions.md)
- [Initial relational schema](../domain/relational-schema.md)
- [Canonical artifact schemas](../domain/canonical-artifacts.schema.json)
- [ADR-002 database/auth host](../architecture/ADR-002-database-auth-host.md), accepted for Sprint 1

## Gate override

Sprint 0 field evidence is incomplete by explicit founder choice. Implementation may proceed to learn from a working foundation, with these conditions:

1. No claim that the product loop, pricing, connector choice, or willingness to pay has been validated.
2. No Sprint 2+ capability is pulled into Sprint 1.
3. Database/auth choices remain reversible behind adapters and standard PostgreSQL migrations.
4. No external action path exists; Classes D–F remain globally denied.
5. The gate override remains visible in product/engineering decision history.

## Frozen Sprint 1 semantics

- One active objective per workspace.
- Unknown baseline is distinct from observed zero.
- Company Profile, Objective, and Resource Constraint edits create immutable versions.
- Every mutation requires authenticated identity, active workspace membership, explicit authorization, validation, and audit.
- Every tenant table carries or inherits a non-null workspace boundary.
- RLS is default-deny defense in depth; application authorization remains mandatory.
- Unauthorized responses do not disclose whether a target exists in another workspace.
- Audit records are append-only and exclude secrets/business-content payloads.

## Threat model

| Threat | Primary control | Required verification |
|---|---|---|
| Cross-tenant ID substitution | Workspace-scoped repositories + composite keys | API/repository tests using two tenants |
| Forged client role/workspace | Server-resolved session and membership | Ignore client claims; negative tests |
| RLS omission on new table | Migration policy assertion + default-deny grants | CI database policy check |
| Service-role bypass | Server-only adapter requiring explicit workspace | Worker misuse tests and audit |
| Duplicate form submission | Idempotency keys and transactions | Replay tests |
| Lost update | Revision/expected-version check | Concurrent edit tests |
| Audit omission | Mutation and audit in one transaction | Rollback/consistency tests |
| Secret/PII logging | Structured allowlist logging + redaction | Log-capture tests |
| Session replay/revocation | Supabase server session verification | Expired/revoked session tests |
| V1 policy bypass | Global action classifier before permission | Class D–F invariant tests |

## Deferred decisions

- Production Supabase organization/project, region, recovery tier, and secrets
- Production Vercel project and domains
- Invitation/collaboration flow
- Billing and entitlement provider
- Durable workflow engine integration
- First analytics connector data plane

These deferrals do not block the local/test Sprint 1 vertical slice.

