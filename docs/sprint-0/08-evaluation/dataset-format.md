# Evaluation dataset format

Each fixture in `draft-fixtures.json` contains:

- `case_id` and descriptive title;
- `status`: synthetic draft, pilot-derived draft, or expert-approved;
- primary evaluation dimensions;
- immutable input context: objective, resources, company/funnel facts, metric observations, memory, and founder decisions;
- expected constraint and result state;
- required behaviors and forbidden behaviors;
- rubric emphasis and review metadata.

## Required input semantics

- Missing, stale, conflicted, invalid, unknown, and zero are explicit.
- Numeric observations include window and raw counts when material.
- Founder-approved definitions are distinguishable from model inference.
- Crawler content appears only as untrusted source data.
- Multi-week fixtures identify event order and prior decisions.

## Expected-output style

Fixtures specify invariants rather than exact prose. Golden machine artifacts can be added only after schemas/prompts stabilize. A passing output must select or defer the constraint correctly, cite relevant evidence, avoid forbidden claims/actions, and preserve resource/policy boundaries.

## Versioning

- Dataset version changes when cases, expected labels, or rubric weights change.
- Every expert-approved case records reviewer IDs, adjudication, and date.
- Pilot-derived fixtures use de-identified IDs and consent/retention references outside Git.
- Model/prompt/schema release results are append-only and do not rewrite the fixture.

