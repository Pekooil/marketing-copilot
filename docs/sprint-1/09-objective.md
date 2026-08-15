# S1-009 objective domain

Objectives use immutable versions and explicit `draft`, `active`, and `superseded` states. Activation requires a named and defined metric, direction, numeric target, future deadline, target segment, and rationale. Baseline zero is a real observation; unknown is stored as a distinct state with a null value.

Directional checks reject targets that cannot improve from a known baseline. Activation supersedes the previous active objective in the same transaction, while a partial unique index is the final concurrency guard against two active objectives in one workspace.

Validation errors are field-addressable for the onboarding UI. Objective content stays out of logs and analytics; only lifecycle and validation categories may be emitted.
