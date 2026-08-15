# S1-015 product analytics taxonomy

The foundation taxonomy contains:

- `workspace_created` with source category;
- `objective_created` with known/unknown baseline state;
- `resource_constraints_saved` with changed-field categories only;
- `onboarding_step_viewed`, `onboarding_step_completed`, and `onboarding_drop_off`;
- `safe_error` with product area and bounded error class.

Strict schemas reject goal text, company descriptions, brand rules, tactics, email, and any unknown property. Workspace and user identifiers are salted 20-character hashes. A deduplication key ensures one process emits once for one product action; the eventual provider adapter must enforce the same event ID uniqueness durably.

Events are disabled when analytics is off or consent is denied. Development emission is opt-in, test/staging use non-production sinks, and production requires the observability hash salt. No analytics vendor is selected or credentialed in Sprint 1.

The onboarding funnel is step viewed → step completed, grouped by step and duration bucket, with drop-off reason category. Sample fixtures are covered by the analytics unit suite rather than real founder data.
