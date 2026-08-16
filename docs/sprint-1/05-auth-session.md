# S1-005 authentication and session adapter

Supabase Auth is isolated behind `SessionVerifier` and `resolveIdentity`. Mutation code consumes only a server-verified user ID, session metadata, and expiry; it never accepts a role or workspace claim from client input.

## Routes

- `/auth/sign-in` — password sign-in for invited private-beta users.
- `/auth/callback` — PKCE authorization-code exchange with a same-origin return-path allowlist.
- `/auth/sign-out` — POST-only local session revocation.
- `/onboarding` and `/workspace/*` — protected by the Next.js proxy and re-verified in server code before use.

Missing configuration, missing sessions, expired sessions, verification errors, and invalid callbacks fail closed. Auth failures expose one generic user message and do not log email addresses, tokens, or secrets.

Local/test values belong in `.env.local`. The Vercel project now holds the production, preview, and development Supabase configuration; Supabase uses the exact production site/callback URL plus a project-scoped Vercel preview callback pattern. No secret is committed to the repository.
