# ADR-001: Temporal Cloud workflow engine

**Status:** Proposed  
**Decision owner:** Engineering lead  
**Review gate:** Sprint 0 go decision  
**Applies no earlier than:** Sprint 1 foundation design; durable product workflows begin only when their vertical slice requires them

## Context

Connector syncs, scheduled reviews, retryable model/tool activities, experiment checkpoints, and later human approval pauses must survive process restarts. Request handlers cannot own these lifecycles, and the domain must remain independent of a workflow vendor.

## Decision

Use Temporal Cloud with the TypeScript SDK and a dedicated Node worker. All workflow code sits behind a domain-owned `WorkflowScheduler`/`WorkflowHandle` interface. Next.js request handlers enqueue or signal work and return; they do not execute long-running orchestration.

The application database remains the product source of truth. Temporal history is execution history, not the authoritative plan, permission, experiment, or memory store.

## Why this option

- Temporal documents durable execution that resumes after process, network, or infrastructure failure.
- Signals and Updates support recorded interaction with running workflows, fitting future approval/resume flows.
- Activity retry and idempotency boundaries align with connectors and model calls.
- A domain port prevents workflow concepts from leaking into route handlers or core entities.

Official references: [Temporal durable execution](https://docs.temporal.io/) and [TypeScript workflow message passing](https://docs.temporal.io/develop/typescript/workflows/message-passing).

## Alternatives considered

| Alternative | Decision | Reason |
|---|---|---|
| Trigger.dev or Inngest | Reserve fallback | Lower initial operational load, but the source anticipates long-lived waits and restartable multi-step workflows. Reconsider if the Temporal spike exceeds the small team’s capacity. |
| Database queue plus cron | Reject for V1 target | Fine for a concierge prototype, but hand-built retries, timers, pause/resume, and execution history become product-critical infrastructure. |
| Run workflows in Next.js handlers | Reject | Violates bounded request lifetimes and safe restart requirements. |
| Agent framework as orchestrator | Reject | Permissions, state transitions, budgets, and memory must remain deterministic domain concerns. |

## Boundary contract

The domain port must support:

- start with deterministic workflow ID and idempotency key;
- signal/update a running workflow with an authenticated decision reference;
- query status without treating it as domain truth;
- cancel/terminate under an audited policy decision;
- schedule recurring work in a workspace timezone;
- record workflow/run correlation IDs in `agent_run`, `sync_run`, and `audit_event`.

Workflow inputs carry stable IDs and immutable snapshot/version references, never raw secrets or large customer event payloads.

## Validation before acceptance

1. Demonstrate crash/restart recovery around a fake connector activity.
2. Demonstrate duplicate delivery without duplicate `metric_snapshot` or `decision_record` creation.
3. Demonstrate a workflow pausing for and resuming from an authenticated decision.
4. Measure local developer setup, Cloud cost floor, deployment steps, trace reconstruction, and test ergonomics.
5. Confirm a non-Temporal in-memory/test adapter can run deterministic domain tests.

## Migration and rollback

- Introduce the domain port before any vendor adapter.
- Workflow definitions are versioned; incompatible changes use a new workflow type/version.
- If the spike fails, implement the same port with Trigger.dev or Inngest. Domain tables and APIs remain unchanged.
- Never remove or rewrite product records when replacing workflow execution history.

## Observability and acceptance

Capture workflow ID, type/version, workspace, parent run, queue delay, retry count, terminal state, and correlated domain artifact IDs. Acceptance requires reproducible recovery from a worker crash without duplicate domain effects.

