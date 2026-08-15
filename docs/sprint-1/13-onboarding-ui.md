# S1-013 onboarding UI vertical slice

The authenticated onboarding route provides four calm, single-focus steps: company/workspace, measurable objective, resource envelope, and review/activation. The layout follows the generated flat-design system in `design-system/ai-marketing-copilot/MASTER.md`: high-contrast neutral typography, restrained gold action color, no decorative imagery, visible focus, 44px+ controls, reduced-motion support, and responsive single-column behavior.

Every control has an explicit label, field errors remain adjacent to preserved input, step changes move focus to the heading, and unknown baseline is distinct from numeric zero. The review repeats the global Class D–F safety boundary.

Until production Supabase credentials and the local database runtime are provisioned, save/resume uses session-scoped browser storage and says so visibly. This provides refresh/resume for local UI verification without claiming a server commit. The release gate must replace that adapter with the existing versioned repositories before production exposure.
