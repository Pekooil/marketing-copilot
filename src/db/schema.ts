import { relations, sql } from "drizzle-orm";
import {
  index,
  bigint,
  boolean,
  integer,
  jsonb,
  date,
  numeric,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const appSchema = pgSchema("app");
export const membershipRole = appSchema.enum("membership_role", ["owner", "member"]);
export const membershipStatus = appSchema.enum("membership_status", ["active", "inactive"]);
export const companyProfileStatus = appSchema.enum("company_profile_status", ["draft", "active"]);
export const objectiveStatus = appSchema.enum("objective_status", ["draft", "active", "superseded"]);
export const baselineState = appSchema.enum("baseline_state", ["known", "unknown"]);
export const objectiveDirection = appSchema.enum("objective_direction", ["increase", "decrease"]);
export const riskTolerance = appSchema.enum("risk_tolerance", ["low", "medium", "high"]);
export const mutationStatus = appSchema.enum("mutation_status", ["started", "succeeded", "failed"]);
export const auditActorType = appSchema.enum("audit_actor_type", ["founder", "worker", "support"]);
export const auditResult = appSchema.enum("audit_result", ["succeeded", "denied"]);
export const metricDefinitionStatus = appSchema.enum("metric_definition_status", ["draft", "active"]);
export const metricApprovalState = appSchema.enum("metric_approval_state", ["draft", "founder_approved"]);
export const metricUnit = appSchema.enum("metric_unit", ["count", "percentage", "currency_minor", "seconds", "custom"]);
export const metricAggregation = appSchema.enum("metric_aggregation", ["count", "sum", "average", "unique", "ratio", "latest"]);
export const metricQualityState = appSchema.enum("metric_quality_state", ["current", "stale", "missing", "conflicted", "invalid", "unknown"]);
export const funnelDefinitionStatus = appSchema.enum("funnel_definition_status", ["draft", "active"]);
export const canonicalFunnelStage = appSchema.enum("canonical_funnel_stage", ["awareness", "acquisition", "conversion", "activation", "retention", "revenue", "referral"]);
export const funnelMappingState = appSchema.enum("funnel_mapping_state", ["mapped", "unmapped"]);
export const connectorProvider = appSchema.enum("connector_provider", ["posthog"]);
export const connectorRegion = appSchema.enum("connector_region", ["us", "eu"]);
export const connectorStatus = appSchema.enum("connector_status", ["pending", "healthy", "degraded", "error", "revoked"]);
export const syncRunStatus = appSchema.enum("sync_run_status", ["running", "succeeded", "failed"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const userAccounts = appSchema.table("user_account", {
  id: uuid("id").primaryKey(),
  displayName: text("display_name"),
  revision: integer("revision").notNull().default(1),
  ...timestamps,
});

export const workspaces = appSchema.table(
  "workspace",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    createdBy: uuid("created_by").notNull().references(() => userAccounts.id),
    revision: integer("revision").notNull().default(1),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("workspace_slug_unique").on(table.slug),
    index("workspace_created_by_idx").on(table.createdBy),
    sql`constraint workspace_name_not_blank check (length(trim(${table.name})) > 0)`,
    sql`constraint workspace_slug_format check (${table.slug} ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')`,
    sql`constraint workspace_revision_positive check (${table.revision} > 0)`,
  ],
);

export const memberships = appSchema.table(
  "membership",
  {
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => userAccounts.id, { onDelete: "cascade" }),
    role: membershipRole("role").notNull(),
    status: membershipStatus("status").notNull().default("active"),
    ...timestamps,
  },
  (table) => [
    primaryKey({ name: "membership_pk", columns: [table.workspaceId, table.userId] }),
    index("membership_user_active_idx").on(table.userId, table.status),
    index("membership_workspace_role_idx").on(table.workspaceId, table.role, table.status),
  ],
);

export const workspaceRelations = relations(workspaces, ({ many, one }) => ({
  creator: one(userAccounts, { fields: [workspaces.createdBy], references: [userAccounts.id] }),
  memberships: many(memberships),
}));

export const membershipRelations = relations(memberships, ({ one }) => ({
  workspace: one(workspaces, { fields: [memberships.workspaceId], references: [workspaces.id] }),
  user: one(userAccounts, { fields: [memberships.userId], references: [userAccounts.id] }),
}));

export const companyProfiles = appSchema.table(
  "company_profile",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    currentVersionId: uuid("current_version_id"),
    status: companyProfileStatus("status").notNull().default("draft"),
    ...timestamps,
  },
  (table) => [uniqueIndex("company_profile_workspace_unique").on(table.workspaceId)],
);

export const companyProfileVersions = appSchema.table(
  "company_profile_version",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    companyProfileId: uuid("company_profile_id").notNull().references(() => companyProfiles.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    canonicalPayload: jsonb("canonical_payload").notNull(),
    createdByActor: text("created_by_actor").notNull(),
    founderDecisionRef: text("founder_decision_ref"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("company_profile_version_unique").on(table.companyProfileId, table.version),
    index("company_profile_version_workspace_idx").on(table.workspaceId, table.companyProfileId),
  ],
);

export const sourceRecords = appSchema.table(
  "source_record",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    sourceType: text("source_type").notNull(),
    providerObjectRef: text("provider_object_ref").notNull(),
    contentHash: text("content_hash").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    sensitivity: text("sensitivity").notNull().default("public"),
    storageRef: text("storage_ref"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("source_record_identity_unique").on(
      table.workspaceId,
      table.sourceType,
      table.providerObjectRef,
      table.contentHash,
    ),
    index("source_record_workspace_observed_idx").on(table.workspaceId, table.observedAt),
  ],
);

export const productUnderstandingProposals = appSchema.table(
  "product_understanding_proposal",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    sourceRecordId: uuid("source_record_id").notNull().references(() => sourceRecords.id),
    candidatePayload: jsonb("candidate_payload").notNull(),
    extractorVersion: text("extractor_version").notNull(),
    requestId: uuid("request_id").notNull(),
    createdBy: uuid("created_by").notNull().references(() => userAccounts.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("product_understanding_proposal_request_unique").on(table.workspaceId, table.requestId),
    index("product_understanding_workspace_created_idx").on(table.workspaceId, table.createdAt),
  ],
);

export const productUnderstandingReviews = appSchema.table(
  "product_understanding_review",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    proposalId: uuid("proposal_id").notNull().references(() => productUnderstandingProposals.id),
    profileVersionId: uuid("profile_version_id").notNull().references(() => companyProfileVersions.id),
    correctedPayload: jsonb("corrected_payload").notNull(),
    decisionRef: text("decision_ref").notNull(),
    reviewedBy: uuid("reviewed_by").notNull().references(() => userAccounts.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("product_understanding_review_proposal_unique").on(table.proposalId)],
);

export const contextSnapshots = appSchema.table(
  "context_snapshot",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    profileVersionId: uuid("profile_version_id").notNull().references(() => companyProfileVersions.id),
    snapshotPayload: jsonb("snapshot_payload").notNull(),
    sourceRefs: jsonb("source_refs").notNull(),
    createdBy: uuid("created_by").notNull().references(() => userAccounts.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("context_snapshot_sequence_unique").on(table.workspaceId, table.sequence),
    index("context_snapshot_workspace_created_idx").on(table.workspaceId, table.createdAt),
  ],
);

export const metricDefinitions = appSchema.table(
  "metric_definition",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    nameKey: text("name_key").notNull(),
    currentVersionId: uuid("current_version_id"),
    status: metricDefinitionStatus("status").notNull().default("draft"),
    ...timestamps,
  },
  (table) => [uniqueIndex("metric_definition_workspace_name_unique").on(table.workspaceId, table.nameKey)],
);

export const metricDefinitionVersions = appSchema.table(
  "metric_definition_version",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    metricDefinitionId: uuid("metric_definition_id").notNull().references(() => metricDefinitions.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    name: text("name").notNull(),
    businessDefinition: text("business_definition").notNull(),
    unit: metricUnit("unit").notNull(),
    customUnit: text("custom_unit"),
    aggregation: metricAggregation("aggregation").notNull(),
    segmentContract: jsonb("segment_contract").notNull(),
    sourceContract: jsonb("source_contract").notNull(),
    timezone: text("timezone").notNull(),
    freshnessHours: integer("freshness_hours").notNull(),
    approvalState: metricApprovalState("approval_state").notNull(),
    createdBy: uuid("created_by").notNull().references(() => userAccounts.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("metric_definition_version_unique").on(table.metricDefinitionId, table.version),
    index("metric_definition_version_workspace_idx").on(table.workspaceId, table.metricDefinitionId),
  ],
);

export const manualImportBatches = appSchema.table(
  "manual_import_batch",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    sourceRecordId: uuid("source_record_id").notNull().references(() => sourceRecords.id),
    sourceHash: text("source_hash").notNull(),
    filename: text("filename").notNull(),
    rowCount: integer("row_count").notNull(),
    requestId: uuid("request_id").notNull(),
    createdBy: uuid("created_by").notNull().references(() => userAccounts.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("manual_import_workspace_source_unique").on(table.workspaceId, table.sourceHash),
    uniqueIndex("manual_import_request_unique").on(table.workspaceId, table.requestId),
    index("manual_import_workspace_created_idx").on(table.workspaceId, table.createdAt),
  ],
);

export const connectorConnections = appSchema.table(
  "connector_connection",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    provider: connectorProvider("provider").notNull(),
    providerAccountRef: text("provider_account_ref").notNull(),
    region: connectorRegion("region").notNull(),
    displayName: text("display_name").notNull(),
    status: connectorStatus("status").notNull().default("pending"),
    scopes: jsonb("scopes").notNull().default(["endpoint:read"]),
    authMethod: text("auth_method").notNull().default("oauth_cimd"),
    lastHealthyAt: timestamp("last_healthy_at", { withTimezone: true }),
    lastErrorCode: text("last_error_code"),
    createdBy: uuid("created_by").notNull().references(() => userAccounts.id),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("connector_connection_live_account_unique").on(table.workspaceId, table.provider, table.providerAccountRef).where(sql`${table.status} <> 'revoked'`),
    uniqueIndex("connector_one_live_provider_idx").on(table.workspaceId, table.provider).where(sql`${table.status} <> 'revoked'`),
    index("connector_connection_workspace_idx").on(table.workspaceId, table.status),
  ],
);

export const secretReferences = appSchema.table(
  "secret_reference",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id").notNull().references(() => connectorConnections.id, { onDelete: "cascade" }),
    vaultProvider: text("vault_provider").notNull(),
    vaultKeyRef: text("vault_key_ref").notNull(),
    credentialType: text("credential_type").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    rotatedAt: timestamp("rotated_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("secret_reference_connection_unique").on(table.connectionId)],
);

export const connectorMetricMappings = appSchema.table(
  "connector_metric_mapping",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id").notNull().references(() => connectorConnections.id, { onDelete: "cascade" }),
    metricDefinitionId: uuid("metric_definition_id").notNull().references(() => metricDefinitions.id, { onDelete: "cascade" }),
    currentVersionId: uuid("current_version_id"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("connector_metric_mapping_unique").on(table.connectionId, table.metricDefinitionId),
    index("connector_mapping_workspace_idx").on(table.workspaceId, table.connectionId),
  ],
);

export const connectorMetricMappingVersions = appSchema.table(
  "connector_metric_mapping_version",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    mappingId: uuid("mapping_id").notNull().references(() => connectorMetricMappings.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    endpointName: text("endpoint_name").notNull(),
    endpointVersion: integer("endpoint_version").notNull(),
    approvalState: metricApprovalState("approval_state").notNull().default("founder_approved"),
    approvedBy: uuid("approved_by").notNull().references(() => userAccounts.id),
    decisionRef: text("decision_ref").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("connector_mapping_version_unique").on(table.mappingId, table.version)],
);

export const syncRuns = appSchema.table(
  "sync_run",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id").notNull().references(() => connectorConnections.id),
    status: syncRunStatus("status").notNull().default("running"),
    idempotencyKey: text("idempotency_key").notNull(),
    requestId: uuid("request_id").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    windowEnd: timestamp("window_end", { withTimezone: true }).notNull(),
    segmentKey: text("segment_key").notNull(),
    attempt: integer("attempt").notNull().default(1),
    metricCount: integer("metric_count").notNull(),
    succeededCount: integer("succeeded_count").notNull().default(0),
    errorClass: text("error_class"),
    providerRequestIds: jsonb("provider_request_ids").notNull().default([]),
    checkpoints: jsonb("checkpoints").notNull().default({}),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdBy: uuid("created_by").notNull().references(() => userAccounts.id),
  },
  (table) => [
    uniqueIndex("sync_run_identity_unique").on(table.workspaceId, table.idempotencyKey),
    uniqueIndex("sync_run_request_unique").on(table.workspaceId, table.requestId),
    index("sync_run_workspace_started_idx").on(table.workspaceId, table.startedAt),
  ],
);

export const metricObservations = appSchema.table(
  "metric_observation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    metricDefinitionId: uuid("metric_definition_id").notNull().references(() => metricDefinitions.id),
    importBatchId: uuid("import_batch_id").references(() => manualImportBatches.id),
    syncRunId: uuid("sync_run_id").references(() => syncRuns.id),
    sourceRecordId: uuid("source_record_id").notNull().references(() => sourceRecords.id),
    sourceRowNumber: integer("source_row_number").notNull(),
    rowKey: text("row_key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    windowEnd: timestamp("window_end", { withTimezone: true }).notNull(),
    segmentKey: text("segment_key").notNull(),
    valueNumeric: numeric("value_numeric", { precision: 20, scale: 6 }),
    qualityState: metricQualityState("quality_state").notNull(),
    qualityScore: numeric("quality_score", { precision: 4, scale: 3 }).notNull(),
    freshAsOf: timestamp("fresh_as_of", { withTimezone: true }).notNull(),
    sourceNote: text("source_note").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("metric_observation_row_unique").on(table.importBatchId, table.sourceRowNumber),
    uniqueIndex("metric_observation_identity_unique").on(table.workspaceId, table.metricDefinitionId, table.rowKey, table.sourceRecordId),
    index("metric_observation_scope_idx").on(table.workspaceId, table.metricDefinitionId, table.windowStart, table.windowEnd, table.segmentKey),
    index("metric_observation_sync_run_idx").on(table.workspaceId, table.syncRunId),
  ],
);

export const metricSnapshots = appSchema.table(
  "metric_snapshot",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    metricDefinitionId: uuid("metric_definition_id").notNull().references(() => metricDefinitions.id),
    importBatchId: uuid("import_batch_id").references(() => manualImportBatches.id),
    syncRunId: uuid("sync_run_id").references(() => syncRuns.id),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    windowEnd: timestamp("window_end", { withTimezone: true }).notNull(),
    segmentKey: text("segment_key").notNull(),
    valueNumeric: numeric("value_numeric", { precision: 20, scale: 6 }),
    qualityState: metricQualityState("quality_state").notNull(),
    qualityScore: numeric("quality_score", { precision: 4, scale: 3 }).notNull(),
    freshAsOf: timestamp("fresh_as_of", { withTimezone: true }).notNull(),
    calculationVersion: text("calculation_version").notNull(),
    evidenceRefs: jsonb("evidence_refs").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("metric_snapshot_idempotency_unique").on(table.workspaceId, table.idempotencyKey),
    index("metric_snapshot_latest_idx").on(table.workspaceId, table.metricDefinitionId, table.createdAt),
    index("metric_snapshot_sync_run_idx").on(table.workspaceId, table.syncRunId),
  ],
);

export const funnelDefinitions = appSchema.table(
  "funnel_definition",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    currentVersionId: uuid("current_version_id"),
    status: funnelDefinitionStatus("status").notNull().default("draft"),
    ...timestamps,
  },
  (table) => [uniqueIndex("funnel_definition_workspace_unique").on(table.workspaceId)],
);

export const funnelDefinitionVersions = appSchema.table(
  "funnel_definition_version",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    funnelDefinitionId: uuid("funnel_definition_id").notNull().references(() => funnelDefinitions.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    name: text("name").notNull(),
    approvedBy: uuid("approved_by").notNull().references(() => userAccounts.id),
    decisionRef: text("decision_ref").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("funnel_definition_version_unique").on(table.funnelDefinitionId, table.version)],
);

export const funnelStages = appSchema.table(
  "funnel_stage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    funnelVersionId: uuid("funnel_version_id").notNull().references(() => funnelDefinitionVersions.id, { onDelete: "cascade" }),
    stage: canonicalFunnelStage("stage").notNull(),
    label: text("label").notNull(),
    position: integer("position").notNull(),
    metricDefinitionId: uuid("metric_definition_id").references(() => metricDefinitions.id),
    definition: text("definition").notNull(),
    included: boolean("included").notNull(),
    mappingState: funnelMappingState("mapping_state").notNull(),
    qualityThreshold: numeric("quality_threshold", { precision: 4, scale: 3 }).notNull().default("1"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("funnel_stage_version_stage_unique").on(table.funnelVersionId, table.stage),
    uniqueIndex("funnel_stage_version_position_unique").on(table.funnelVersionId, table.position),
    index("funnel_stage_workspace_version_idx").on(table.workspaceId, table.funnelVersionId, table.position),
  ],
);

export const objectives = appSchema.table(
  "objective",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    currentVersionId: uuid("current_version_id"),
    status: objectiveStatus("status").notNull().default("draft"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("objective_one_active_per_workspace")
      .on(table.workspaceId)
      .where(sql`${table.status} = 'active'`),
    index("objective_workspace_status_idx").on(table.workspaceId, table.status),
  ],
);

export const objectiveVersions = appSchema.table(
  "objective_version",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    objectiveId: uuid("objective_id").notNull().references(() => objectives.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    metricName: text("metric_name"),
    metricDefinition: text("metric_definition"),
    direction: objectiveDirection("direction"),
    targetValue: numeric("target_value", { precision: 20, scale: 6 }),
    baselineValue: numeric("baseline_value", { precision: 20, scale: 6 }),
    baselineState: baselineState("baseline_state").notNull().default("unknown"),
    deadline: date("deadline"),
    targetSegment: text("target_segment"),
    rationale: text("rationale"),
    createdBy: uuid("created_by").notNull().references(() => userAccounts.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("objective_version_unique").on(table.objectiveId, table.version),
    index("objective_version_workspace_idx").on(table.workspaceId, table.objectiveId),
  ],
);

export const resourceConstraints = appSchema.table(
  "resource_constraint",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    objectiveId: uuid("objective_id").notNull().references(() => objectives.id, { onDelete: "cascade" }),
    currentVersionId: uuid("current_version_id"),
    ...timestamps,
  },
  (table) => [uniqueIndex("resource_constraint_objective_unique").on(table.workspaceId, table.objectiveId)],
);

export const resourceConstraintVersions = appSchema.table(
  "resource_constraint_version",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    resourceConstraintId: uuid("resource_constraint_id").notNull().references(() => resourceConstraints.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    founderMinutesPerWeek: integer("founder_minutes_per_week").notNull(),
    cashBudgetMinor: bigint("cash_budget_minor", { mode: "number" }).notNull(),
    currency: text("currency").notNull(),
    riskTolerance: riskTolerance("risk_tolerance").notNull(),
    prohibitedTactics: jsonb("prohibited_tactics").notNull(),
    brandRules: jsonb("brand_rules").notNull(),
    audienceLimits: jsonb("audience_limits").notNull(),
    geographyLimits: jsonb("geography_limits").notNull(),
    approvalPreferences: jsonb("approval_preferences").notNull(),
    createdBy: uuid("created_by").notNull().references(() => userAccounts.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("resource_constraint_version_unique").on(table.resourceConstraintId, table.version),
    index("resource_constraint_version_workspace_idx").on(table.workspaceId, table.resourceConstraintId),
  ],
);

export const mutationReceipts = appSchema.table(
  "mutation_receipt",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    requestId: uuid("request_id").notNull(),
    action: text("action").notNull(),
    status: mutationStatus("status").notNull().default("started"),
    resultRef: text("result_ref"),
    errorCode: text("error_code"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("mutation_receipt_scope_unique").on(table.workspaceId, table.idempotencyKey),
    index("mutation_receipt_request_idx").on(table.workspaceId, table.requestId),
  ],
);

export const auditEvents = appSchema.table(
  "audit_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
    actorType: auditActorType("actor_type").notNull(),
    actorId: text("actor_id").notNull(),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    targetVersion: integer("target_version"),
    requestId: uuid("request_id").notNull(),
    result: auditResult("result").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("audit_event_workspace_created_idx").on(table.workspaceId, table.createdAt),
    uniqueIndex("audit_event_request_action_result_unique").on(
      table.workspaceId,
      table.requestId,
      table.action,
      table.result,
    ),
  ],
);

export const supportAccessGrants = appSchema.table(
  "support_access_grant",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    supportUserId: uuid("support_user_id").notNull().references(() => userAccounts.id, { onDelete: "cascade" }),
    approvedBy: uuid("approved_by").notNull().references(() => userAccounts.id),
    reason: text("reason").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("support_access_lookup_idx").on(table.workspaceId, table.supportUserId, table.expiresAt)],
);
