# ADR-004: AI SDK plus AI Gateway model layer

**Status:** Proposed  
**Decision owner:** AI/evaluation lead  
**Review gate:** Sprint 0 go decision and model-gateway spike

## Context

The product needs strict structured artifacts, model routing by task, version pinning, cost/latency capture, provider failover, and the ability to replace a provider without changing domain logic. It explicitly rejects unrestricted tool loops and hidden model state as sources of truth.

## Decision

Use the Vercel AI SDK for typed generation and tool contracts, with Vercel AI Gateway as the default production routing layer. Wrap both behind an application-owned `ModelGateway` interface. Use AI SDK v6 structured output (`generateText` with `Output.object`) for machine-consumed artifacts; do not use a general autonomous agent loop for strategic workflows.

Model IDs, provider routes, fallback order, prompts, schema versions, budgets, and safety settings are configuration tied to an evaluation release. Domain code sees capabilities such as `extract_company_profile` or `synthesize_constraint`, never provider model names.

Current official references: [AI Gateway overview](https://vercel.com/docs/ai-gateway), [models and providers](https://vercel.com/docs/ai-gateway/models-and-providers), and [provider routing options](https://vercel.com/docs/ai-gateway/models-and-providers/provider-options).

## Boundaries

`ModelGateway.generateArtifact` accepts:

- capability and intended artifact type;
- immutable context snapshot ID/version;
- prompt/policy release ID;
- JSON Schema ID/version;
- allowed typed tools and maximum calls;
- token, time, and monetary budgets;
- privacy/redaction policy;
- idempotency/correlation key.

It returns validated structured data plus provider/model/version, latency, usage, cost, finish state, refusal, validation attempts, and trace reference. It does not persist domain artifacts directly.

## Alternatives considered

| Alternative | Decision | Reason |
|---|---|---|
| Official provider SDKs behind an internal adapter | Fallback | Maximum provider feature access, but more routing and telemetry work. Retain an escape hatch for provider-only features. |
| Direct AI Gateway OpenAI-compatible calls | Defer | Unified endpoint but weaker TypeScript schema/tool ergonomics than AI SDK for this stack. |
| LangGraph or another agent framework | Reject as source of orchestration truth | Strategic flows require code-defined states, budgets, permissions, and durable product records. |
| One fixed provider/model | Reject | Prevents task-based routing, controlled failover, and evaluation-driven releases. |

## Safety and reliability rules

- One automatic schema repair attempt, then visible failure.
- Numeric strategic claims must cite supplied metric/evidence IDs; validators reject uncited claims.
- Retrieved content is untrusted quoted data and never modifies system or policy instructions.
- Tools are allowlisted per workflow and accept narrow schemas; no raw SQL, arbitrary URLs, recipient lists, or executable code.
- Failover is allowed only among models that passed the artifact-specific eval suite; a provider outage cannot silently switch to an unqualified model.
- Prompt/completion content logging is off by default at third-party gateways; internal privacy-safe traces store concise rationales and artifacts, not hidden chain-of-thought.
- The application enforces preflight budgets and stores post-call actual usage; gateway dashboards are supplementary.

## Validation before acceptance

1. Generate representative `ObservationPacket`, `ConstraintCandidate`, and `ExperimentProposal` fixtures with strict schema validation.
2. Prove model/provider failover only to eval-qualified releases.
3. Compare direct-provider and gateway latency, cost, refusal, and structured-output validity.
4. Verify regional/privacy requirements and content-retention settings.
5. Demonstrate replay using the stored input snapshot and release metadata.
6. Demonstrate a fake gateway adapter for deterministic tests.

## Rollback

Change routing configuration to an already-qualified model or swap the `ModelGateway` adapter. Keep prompts, schemas, context snapshots, artifacts, and run records provider-neutral. Every release stores its previous working configuration for rollback.

