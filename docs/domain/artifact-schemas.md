# Canonical artifact schema guide

The machine-valid bundle is [canonical-artifacts.schema.json](canonical-artifacts.schema.json). It uses JSON Schema 2020-12 and defines the eleven canonical artifacts named by the source of truth:

1. `ObservationPacket`
2. `ResearchFinding`
3. `ConstraintCandidate`
4. `Hypothesis`
5. `ExperimentProposal`
6. `PreparedAsset`
7. `ExecutionRequest`
8. `MeasurementReport`
9. `LearningCandidate`
10. `AllocationProposal`
11. `DecisionRecord`

## Envelope policy

Every artifact requires:

- stable artifact/workspace IDs;
- artifact type and schema version;
- author capability and creation time;
- immutable context snapshot ID;
- input artifact/source/memory references;
- confidence and status;
- provenance references;
- fact/inference/unknown labeling where claims are present.

Machine consumers validate with `additionalProperties: false`. Version changes follow semantic rules:

- patch: descriptions/examples only, no validation change;
- minor: backward-compatible optional fields or enum additions with tolerant readers;
- major: required fields, meaning, or state changes.

Artifacts are immutable. Corrections create a new artifact linked through a decision or supersession relation.

## Validation pipeline

1. Parse strict JSON.
2. Validate against the exact artifact and schema version.
3. Resolve every referenced ID within the same workspace.
4. Check numeric claims against supplied metric snapshots/calculation references.
5. Run permission and risk policy validation.
6. Run duplication/contradiction checks where applicable.
7. Persist the artifact and evidence edges in one transaction.
8. Render founder-facing prose only from the validated structure.

One repair attempt is allowed for schema-invalid model output. A second failure ends the run visibly.

## Known refinements before implementation

- Factor weights and expected-impact shapes require Sprint 0 fixtures.
- `PreparedAsset.content` may move to object storage with only metadata in the artifact.
- `ExecutionRequest` remains schema-defined for future planning and policy testing, but V1 policy rejects Class D–F actions and permits no external execution.
- Exact metric value representation may need integer/decimal/unit discriminators after the manual metric template is validated.

