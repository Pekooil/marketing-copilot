import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import postgres from "postgres";

const databaseUrl = process.env.DATABASE_TEST_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_TEST_URL or DATABASE_URL is required.");
if (process.env.ALLOW_DB_GATE_WRITES !== "1") {
  throw new Error("Set ALLOW_DB_GATE_WRITES=1 for the dedicated non-production gate database.");
}

const founderA = "10000000-0000-0000-0000-000000000001";
const founderB = "20000000-0000-0000-0000-000000000002";
const workspaceA = "a0000000-0000-0000-0000-000000000001";
const workspaceB = "b0000000-0000-0000-0000-000000000002";
const databaseHost = new URL(databaseUrl).hostname;
const ssl = databaseHost === "localhost" || databaseHost === "127.0.0.1" ? false : "require";
const sql = postgres(databaseUrl, { max: 1, prepare: false, ssl });
const passed = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function expectDatabaseError(label, expectedCodes, work) {
  const acceptedCodes = Array.isArray(expectedCodes) ? expectedCodes : [expectedCodes];
  try {
    await work();
  } catch (error) {
    if (acceptedCodes.includes(error?.code)) {
      passed.push(label);
      return;
    }
    throw error;
  }
  throw new Error(`${label}: expected PostgreSQL error ${acceptedCodes.join(" or ")}`);
}

function asAuthenticated(userId, work) {
  return sql.begin(async (transaction) => {
    await transaction.unsafe("set local role authenticated");
    await transaction`select set_config('request.jwt.claim.sub', ${userId}, true)`;
    return work(transaction);
  });
}

function asWorker(workspaceId, work) {
  return sql.begin(async (transaction) => {
    await transaction.unsafe("set local role app_worker");
    if (workspaceId) {
      await transaction`select set_config('app.workspace_id', ${workspaceId}, true)`;
    }
    return work(transaction);
  });
}

const draft = {
  workspaceName: "Founder A Workspace",
  companyName: "Gate Test Company",
  productSummary: "Helps technical founders make evidence-backed growth decisions.",
  metricName: "Weekly activated accounts",
  metricDefinition: "Accounts completing activation in a UTC week",
  direction: "increase",
  targetValue: "20",
  baselineState: "known",
  baselineValue: "0",
  deadline: "2099-09-30",
  targetSegment: "Self-serve technical founders",
  rationale: "Activation is the current constraint.",
  founderHours: "5",
  cashBudget: "100",
  currency: "USD",
  riskTolerance: "low",
  prohibitedTactics: "unsolicited outreach",
  brandRules: "no unsupported superlatives",
};

try {
  const seed = await readFile(resolve("supabase/seed.sql"), "utf8");
  await sql.unsafe(seed);

  await asAuthenticated(founderA, async (transaction) => {
    const own = await transaction`select id from app.workspace where id = ${workspaceA}`;
    const foreign = await transaction`select id from app.workspace where id = ${workspaceB}`;
    assert(own.length === 1 && foreign.length === 0, "Founder A select isolation failed");
  });
  passed.push("authenticated select isolation");

  await expectDatabaseError("forged workspace insert denied", "42501", () =>
    asAuthenticated(founderA, (transaction) => transaction`
      insert into app.company_profile (workspace_id) values (${workspaceB})
    `),
  );

  await asAuthenticated(founderA, async (transaction) => {
    const updated = await transaction`
      update app.workspace set name = 'forbidden' where id = ${workspaceB} returning id
    `;
    const deleted = await transaction`
      delete from app.membership
      where workspace_id = ${workspaceB} and user_id = ${founderB}
      returning workspace_id
    `;
    assert(updated.length === 0 && deleted.length === 0, "Cross-tenant mutations were visible");
  });
  passed.push("cross-tenant update and delete isolation");

  await asWorker(null, async (transaction) => {
    const rows = await transaction`select id from app.workspace`;
    assert(rows.length === 0, "Worker without scope could read workspaces");
  });
  await asWorker(workspaceA, async (transaction) => {
    const own = await transaction`select id from app.workspace where id = ${workspaceA}`;
    const foreign = await transaction`select id from app.workspace where id = ${workspaceB}`;
    assert(own.length === 1 && foreign.length === 0, "Worker scope isolation failed");
  });
  passed.push("worker scope required and isolated");

  await expectDatabaseError("anonymous app schema access denied", "42501", () =>
    sql.begin(async (transaction) => {
      await transaction.unsafe("set local role anon");
      await transaction`select id from app.workspace`;
    }),
  );

  await expectDatabaseError("last active owner constraint", "23514", () =>
    asAuthenticated(founderA, (transaction) => transaction`
      delete from app.membership
      where workspace_id = ${workspaceA} and user_id = ${founderA}
    `),
  );

  await expectDatabaseError("one active objective constraint", "23505", () =>
    asWorker(workspaceB, async (transaction) => {
      const objectiveOne = randomUUID();
      const objectiveTwo = randomUUID();
      const versionOne = randomUUID();
      const versionTwo = randomUUID();
      await transaction`
        insert into app.objective (id, workspace_id)
        values (${objectiveOne}, ${workspaceB}), (${objectiveTwo}, ${workspaceB})
      `;
      await transaction`
        insert into app.objective_version (
          id, workspace_id, objective_id, version, metric_name, metric_definition,
          direction, target_value, baseline_value, baseline_state, deadline,
          target_segment, rationale, created_by
        ) values
          (${versionOne}, ${workspaceB}, ${objectiveOne}, 1, 'Activation', 'UTC week',
            'increase', 20, 0, 'known', '2099-09-30', 'Founders', 'Gate', ${founderB}),
          (${versionTwo}, ${workspaceB}, ${objectiveTwo}, 1, 'Retention', 'UTC week',
            'increase', 30, 0, 'known', '2099-09-30', 'Founders', 'Gate', ${founderB})
      `;
      await transaction`update app.objective set current_version_id = ${versionOne}, status = 'active' where id = ${objectiveOne}`;
      await transaction`update app.objective set current_version_id = ${versionTwo}, status = 'active' where id = ${objectiveTwo}`;
    }),
  );

  const auditId = randomUUID();
  await asWorker(workspaceA, (transaction) => transaction`
    insert into app.audit_event (
      id, workspace_id, actor_type, actor_id, action, target_type,
      target_id, request_id, result, metadata
    ) values (
      ${auditId}, ${workspaceA}, 'worker', 'gate-worker', 'gate.append_only',
      'workspace', ${workspaceA}, ${randomUUID()}, 'succeeded', '{}'
    )
  `);
  await expectDatabaseError("audit update blocked", ["42501", "55000"], () =>
    asWorker(workspaceA, (transaction) => transaction`
      update app.audit_event set action = 'changed' where id = ${auditId}
    `),
  );
  await expectDatabaseError("audit delete blocked", ["42501", "55000"], () =>
    asWorker(workspaceA, (transaction) => transaction`
      delete from app.audit_event where id = ${auditId}
    `),
  );

  await sql.unsafe("drop table if exists app.__gate_default_deny");
  await sql.unsafe("create table app.__gate_default_deny (id uuid primary key)");
  const [defaultDeny] = await sql`
    select c.relrowsecurity,
      has_table_privilege('authenticated', 'app.__gate_default_deny', 'select') as authenticated_select,
      has_table_privilege('anon', 'app.__gate_default_deny', 'select') as anon_select
    from pg_class c
    inner join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'app' and c.relname = '__gate_default_deny'
  `;
  assert(
    defaultDeny?.relrowsecurity === true &&
      defaultDeny.authenticated_select === false &&
      defaultDeny.anon_select === false,
    "New app table was not default-denied",
  );
  await sql.unsafe("drop table app.__gate_default_deny");
  passed.push("new app table default deny");

  let state = await asAuthenticated(founderA, async (transaction) => {
    const [row] = await transaction`
      select public.get_onboarding_state(${workspaceA}) as state
    `;
    return row.state;
  });
  const requestId = randomUUID();
  const idempotencyKey = `gate-${requestId}`;
  state = await asAuthenticated(founderA, async (transaction) => {
    const [row] = await transaction`
      select public.save_onboarding(
        ${workspaceA}, 0, false, ${requestId}, ${idempotencyKey},
        ${sql.json(state.versions)}, ${sql.json(draft)}
      ) as state
    `;
    return row.state;
  });
  const [{ count: profileCountBeforeReplay }] = await sql`
    select count(*)::integer as count from app.company_profile_version
    where workspace_id = ${workspaceA}
  `;
  await asAuthenticated(founderA, (transaction) => transaction`
    select public.save_onboarding(
      ${workspaceA}, 0, false, ${requestId}, ${idempotencyKey},
      ${sql.json({ ...state.versions, profile: state.versions.profile - 1 })},
      ${sql.json(draft)}
    )
  `);
  const [{ count: profileCountAfterReplay }] = await sql`
    select count(*)::integer as count from app.company_profile_version
    where workspace_id = ${workspaceA}
  `;
  assert(profileCountBeforeReplay === profileCountAfterReplay, "Idempotent replay added a version");
  passed.push("onboarding idempotent replay");

  await expectDatabaseError("onboarding stale write conflict", "40001", () =>
    asAuthenticated(founderA, (transaction) => transaction`
      select public.save_onboarding(
        ${workspaceA}, 0, false, ${randomUUID()}, ${`gate-${randomUUID()}`},
        ${sql.json({ ...state.versions, profile: Math.max(0, state.versions.profile - 1) })},
        ${sql.json(draft)}
      )
    `),
  );

  for (const step of [1, 2]) {
    state = await asAuthenticated(founderA, async (transaction) => {
      const [row] = await transaction`
        select public.save_onboarding(
          ${workspaceA}, ${step}, false, ${randomUUID()}, ${`gate-${randomUUID()}`},
          ${sql.json(state.versions)}, ${sql.json(draft)}
        ) as state
      `;
      return row.state;
    });
  }
  state = await asAuthenticated(founderA, async (transaction) => {
    const [row] = await transaction`
      select public.save_onboarding(
        ${workspaceA}, 3, true, ${randomUUID()}, ${`gate-${randomUUID()}`},
        ${sql.json(state.versions)}, ${sql.json(draft)}
      ) as state
    `;
    return row.state;
  });
  assert(state.activated === true && state.step === 3, "Onboarding activation did not persist");
  passed.push("onboarding profile, objective, resources, and activation");

  const proposalRequest = randomUUID();
  const productCandidate = {
    companyName: {
      value: "Gate Test Company",
      verificationState: "evidence_supported",
      confidence: 0.86,
      evidence: [{ selector: "page title", quote: "Gate Test Company" }],
    },
    productSummary: {
      value: "Evidence-backed growth decisions for technical founders.",
      verificationState: "evidence_supported",
      confidence: 0.9,
      evidence: [{ selector: "meta description", quote: "Evidence-backed growth decisions for technical founders." }],
    },
  };
  let productState = await asAuthenticated(founderA, async (transaction) => {
    const [row] = await transaction`
      select public.save_product_understanding_proposal(
        ${workspaceA}, ${proposalRequest}, ${`product-${proposalRequest}`},
        'https://gate.example/', 'https://gate.example/', ${"a".repeat(64)},
        '2026-08-16T12:00:00.000Z'::timestamptz,
        ${sql.json({ title: "Gate Test Company", retainedRawBody: false })},
        ${sql.json(productCandidate)}, 'deterministic-html-v1'
      ) as state
    `;
    return row.state;
  });
  assert(
    productState.proposal?.candidate?.companyName?.verificationState === "evidence_supported" &&
      !productState.verifiedSnapshot,
    "Analysis incorrectly created verified context",
  );

  const verificationRequest = randomUUID();
  productState = await asAuthenticated(founderA, async (transaction) => {
    const [row] = await transaction`
      select public.verify_product_understanding(
        ${workspaceA}, ${productState.proposal.id}, ${productState.profileVersion},
        'Gate Test Company', 'Evidence-backed growth decisions for technical founders.',
        'Technical founders', ${verificationRequest}, ${`verify-${verificationRequest}`}
      ) as state
    `;
    return row.state;
  });
  assert(
    productState.verifiedSnapshot?.profileVersion === state.versions.profile + 1 &&
      productState.verifiedSnapshot?.sourceIds?.length === 1,
    "Founder verification did not create a sourced context snapshot",
  );
  passed.push("evidence proposal remains unverified until founder context snapshot");

  await expectDatabaseError("source evidence update blocked", "55000", () =>
    asWorker(workspaceA, (transaction) => transaction`
      update app.source_record set metadata = '{"changed":true}'::jsonb
      where id = ${productState.proposal.source.id}
    `),
  );

  const gateRun = randomUUID().slice(0, 8);
  const metricDefinition = (name, businessDefinition) => ({
    name,
    businessDefinition,
    unit: "count",
    customUnit: "",
    aggregation: "unique",
    segment: "Self-serve founders",
    exclusions: ["Internal accounts"],
    timezone: "UTC",
    freshnessHours: 168,
  });
  let metricsState = await asAuthenticated(founderA, async (transaction) => {
    const requestId = randomUUID();
    const [row] = await transaction`
      select public.save_metric_definition(
        ${workspaceA}, null, 0,
        ${sql.json(metricDefinition(`Gate visits ${gateRun}`, "Distinct qualified visits during the UTC week."))},
        ${requestId}, ${`metric-visits-${requestId}`}
      ) as state
    `;
    return row.state;
  });
  metricsState = await asAuthenticated(founderA, async (transaction) => {
    const requestId = randomUUID();
    const [row] = await transaction`
      select public.save_metric_definition(
        ${workspaceA}, null, 0,
        ${sql.json(metricDefinition(`Gate activation ${gateRun}`, "Accounts completing the founder-approved value event during the UTC week."))},
        ${requestId}, ${`metric-activation-${requestId}`}
      ) as state
    `;
    return row.state;
  });
  const visitsMetric = metricsState.definitions.find((definition) => definition.name === `Gate visits ${gateRun}`);
  const activationMetric = metricsState.definitions.find((definition) => definition.name === `Gate activation ${gateRun}`);
  assert(visitsMetric && activationMetric, "Metric definitions were not persisted");
  passed.push("founder-approved versioned metric definitions");

  const firstSourceHash = randomUUID().replaceAll("-", "").repeat(2);
  const windowStart = "2026-08-01T00:00:00.000Z";
  const windowEnd = "2026-08-08T00:00:00.000Z";
  const freshAsOf = "2026-08-08T01:00:00.000Z";
  const firstRows = [
    { rowNumber: 2, rowKey: randomUUID().replaceAll("-", "").repeat(2), metricDefinitionId: visitsMetric.id, value: 100, windowStart, windowEnd, segment: "Self-serve founders", freshAsOf, qualityState: "current", sourceNote: "Gate fixture" },
    { rowNumber: 3, rowKey: randomUUID().replaceAll("-", "").repeat(2), metricDefinitionId: activationMetric.id, value: 0, windowStart, windowEnd, segment: "Self-serve founders", freshAsOf, qualityState: "current", sourceNote: "Gate fixture" },
  ];
  const importRequest = randomUUID();
  metricsState = await asAuthenticated(founderA, async (transaction) => {
    const [row] = await transaction`
      select public.commit_manual_metric_import(
        ${workspaceA}, 'gate-metrics.csv', ${firstSourceHash}, ${sql.json(firstRows)},
        ${importRequest}, ${`manual-import-${importRequest}`}
      ) as state
    `;
    return row.state;
  });
  const zeroSnapshot = metricsState.snapshots.find((snapshot) => snapshot.metricDefinitionId === activationMetric.id);
  assert(zeroSnapshot?.value === 0 && zeroSnapshot.qualityState === "current", "Observed zero became missing or unknown");
  const [{ count: observationCountBeforeReplay }] = await sql`
    select count(*)::integer as count from app.metric_observation
    where workspace_id = ${workspaceA} and metric_definition_id in (${visitsMetric.id}, ${activationMetric.id})
  `;
  const replayRequest = randomUUID();
  await asAuthenticated(founderA, (transaction) => transaction`
    select public.commit_manual_metric_import(
      ${workspaceA}, 'gate-metrics.csv', ${firstSourceHash}, ${sql.json(firstRows)},
      ${replayRequest}, ${`manual-import-${replayRequest}`}
    )
  `);
  const [{ count: observationCountAfterReplay }] = await sql`
    select count(*)::integer as count from app.metric_observation
    where workspace_id = ${workspaceA} and metric_definition_id in (${visitsMetric.id}, ${activationMetric.id})
  `;
  assert(observationCountAfterReplay === observationCountBeforeReplay, "Manual import replay duplicated observations");
  passed.push("manual import replay and observed-zero integrity");

  const conflictRequest = randomUUID();
  metricsState = await asAuthenticated(founderA, async (transaction) => {
    const [row] = await transaction`
      select public.commit_manual_metric_import(
        ${workspaceA}, 'gate-conflict.csv', ${randomUUID().replaceAll("-", "").repeat(2)},
        ${sql.json([{ ...firstRows[1], rowKey: randomUUID().replaceAll("-", "").repeat(2), value: 5, sourceNote: "Conflicting gate fixture" }])},
        ${conflictRequest}, ${`manual-import-${conflictRequest}`}
      ) as state
    `;
    return row.state;
  });
  const conflicted = metricsState.snapshots.find((snapshot) => snapshot.metricDefinitionId === activationMetric.id);
  assert(conflicted?.qualityState === "conflicted" && conflicted.value === null && conflicted.evidenceIds.length === 2, "Metric disagreement was not preserved as a valueless conflict with both evidence references");
  passed.push("metric disagreement is conflicted and never averaged");

  const funnelRequest = randomUUID();
  metricsState = await asAuthenticated(founderA, async (transaction) => {
    const [row] = await transaction`
      select public.save_funnel_definition(
        ${workspaceA}, ${metricsState.funnel?.version ?? 0}, 'Gate core funnel', ${sql.json([
          { stage: "acquisition", label: "Qualified visits", definition: "A qualified founder reaches the product.", metricDefinitionId: visitsMetric.id, included: true, position: 0 },
          { stage: "activation", label: "Activated accounts", definition: "A founder receives the defined product value.", metricDefinitionId: activationMetric.id, included: true, position: 1 },
        ])}, ${funnelRequest}, ${`funnel-${funnelRequest}`}
      ) as state
    `;
    return row.state;
  });
  assert(metricsState.funnel?.stages.filter((stage) => stage.included).length === 2, "Founder-approved funnel mapping was not persisted");
  passed.push("founder-approved canonical funnel mapping");

  const existingConnectorState = await asAuthenticated(founderA, async (transaction) => {
    const [row] = await transaction`select public.get_connector_workspace_state(${workspaceA}) as state`;
    return row.state;
  });
  if (existingConnectorState.connection?.status !== "revoked" && existingConnectorState.connection?.id) {
    await asAuthenticated(founderA, (transaction) => transaction`
      select public.revoke_connector_connection(${workspaceA},${existingConnectorState.connection.id},${randomUUID()})
    `);
  }
  const connectorProjectId = String(Date.now());
  let connectorState = await asAuthenticated(founderA, async (transaction) => {
    const requestId = randomUUID();
    const [row] = await transaction`
      select public.begin_posthog_connection(
        ${workspaceA},'us',${connectorProjectId},'Database gate PostHog',${requestId},${`connector-start-${requestId}`}
      ) as state
    `;
    return row.state;
  });
  const connectionId = connectorState.connection?.id;
  assert(connectionId && connectorState.connection.status === "pending", "PostHog connection did not start pending");
  await asWorker(workspaceA, (transaction) => transaction`
    select app.complete_posthog_connection(
      ${workspaceA},${connectionId},${founderA},'managed-http-v1',${`vault:gate:${randomUUID()}`},'2099-09-30T00:00:00.000Z'
    )
  `);
  connectorState = await asAuthenticated(founderA, async (transaction) => {
    const requestId = randomUUID();
    const [row] = await transaction`
      select public.save_connector_mapping(
        ${workspaceA},${connectionId},${activationMetric.id},0,'weekly-activation',3,
        ${requestId},${`connector-mapping-${requestId}`}
      ) as state
    `;
    return row.state;
  });
  assert(connectorState.connection?.status === "healthy" && connectorState.mappings.length === 1, "Founder-approved connector mapping was not isolated to the active connection");

  const connectorWindowStart = "2026-09-01T00:00:00.000Z";
  const connectorWindowEnd = "2026-09-08T00:00:00.000Z";
  const connectorFreshAsOf = "2026-09-08T01:00:00.000Z";
  const connectorContentHash = randomUUID().replaceAll("-", "").repeat(2);
  const connectorSyncKey = `connector-sync-${randomUUID()}`;
  const connectorResult = [{
    metricDefinitionId: activationMetric.id,
    endpointName: "weekly-activation",
    endpointVersion: 3,
    value: 25,
    qualityState: "current",
    qualityScore: 1,
    windowStart: connectorWindowStart,
    windowEnd: connectorWindowEnd,
    segment: "Self-serve founders",
    freshAsOf: connectorFreshAsOf,
    providerRequestId: "gate-execution-1",
    providerObjectRef: `posthog_endpoint:${connectorProjectId}:weekly-activation:v3`,
    contentHash: connectorContentHash,
    checkpoint: "3:gate-execution-1",
  }];
  await asWorker(workspaceA, (transaction) => transaction`
    select app.commit_connector_sync(
      ${workspaceA},${connectionId},${founderA},${connectorSyncKey},${randomUUID()},
      ${connectorWindowStart},${connectorWindowEnd},'Self-serve founders',${sql.json(connectorResult)}
    )
  `);
  const [{ count: connectorObservationsBeforeReplay }] = await sql`
    select count(*)::integer as count from app.metric_observation
    where workspace_id=${workspaceA} and metric_definition_id=${activationMetric.id} and window_start=${connectorWindowStart}
  `;
  await asWorker(workspaceA, (transaction) => transaction`
    select app.commit_connector_sync(
      ${workspaceA},${connectionId},${founderA},${connectorSyncKey},${randomUUID()},
      ${connectorWindowStart},${connectorWindowEnd},'Self-serve founders',${sql.json([{ ...connectorResult[0], providerRequestId: "gate-execution-2", checkpoint: "3:gate-execution-2" }])}
    )
  `);
  const [{ count: connectorObservationsAfterReplay }] = await sql`
    select count(*)::integer as count from app.metric_observation
    where workspace_id=${workspaceA} and metric_definition_id=${activationMetric.id} and window_start=${connectorWindowStart}
  `;
  assert(connectorObservationsBeforeReplay === 1 && connectorObservationsAfterReplay === 1, "Exact connector replay duplicated observations");
  passed.push("PostHog exact replay has one aggregate observation effect");

  const connectorFailureKey = `connector-failure-${randomUUID()}`;
  await asWorker(workspaceA, (transaction) => transaction`
    select app.record_connector_sync_failure(
      ${workspaceA},${connectionId},${founderA},${connectorFailureKey},${randomUUID()},
      ${connectorWindowStart},${connectorWindowEnd},'Self-serve founders',1,'POSTHOG_RATE_LIMITED'
    )
  `);
  let [latestConnectorSnapshot] = await sql`
    select quality_state,value_numeric from app.metric_snapshot
    where workspace_id=${workspaceA} and metric_definition_id=${activationMetric.id}
      and window_start=${connectorWindowStart} order by created_at desc,id desc limit 1
  `;
  assert(latestConnectorSnapshot?.quality_state === "stale" && Number(latestConnectorSnapshot.value_numeric) === 25, "Connector failure did not preserve prior evidence as stale");
  await asWorker(workspaceA, (transaction) => transaction`
    select app.commit_connector_sync(
      ${workspaceA},${connectionId},${founderA},${connectorSyncKey},${randomUUID()},
      ${connectorWindowStart},${connectorWindowEnd},'Self-serve founders',${sql.json(connectorResult)}
    )
  `);
  [latestConnectorSnapshot] = await sql`
    select quality_state,value_numeric from app.metric_snapshot
    where workspace_id=${workspaceA} and metric_definition_id=${activationMetric.id}
      and window_start=${connectorWindowStart} order by created_at desc,id desc limit 1
  `;
  const [recoveredConnection] = await sql`select status,last_error_code from app.connector_connection where id=${connectionId}`;
  assert(latestConnectorSnapshot?.quality_state === "current" && Number(latestConnectorSnapshot.value_numeric) === 25 && recoveredConnection?.status === "healthy" && recoveredConnection.last_error_code === null, "Exact committed evidence did not recover the stale connector state");
  const connectorLineage = await asAuthenticated(founderA, async (transaction) => {
    const [row] = await transaction`select public.get_connector_metric_lineage(${workspaceA}) as lineage`;
    return row.lineage;
  });
  assert(connectorLineage.some((lineage) => lineage.metricDefinitionId === activationMetric.id && lineage.endpointName === "weekly-activation"), "Connector source lineage was unavailable to the founder");
  passed.push("PostHog failure is stale, traceable, and recoverable");

  const [{ count: credentialColumnCount }] = await sql`
    select count(*)::integer as count from information_schema.columns
    where table_schema='app' and table_name='secret_reference' and column_name in ('access_token','refresh_token')
  `;
  assert(credentialColumnCount === 0, "Credential material columns exist in the application database");
  await expectDatabaseError("authenticated connector commit denied", "42501", () =>
    asAuthenticated(founderA, (transaction) => transaction`
      select app.commit_connector_sync(
        ${workspaceA},${connectionId},${founderA},${`browser-forged-${randomUUID()}`},${randomUUID()},
        ${connectorWindowStart},${connectorWindowEnd},'Self-serve founders',${sql.json(connectorResult)}
      )
    `),
  );
  await expectDatabaseError("connector cross-tenant load denied", "42501", () =>
    asAuthenticated(founderA, (transaction) => transaction`select public.get_connector_workspace_state(${workspaceB})`),
  );

  await expectDatabaseError("metric observation update blocked", "55000", () =>
    asWorker(workspaceA, (transaction) => transaction`
      update app.metric_observation set source_note = 'changed'
      where id = ${conflicted.evidenceIds[0]}
    `),
  );
  await expectDatabaseError("metric snapshot delete blocked", "55000", () =>
    asWorker(workspaceA, (transaction) => transaction`
      delete from app.metric_snapshot where id = ${conflicted.id}
    `),
  );

  await expectDatabaseError("metrics workspace cross-tenant load denied", "42501", () =>
    asAuthenticated(founderA, (transaction) => transaction`
      select public.get_metrics_workspace_state(${workspaceB})
    `),
  );

  await expectDatabaseError("product understanding cross-tenant load denied", "42501", () =>
    asAuthenticated(founderA, (transaction) => transaction`
      select public.get_product_understanding_state(${workspaceB})
    `),
  );

  await expectDatabaseError("onboarding cross-tenant load denied", "42501", () =>
    asAuthenticated(founderA, (transaction) => transaction`
      select public.get_onboarding_state(${workspaceB})
    `),
  );
  const denialRequest = randomUUID();
  await asAuthenticated(founderA, (transaction) => transaction`
    select public.record_onboarding_denial(${workspaceB}, ${denialRequest})
  `);
  const [denial] = await sql`
    select actor_id, result from app.audit_event
    where workspace_id = ${workspaceB} and request_id = ${denialRequest}
  `;
  assert(denial?.actor_id === founderA && denial.result === "denied", "Denial audit attribution failed");
  passed.push("denied mutation audit attribution");

  process.stdout.write(`Database gate passed ${passed.length} scenarios:\n`);
  for (const label of passed) process.stdout.write(`- ${label}\n`);
} finally {
  await sql.end();
}
