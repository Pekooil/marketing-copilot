# Contract review and approval

## Review set

Select at least 20 representative examples spanning:

- measurable/vague objectives;
- zero/unknown/stale/conflicted metrics;
- funnel-stage versus measurement constraints;
- experiment versus operational task;
- win/loss/inconclusive/invalid/stopped;
- verified/inferred/disputed/superseded memory;
- Class A–F actions and injection attempts.

## Independent review

Each reviewer classifies the example before discussion:

| Example | Reviewer A | Reviewer B | Agree? | Resolution | Contract changed? |
|---|---|---|---|---|---|
|  |  |  |  |  |  |

Target: ≥90% exact agreement on safety/action class and ≥80% on domain classification before accepting the contracts. Resolve every safety disagreement; do not average it away.

## Machine checks

- `canonical-artifacts.schema.json` parses as JSON.
- Every canonical artifact is reachable from the root `oneOf`.
- Required envelope fields exist.
- Example valid artifacts pass a Draft 2020-12 validator.
- Negative fixtures fail for the intended reason.
- State transitions reject illegal post-approval edits.
- Policy tests block all D–F actions.

## Approval record

- Contract version/date:
- Reviewers:
- Agreement results:
- Unresolved ambiguity:
- Accepted glossary:
- Accepted transition diagrams:
- Accepted V1 action policy:
- Accepted artifact schema version:
- Decision: accept / revise / defer
- Approver and date:
- Revisit trigger:

