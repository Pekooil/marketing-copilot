# Planning index

This package holds the product source of truth, implementation contracts, and release evidence. Sprint 3 is technically implemented; its live database and founder acceptance gates remain pending.

## Source and decision controls

- [Planning baseline and decision register](planning-baseline.md)
- [Risk register](risk-register.md)

## Architecture decision records

- [ADR-001: Temporal Cloud workflow engine](architecture/ADR-001-workflow-engine.md)
- [ADR-002: Supabase database, auth, and storage host](architecture/ADR-002-database-auth-host.md)
- [ADR-003: read-only connector strategy](architecture/ADR-003-connector-strategy.md)
- [ADR-004: AI SDK plus AI Gateway model layer](architecture/ADR-004-model-gateway.md)

## Delivery planning

- [Sprint 0 preparation workspace](sprint-0/README.md)
- [Sprint 1 implementation workspace](sprint-1/README.md)
- [Sprint 2 implementation workspace](sprint-2/README.md)
- [Sprint 3 implementation workspace](sprint-3/README.md)
- [Sprint 0–12 purpose roadmap](planning/sprint-roadmap.md)
- [Dependency-ordered vertical-slice plan](planning/vertical-slice-plan.md)
- [Sprint 0 ticket plan](planning/sprint-0-tickets.md)
- [Sprint 1 conditional ticket plan](planning/sprint-1-gate.md)

## Product and engineering contracts

- [Initial relational schema](domain/relational-schema.md)
- [State-transition diagrams](domain/state-transitions.md)
- [Canonical artifact JSON Schema bundle](domain/canonical-artifacts.schema.json)
- [Artifact schema guide](domain/artifact-schemas.md)
- [API contracts and authorization matrix](api/contracts-and-authorization.md)

## Quality, research, and experience

- [Evaluation dataset format and rubrics](evaluation/dataset-and-rubrics.md)
- [Testing strategy](testing/strategy.md)
- [Phase 0 concierge study protocol](research/phase-0-concierge-study.md)
- [Scoped V1 design brief and wireframe inventory](design/v1-design-brief.md)

## Gate hierarchy

1. Sprint 0 validates the adaptive decision loop, connector prevalence, artifact value, and willingness to pay.
2. The founder/product owner records a go, iterate, or stop decision.
3. A go decision accepts or revises the proposed ADRs and authorizes Sprint 1 planning at ticket level.
4. Only then may implementation begin.
