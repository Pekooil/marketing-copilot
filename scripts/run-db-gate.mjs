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
