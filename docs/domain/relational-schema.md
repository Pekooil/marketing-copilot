# Initial relational schema

**Status:** Proposed logical schema; no migration has been authorized.  
**Database:** PostgreSQL  
**Conventions:** UUID/opaque IDs, `timestamptz`, append-only versions and decisions, `jsonb` only for bounded typed payloads.

## Cross-cutting rules

- Every workspace-owned top-level table includes `workspace_id uuid not null` and an index beginning with `workspace_id`.
- Child tables use composite foreign keys `(workspace_id, parent_id)` where practical so tenant mismatch is impossible at the database boundary.
- All mutable records carry `created_at`, `updated_at`, and optimistic `revision`; versioned/append-only records omit mutable replacement semantics.
- Human and service actors use a common `actor_type`/`actor_id` reference in audit records; model outputs reference `agent_run_id`.
- Soft lifecycle states are explicit. Privacy deletion uses a controlled tombstone/erasure workflow rather than ad-hoc soft deletes.
- Money is integer minor units plus ISO currency. Rates and scores use decimal, not floating point.
- Raw connector secrets are never stored; only managed encrypted secret references are stored.

## Identity and tenancy

### `user_account`

`id`, `external_auth_subject` unique, `email_normalized`, `display_name`, `status`, timestamps.

### `workspace`

`id`, `name`, `slug`, `timezone`, `status`, `retention_policy_id`, timestamps.

### `membership`

`workspace_id`, `user_id`, `role` (`owner|admin|member|viewer|support`), `status`, `invited_by`, `joined_at`; primary key `(workspace_id,user_id)`.

Invariants: every active workspace has at least one active owner; support access is time-bound and separately audited.

## Company, objective, and resources

### `company_profile`

`id`, `workspace_id`, `current_version_id`, `status`, timestamps.

### `company_profile_version`

`id`, `workspace_id`, `company_profile_id`, `version`, `canonical_payload jsonb`, `created_by_actor`, `agent_run_id nullable`, `created_at`; unique `(company_profile_id,version)`.

Each field in the payload carries `value`, `verification_state`, `confidence`, and source/evidence IDs. Verified values cannot originate from an agent alone.

### `objective`

`id`, `workspace_id`, `metric_definition_id nullable`, `name`, `target_value`, `baseline_value nullable`, `baseline_state`, `deadline`, `target_segment jsonb`, `why_it_matters`, `status`, `version`, timestamps.

Invariants: one `active` objective per workspace through a partial unique index; active requires measurable metric, target, deadline, segment, and rationale. Unknown baseline is allowed and distinct from zero.

### `resource_constraint`

`id`, `workspace_id`, `objective_id`, `founder_minutes_per_week`, `cash_budget_minor`, `currency`, `risk_tolerance`, `prohibited_tactics jsonb`, `brand_constraints jsonb`, `geography_constraints jsonb`, `approval_preferences jsonb`, `version`, timestamps.

## Connections and ingestion

### `connection`

`id`, `workspace_id`, `provider`, `provider_account_ref`, `region`, `status`, `scopes jsonb`, `auth_method`, `last_healthy_at`, `last_error_code`, timestamps; unique `(workspace_id,provider,provider_account_ref)`.

### `secret_reference`

`id`, `workspace_id`, `connection_id`, `vault_provider`, `vault_key_ref`, `credential_type`, `expires_at`, `rotated_at`, `revoked_at`, timestamps. No credential material.

### `sync_run`

`id`, `workspace_id`, `connection_id`, `workflow_run_ref`, `sync_type`, `range_start`, `range_end`, `checkpoint_before jsonb`, `checkpoint_after jsonb`, `status`, `attempt`, `idempotency_key`, `started_at`, `completed_at`, `error_class`; unique `(connection_id,idempotency_key)`.

### `source_record`

`id`, `workspace_id`, `connection_id nullable`, `sync_run_id nullable`, `source_type`, `provider_object_ref`, `content_hash`, `observed_at`, `metadata jsonb`, `sensitivity`, `storage_ref nullable`, `created_at`; unique `(workspace_id,source_type,provider_object_ref,content_hash)`.

Store metadata/aggregate lineage by default. Raw source storage requires an explicit retention and sensitivity policy.

## Metrics and funnel

### `metric_definition`

`id`, `workspace_id`, `name`, `business_definition`, `unit`, `aggregation`, `numerator_metric_id nullable`, `denominator_metric_id nullable`, `segment_contract jsonb`, `source_contract jsonb`, `query_version`, `timezone`, `approval_state`, `version`, timestamps.

### `metric_snapshot`

`id`, `workspace_id`, `metric_definition_id`, `window_start`, `window_end`, `segment_key`, `value_numeric nullable`, `numerator_value nullable`, `denominator_value nullable`, `quality_state`, `quality_score`, `fresh_as_of`, `calculation_version`, `source_run_id nullable`, `idempotency_key`, `created_at`; unique `(workspace_id,idempotency_key)`.

`value_numeric` must be null for `missing|unknown|invalid`; zero is a valid value only with a successful observation. Conflicted snapshots preserve each candidate source through evidence links.

### `funnel_definition`

`id`, `workspace_id`, `name`, `status`, `current_version`, `approved_by`, timestamps.

### `funnel_stage`

`id`, `workspace_id`, `funnel_id`, `stage` (`awareness|acquisition|conversion|activation|retention|revenue|referral`), `position`, `metric_definition_id nullable`, `definition`, `mapping_state`, `quality_threshold`, `version`; unique `(funnel_id,stage,version)`.

## Evidence, diagnosis, and planning

### `observation`

`id`, `workspace_id`, `artifact_id`, `observation_type`, `statement`, `fact_state`, `confidence`, `observed_at`, `valid_until`, `created_at`.

### `constraint_assessment`

`id`, `workspace_id`, `objective_id`, `version`, `primary_stage`, `score`, `confidence`, `data_quality`, `status`, `reconsideration_rule jsonb`, `predecessor_id nullable`, `change_reason`, `founder_decision_id nullable`, `agent_run_id`, `created_at`; unique `(objective_id,version)`.

### `constraint_candidate`

`id`, `workspace_id`, `assessment_id`, `stage_or_problem`, `impact`, `reach`, `tractability`, `evidence_quality`, `urgency`, `score`, `rank`, `rationale`; score is code-computed and factors are constrained to `[0,1]`.

### `hypothesis`

`id`, `workspace_id`, `constraint_assessment_id`, `statement`, `mechanism`, `target_segment jsonb`, `confidence`, `status`, `created_by_agent_run_id`, timestamps.

### `plan`

`id`, `workspace_id`, `objective_id`, `constraint_assessment_id`, `period_start`, `period_end`, `version`, `status`, `founder_minutes_cap`, `cash_cap_minor`, `currency`, `approved_decision_id nullable`, `predecessor_id nullable`, `change_explanation`, timestamps; unique `(workspace_id,period_start,version)`.

### `allocation`

`id`, `workspace_id`, `plan_id`, `theme`, `founder_minutes`, `cash_minor`, `agent_budget_minor`, `rationale`; plan totals cannot exceed caps without an explicit override decision.

## Experiments and prepared work

### `experiment`

`id`, `workspace_id`, `objective_id`, `constraint_assessment_id`, `hypothesis_id`, `title`, `theme`, `status`, `current_version_id`, `owner_type`, `owner_id`, timestamps.

### `experiment_version`

`id`, `workspace_id`, `experiment_id`, `version`, `protocol jsonb`, `protocol_hash`, `approval_state`, `approved_decision_id nullable`, `created_by_actor`, `created_at`; unique `(experiment_id,version)`. Approved versions are immutable.

The typed protocol includes target, intervention, comparison, exposure, primary metric, guardrails, baseline, expected effect, minimum evidence, duration, review date, founder effort, cash, risk, prerequisites, and decision rule.

### `experiment_exposure`

`id`, `workspace_id`, `experiment_id`, `experiment_version_id`, `window_start`, `window_end`, `segment_key`, `exposed_count`, `comparison_count nullable`, `quality_state`, `source_snapshot_ids jsonb`, `created_at`.

### `prepared_asset`

`id`, `workspace_id`, `experiment_id`, `asset_type`, `current_version`, `status`, `sensitivity`, timestamps.

### `prepared_asset_version`

`id`, `workspace_id`, `prepared_asset_id`, `version`, `content_ref`, `structured_payload jsonb`, `agent_run_id nullable`, `created_by_actor`, `created_at`; unique `(prepared_asset_id,version)`.

## Measurement and memory

### `measurement_report`

`id`, `workspace_id`, `experiment_id`, `experiment_version_id`, `version`, `validity_state`, `result_classification`, `primary_result jsonb`, `guardrail_results jsonb`, `raw_counts jsonb`, `uncertainty jsonb`, `protocol_deviations jsonb`, `data_quality`, `agent_run_id nullable`, `created_at`; unique `(experiment_id,version)`.

Result classification is code-derived from the approved decision rule when possible and can be human-overridden only through a decision record.

### `learning`

`id`, `workspace_id`, `measurement_report_id`, `statement`, `scope jsonb`, `confidence`, `verification_state`, `valid_from`, `valid_until`, `status`, `founder_review_decision_id nullable`, timestamps.

### `memory_item`

`id`, `workspace_id`, `memory_type`, `canonical_statement`, `structured_payload jsonb`, `confidence`, `verification_state`, `sensitivity`, `valid_from`, `valid_until`, `superseded_by_id nullable`, `status`, timestamps.

### `memory_tag`

`workspace_id`, `memory_item_id`, `tag_type`, `tag_value`; primary key across all four fields.

### `memory_contradiction`

`workspace_id`, `left_memory_id`, `right_memory_id`, `state`, `resolution_decision_id nullable`, `created_at`; canonical ordering prevents duplicates.

## Provenance, decisions, permissions, and runs

### `artifact`

`id`, `workspace_id`, `artifact_type`, `schema_version`, `status`, `author_capability`, `agent_run_id nullable`, `payload jsonb`, `content_hash`, `created_at`.

### `evidence_link`

`id`, `workspace_id`, `from_type`, `from_id`, `to_type`, `to_id`, `relation`, `quote_or_calculation_ref nullable`, `created_at`; unique edge constraint.

### `decision_record`

`id`, `workspace_id`, `decision_type`, `target_type`, `target_id`, `target_version`, `outcome`, `reason`, `actor_user_id`, `supersedes_decision_id nullable`, `created_at`. Append-only.

### `permission_grant`

`id`, `workspace_id`, `capability`, `action_type`, `connection_id nullable`, `resource_scope jsonb`, `volume_cap jsonb`, `monetary_cap jsonb`, `content_constraints jsonb`, `approval_mode`, `starts_at`, `expires_at`, `revoked_at`, `approver_user_id`, `created_at`.

V1 permits only Class A reads, Class B internal writes, and Class C reversible preparation. Class D–F actions are denied regardless of grants.

### `approval_request`

`id`, `workspace_id`, `target_type`, `target_id`, `target_version`, `risk_class`, `preview_ref`, `expected_cost jsonb`, `risk_summary`, `status`, `expires_at`, timestamps.

### `execution_record`

`id`, `workspace_id`, `permission_grant_id`, `approval_request_id nullable`, `experiment_id nullable`, `action_type`, `target_ref`, `idempotency_key`, `status`, `attempted_at`, `result_ref`, `error_class`; unique `(workspace_id,idempotency_key)`. V1 should contain no Class D–F successful records.

### `context_snapshot`

`id`, `workspace_id`, `version`, `objective_id`, `constraint_assessment_id`, `input_refs jsonb`, `permission_snapshot jsonb`, `content_hash`, `created_at`; immutable.

### `agent_run`

`id`, `workspace_id`, `capability`, `trigger_type`, `context_snapshot_id`, `workflow_run_ref`, `prompt_release`, `schema_id`, `schema_version`, `status`, `budget jsonb`, `usage jsonb`, `started_at`, `completed_at`, `error_class`.

### `model_call`

`id`, `workspace_id`, `agent_run_id`, `sequence`, `gateway`, `provider`, `model`, `model_release`, `prompt_release`, `schema_version`, `latency_ms`, `input_tokens`, `output_tokens`, `cost_minor`, `currency`, `finish_state`, `validation_state`, `trace_ref`, `created_at`.

### `audit_event`

`id`, `workspace_id`, `actor_type`, `actor_id`, `action`, `target_type`, `target_id`, `request_id`, `ip_hash nullable`, `metadata jsonb`, `created_at`; append-only and separately retained.

## Initial index and partition guidance

- Composite indexes: `(workspace_id,status)`, `(workspace_id,created_at desc)`, and domain-specific current-state lookups.
- Metric snapshots: `(workspace_id,metric_definition_id,segment_key,window_end desc)`.
- Evidence links: both `(workspace_id,from_type,from_id)` and `(workspace_id,to_type,to_id)`.
- Memory retrieval: structured tag indexes first; add `pgvector` only after retrieval evals justify embeddings.
- Do not partition before observed volume requires it. `metric_snapshot`, `audit_event`, and `model_call` are the first candidates.

## Open schema decisions for Sprint 1 planning

- Whether Supabase Auth identities can be referenced directly or always through `user_account`.
- Whether application tables live in `public` with revoked grants or a dedicated schema.
- Exact object-storage metadata and retention policy shape.
- Whether polymorphic evidence edges are enforced by application validation or typed join tables.
- Which JSON payloads become first-class columns after Sprint 0 fixtures stabilize the contracts.

