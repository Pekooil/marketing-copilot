# ADR-002: Supabase database, auth, and storage host

**Status:** Accepted for Sprint 1
**Decision owner:** Engineering lead and security reviewer  
**Accepted:** August 15, 2026 by explicit founder gate override

## Context

V1 needs PostgreSQL transactions, explicit relational constraints, tenant defense in depth, user authentication, object storage, backups, and a low-operations path for a small team. Workspace authorization remains domain logic; a hosting platform cannot be the only security boundary.

## Decision

Use Supabase for managed PostgreSQL, Supabase Auth, and object storage. Use Drizzle for application-owned schema migrations and type-safe queries. Deploy Next.js on Vercel and durable workers separately. Keep domain services vendor-neutral.

Use application authorization on every request plus PostgreSQL row-level security on every tenant-bearing table. Keep application tables in an explicitly managed schema, revoke broad default grants, and expose only the minimum objects required. Privileged worker access is server-only, narrowly scoped, audited, and never passed to model context.

Supabase provides full PostgreSQL and supports RLS; its documentation requires RLS on exposed schemas and recommends combining grants with policies. References: [database overview](https://supabase.com/docs/guides/database/overview), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), and [securing the Data API](https://supabase.com/docs/guides/api/securing-your-api).

## Alternatives considered

| Alternative | Decision | Reason |
|---|---|---|
| Neon + Clerk + S3 | Strong fallback | More composable and independently replaceable, but adds vendor and identity integration surface for a tiny team. Choose if Supabase Auth/RLS ergonomics fail the spike. |
| Supabase database + Clerk | Defer | Duplicates identity integration work without a validated requirement. |
| Self-managed PostgreSQL/auth/storage | Reject | Unnecessary operational and security burden for V1. |
| Prisma instead of Drizzle | Acceptable alternative | Choose only if the implementation team has materially stronger Prisma experience before Sprint 1 starts. |

## Tenant and identity rules

- Every workspace-owned row has non-null `workspace_id` unless it is a child whose parent enforces the same boundary through a composite foreign key.
- Membership is the source for workspace roles; JWT claims are hints, not durable authorization truth.
- Request authorization checks membership and action permission before the repository call.
- RLS is defense in depth and default-deny; automated tests use two workspaces and attempt direct repository and API cross-tenant access.
- Service-role access is limited to background jobs, requires an explicit workspace parameter, and emits an audit event for sensitive reads/writes.
- Secrets are external encrypted references, not plaintext database fields.

## Validation before acceptance

1. Prove SSR/session behavior, invitation or magic-link flow, logout/revocation, and worker identity.
2. Prove RLS default-deny on raw SQL and generated Drizzle queries across two tenants.
3. Verify migration rollback, daily backup, point-in-time recovery tier, object export, and workspace deletion behavior.
4. Measure connection pooling from Vercel and the worker host.
5. Threat-model service-role bypass and support tooling.

## Migration and rollback

- SQL migrations remain standard PostgreSQL and avoid platform-only domain logic.
- Auth user IDs are opaque external identities referenced through an application `user_account` table.
- Object metadata is stored in PostgreSQL; blobs can migrate between S3-compatible stores.
- Fallback is Neon + managed auth with the same repository and authorization interfaces.

## Acceptance

The ADR is accepted only when automated tests prove no cross-tenant read or write through API, repository, background worker, or direct authenticated database access.
