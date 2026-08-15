# S1-005 authentication and session adapter

Supabase Auth is isolated behind `SessionVerifier` and `resolveIdentity`. Mutation code consumes only a server-verified user ID, session metadata, and expiry; it never accepts a role or workspace claim from client input.

## Routes

- `/auth/sign-in` — password sign-in for invited private-beta users.
- `/auth/callback` — PKCE authorization-code exchange with a same-origin return-path allowlist.
- `/auth/sign-out` — POST-only local session revocation.
- `/onboarding` and `/workspace/*` — protected by the Next.js proxy and re-verified in server code before use.

Missing configuration, missing sessions, expired sessions, verification errors, and invalid callbacks fail closed. Auth failures expose one generic user message and do not log email addresses, tokens, or secrets.

Local/test values belong in `.env.local`; production credentials remain deferred and must be provisioned through the deployment environment. Exact production callback URLs must be configured in Supabase rather than broad wildcards.
