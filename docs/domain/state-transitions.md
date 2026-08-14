# State-transition diagrams

**Status:** Proposed domain contract. Illegal transitions fail closed and emit an audit event. All material post-approval edits create a new version.

## Objective

```mermaid
stateDiagram-v2
    [*] --> Draft
    Draft --> Active: measurable fields validated + founder activates
    Active --> Superseded: replacement objective activated
    Active --> Completed: target/deadline review completed
    Active --> Cancelled: founder decision
    Draft --> Cancelled
    Completed --> [*]
    Superseded --> [*]
    Cancelled --> [*]
```

Invariant: a partial unique constraint permits only one `Active` objective per workspace.

## Connection and sync

```mermaid
stateDiagram-v2
    [*] --> Pending
    Pending --> Healthy: auth + health check succeed
    Pending --> Error: auth or discovery fails
    Healthy --> Degraded: partial failure or rate limit
    Healthy --> Revoked: founder/provider revocation
    Healthy --> Error: credential or schema failure
    Degraded --> Healthy: successful recovery sync
    Degraded --> Error: recovery exhausted
    Error --> Healthy: reconnect/remap + backfill
    Error --> Revoked
    Revoked --> [*]
```

```mermaid
stateDiagram-v2
    [*] --> Queued
    Queued --> Running
    Running --> Succeeded
    Running --> Partial
    Running --> RetryableFailure
    Running --> TerminalFailure
    RetryableFailure --> Running: bounded retry
    Partial --> Running: resume checkpoint
    Partial --> TerminalFailure: unsafe/incompatible
    Succeeded --> [*]
    TerminalFailure --> [*]
```

## Metric quality

```mermaid
stateDiagram-v2
    [*] --> Unknown
    Unknown --> Current: valid observation
    Current --> Stale: freshness threshold exceeded
    Current --> Conflicted: trusted sources disagree
    Current --> Invalid: definition/tracking failure
    Stale --> Current: successful refresh
    Stale --> Conflicted
    Conflicted --> Current: decision/remap resolves conflict
    Invalid --> Current: corrected definition + recomputation
    Unknown --> Missing: expected source has no value
    Missing --> Current: value observed
```

`0` is a value in `Current`, not a quality state.

## Constraint assessment

```mermaid
stateDiagram-v2
    [*] --> Candidate
    Candidate --> Proposed: deterministic factors computed
    Proposed --> Confirmed: founder confirms
    Proposed --> Overridden: founder selects alternative
    Proposed --> InsufficientEvidence: quality below threshold
    Confirmed --> Superseded: new evidence crosses reconsideration rule
    Overridden --> Superseded: new assessment created
    InsufficientEvidence --> Superseded: evidence improves
    Superseded --> [*]
```

An insufficient assessment names measurement/instrumentation or customer understanding as the constraint; it never fabricates a funnel conclusion.

## Plan

```mermaid
stateDiagram-v2
    [*] --> Draft
    Draft --> Proposed: schema + capacity checks pass
    Proposed --> Approved: founder decision
    Proposed --> Rejected
    Proposed --> Deferred
    Approved --> Active: period begins
    Approved --> Superseded: material edit creates new version
    Active --> Completed: weekly review closes
    Active --> Superseded: approved replacement plan
    Deferred --> Proposed: resubmitted version
    Rejected --> [*]
    Completed --> [*]
    Superseded --> [*]
```

## Experiment lifecycle

```mermaid
stateDiagram-v2
    [*] --> Draft
    Draft --> Proposed: protocol complete
    Proposed --> Approved: founder approves frozen version
    Proposed --> Rejected
    Proposed --> Cancelled
    Approved --> Ready: instrumentation + prerequisites pass
    Approved --> Superseded: material edit creates version
    Ready --> Running: founder launch/completion event
    Ready --> Cancelled
    Running --> Measuring: exposure window closes or checkpoint reached
    Running --> StoppedGuardrail: guardrail breach
    Running --> Cancelled: founder decision
    Running --> Invalid: protocol/tracking invalid
    Measuring --> Concluded: report + classification complete
    Measuring --> Invalid
    StoppedGuardrail --> Concluded: stopped result recorded
    Invalid --> [*]
    Concluded --> [*]
    Rejected --> [*]
    Cancelled --> [*]
    Superseded --> [*]
```

Start guard: approved immutable protocol, instrumentation readiness, owner, start/duration/review date, primary metric, guardrails, minimum evidence, and decision rule.

## Measurement and learning

```mermaid
stateDiagram-v2
    [*] --> DraftReport
    DraftReport --> Validating
    Validating --> Valid
    Validating --> Invalid
    Valid --> Classified: Win/Loss/Inconclusive/Stopped
    Classified --> LearningCandidate
    LearningCandidate --> Promoted: provenance + scope + contradiction checks
    LearningCandidate --> Rejected
    Promoted --> Superseded: later evidence
    Promoted --> Expired: valid-until reached
    Invalid --> [*]
    Rejected --> [*]
    Superseded --> [*]
    Expired --> [*]
```

Only a `Valid` measurement report can create a promotable learning. `Invalid` is an experiment result state, not a durable strategic learning.

## Approval request

```mermaid
stateDiagram-v2
    [*] --> Pending
    Pending --> Granted
    Pending --> Denied
    Pending --> Deferred
    Pending --> Expired
    Granted --> Consumed: exact version/action used
    Granted --> Revoked: before execution
    Deferred --> Pending: resubmitted
    Consumed --> [*]
    Denied --> [*]
    Expired --> [*]
    Revoked --> [*]
```

In V1, approval cannot make a Class D–F action executable; the global V1 policy still blocks it.

## Memory item

```mermaid
stateDiagram-v2
    [*] --> Candidate
    Candidate --> Verified: trusted source or founder confirmation
    Candidate --> Inferred: retained with confidence + expiry
    Candidate --> Rejected
    Verified --> Disputed
    Inferred --> Disputed
    Inferred --> Expired
    Verified --> Superseded
    Inferred --> Superseded
    Disputed --> Verified: resolution decision
    Disputed --> Superseded
    Verified --> Forgotten: privacy workflow
    Inferred --> Forgotten: privacy workflow
    Rejected --> [*]
    Expired --> [*]
    Superseded --> [*]
    Forgotten --> [*]
```

Contradictory items coexist and link to one another until a decision resolves them; history is not silently overwritten.

