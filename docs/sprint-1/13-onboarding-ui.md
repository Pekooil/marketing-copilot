# S1-013 onboarding UI vertical slice

The authenticated onboarding route provides four calm, single-focus steps: company/workspace, measurable objective, resource envelope, and review/activation. The layout follows the generated flat-design system in `design-system/ai-marketing-copilot/MASTER.md`: high-contrast neutral typography, restrained gold action color, no decorative imagery, visible focus, 44px+ controls, reduced-motion support, and responsive single-column behavior.

Every control has an explicit label, field errors remain adjacent to preserved input, step changes move focus to the heading, and unknown baseline is distinct from numeric zero. The review repeats the global Class D–F safety boundary.

The production route now loads and saves through authenticated Supabase RPCs. Each completed step writes the existing immutable profile, objective, and resource-constraint versions in an idempotent transaction with audit evidence. The RPC derives the founder from `auth.uid()`, verifies active membership, and never accepts identity or role claims from the client.

The guarded `/test-support/onboarding` route retains the session-scoped adapter only for deterministic browser tests that run without external credentials. It cannot be enabled outside the test environment.
