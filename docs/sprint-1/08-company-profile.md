# S1-008 versioned Company Profile

The Company Profile begins as a minimal manual record. Each save appends an immutable version and advances the profile's current-version pointer transactionally; optimistic version checks prevent lost updates.

Each populated field carries a value, verification state, confidence, and evidence references. `founder_verified` is accepted only for a founder actor with a non-empty decision reference. Agent-authored output cannot independently make that claim. URL analysis remains deferred to Sprint 2.

Profile tables inherit forced, default-deny RLS and add explicit member-read/write plus scoped-worker policies. Product analytics may record create/edit events but never field content.
