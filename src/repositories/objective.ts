import "server-only";

import { and, asc, eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import { objectives, objectiveVersions } from "@/db/schema";
import {
  type ObjectiveDraft,
  type ObjectiveRecord,
  type ObjectiveRepository,
  type ObjectiveVersion,
  ObjectiveVersionConflictError,
} from "@/domain/objective";

function versionValues(data: ObjectiveDraft) {
  return {
    metricName: data.metricName,
    metricDefinition: data.metricDefinition,
    direction: data.direction,
    targetValue: data.targetValue?.toString(),
    baselineValue: data.baselineValue?.toString(),
    baselineState: data.baselineState,
    deadline: data.deadline,
    targetSegment: data.targetSegment,
    rationale: data.rationale,
  };
}

function mapVersion(row: typeof objectiveVersions.$inferSelect): ObjectiveVersion {
  return {
    id: row.id,
    objectiveId: row.objectiveId,
    workspaceId: row.workspaceId,
    version: row.version,
    createdBy: row.createdBy,
    data: {
      metricName: row.metricName ?? undefined,
      metricDefinition: row.metricDefinition ?? undefined,
      direction: row.direction ?? undefined,
      targetValue: row.targetValue == null ? undefined : Number(row.targetValue),
      baselineState: row.baselineState,
      baselineValue: row.baselineValue == null ? null : Number(row.baselineValue),
      deadline: row.deadline ?? undefined,
      targetSegment: row.targetSegment ?? undefined,
      rationale: row.rationale ?? undefined,
    },
  };
}

async function loadRecord(database: Database, objectiveId: string, workspaceId: string) {
  const [row] = await database
    .select({ objective: objectives, version: objectiveVersions })
    .from(objectives)
    .innerJoin(objectiveVersions, eq(objectives.currentVersionId, objectiveVersions.id))
    .where(and(eq(objectives.id, objectiveId), eq(objectives.workspaceId, workspaceId)))
    .limit(1);
  if (!row) throw new ObjectiveVersionConflictError("Objective no longer exists.");
  return { id: row.objective.id, workspaceId, status: row.objective.status, current: mapVersion(row.version) } satisfies ObjectiveRecord;
}

export function createPostgresObjectiveRepository(database: Database): ObjectiveRepository {
  return {
    async createDraft(input) {
      const objectiveId = await database.transaction(async (transaction) => {
        const [objective] = await transaction.insert(objectives).values({ workspaceId: input.workspaceId }).returning({ id: objectives.id });
        const [version] = await transaction.insert(objectiveVersions).values({
          workspaceId: input.workspaceId,
          objectiveId: objective.id,
          version: 1,
          createdBy: input.createdBy,
          ...versionValues(input.data),
        }).returning({ id: objectiveVersions.id });
        await transaction.update(objectives).set({ currentVersionId: version.id }).where(eq(objectives.id, objective.id));
        return objective.id;
      });
      return loadRecord(database, objectiveId, input.workspaceId);
    },

    async appendDraft(input) {
      await database.transaction(async (transaction) => {
        const [objective] = await transaction.select().from(objectives)
          .where(and(eq(objectives.id, input.objectiveId), eq(objectives.workspaceId, input.workspaceId))).limit(1).for("update");
        if (!objective?.currentVersionId) throw new ObjectiveVersionConflictError("Objective no longer exists.");
        const [current] = await transaction.select({ version: objectiveVersions.version }).from(objectiveVersions)
          .where(eq(objectiveVersions.id, objective.currentVersionId)).limit(1);
        if (current?.version !== input.expectedVersion) throw new ObjectiveVersionConflictError("Objective version changed before this save.");
        const [version] = await transaction.insert(objectiveVersions).values({
          workspaceId: input.workspaceId,
          objectiveId: input.objectiveId,
          version: input.expectedVersion + 1,
          createdBy: input.createdBy,
          ...versionValues(input.data),
        }).returning({ id: objectiveVersions.id });
        await transaction.update(objectives).set({ currentVersionId: version.id }).where(eq(objectives.id, input.objectiveId));
      });
      return loadRecord(database, input.objectiveId, input.workspaceId);
    },

    async activateAndSupersede(input) {
      await database.transaction(async (transaction) => {
        const [objective] = await transaction.select().from(objectives)
          .where(and(eq(objectives.id, input.objectiveId), eq(objectives.workspaceId, input.workspaceId))).limit(1).for("update");
        if (!objective?.currentVersionId) throw new ObjectiveVersionConflictError("Objective no longer exists.");
        const [current] = await transaction.select({ version: objectiveVersions.version }).from(objectiveVersions)
          .where(eq(objectiveVersions.id, objective.currentVersionId)).limit(1);
        if (current?.version !== input.expectedVersion) throw new ObjectiveVersionConflictError("Objective version changed before activation.");
        await transaction.update(objectives).set({ status: "superseded" })
          .where(and(eq(objectives.workspaceId, input.workspaceId), eq(objectives.status, "active")));
        await transaction.update(objectives).set({ status: "active" }).where(eq(objectives.id, input.objectiveId));
      });
      return loadRecord(database, input.objectiveId, input.workspaceId);
    },

    async history(objectiveId, workspaceId) {
      const rows = await database.select().from(objectiveVersions)
        .where(and(eq(objectiveVersions.objectiveId, objectiveId), eq(objectiveVersions.workspaceId, workspaceId)))
        .orderBy(asc(objectiveVersions.version));
      return rows.map(mapVersion);
    },
  };
}
