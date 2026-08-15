import "server-only";

import { and, asc, eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import { resourceConstraints, resourceConstraintVersions } from "@/db/schema";
import {
  ResourceConstraintConflictError,
  type ResourceConstraintRepository,
  type ResourceConstraintVersion,
  type ResourceConstraints,
} from "@/domain/resource-constraints";

function mapVersion(
  row: typeof resourceConstraintVersions.$inferSelect,
  objectiveId: string,
): ResourceConstraintVersion {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    objectiveId,
    version: row.version,
    createdBy: row.createdBy,
    data: {
      founderMinutesPerWeek: row.founderMinutesPerWeek,
      cashBudgetMinor: row.cashBudgetMinor,
      currency: row.currency,
      riskTolerance: row.riskTolerance,
      prohibitedTactics: row.prohibitedTactics as string[],
      brandRules: row.brandRules as string[],
      audienceLimits: row.audienceLimits as string[],
      geographyLimits: row.geographyLimits as string[],
      approvalPreferences: row.approvalPreferences as ResourceConstraints["approvalPreferences"],
    },
  };
}

export function createPostgresResourceConstraintRepository(
  database: Database,
): ResourceConstraintRepository {
  return {
    async current(workspaceId, objectiveId) {
      const [row] = await database
        .select({ constraint: resourceConstraints, version: resourceConstraintVersions })
        .from(resourceConstraints)
        .innerJoin(
          resourceConstraintVersions,
          eq(resourceConstraints.currentVersionId, resourceConstraintVersions.id),
        )
        .where(
          and(
            eq(resourceConstraints.workspaceId, workspaceId),
            eq(resourceConstraints.objectiveId, objectiveId),
          ),
        )
        .limit(1);
      return row ? mapVersion(row.version, row.constraint.objectiveId) : null;
    },

    async append(input) {
      const version = await database.transaction(async (transaction) => {
        const [existing] = await transaction
          .select()
          .from(resourceConstraints)
          .where(
            and(
              eq(resourceConstraints.workspaceId, input.workspaceId),
              eq(resourceConstraints.objectiveId, input.objectiveId),
            ),
          )
          .limit(1)
          .for("update");

        let constraintId = existing?.id;
        if (!existing) {
          if (input.expectedVersion !== 0) {
            throw new ResourceConstraintConflictError("Constraints do not exist.");
          }
          const [created] = await transaction
            .insert(resourceConstraints)
            .values({ workspaceId: input.workspaceId, objectiveId: input.objectiveId })
            .returning({ id: resourceConstraints.id });
          constraintId = created.id;
        } else {
          const [current] = await transaction
            .select({ version: resourceConstraintVersions.version })
            .from(resourceConstraintVersions)
            .where(eq(resourceConstraintVersions.id, existing.currentVersionId!))
            .limit(1);
          if (current?.version !== input.expectedVersion) {
            throw new ResourceConstraintConflictError("Constraints changed before this save.");
          }
        }

        const [createdVersion] = await transaction
          .insert(resourceConstraintVersions)
          .values({
            workspaceId: input.workspaceId,
            resourceConstraintId: constraintId,
            version: input.expectedVersion + 1,
            founderMinutesPerWeek: input.data.founderMinutesPerWeek,
            cashBudgetMinor: input.data.cashBudgetMinor,
            currency: input.data.currency,
            riskTolerance: input.data.riskTolerance,
            prohibitedTactics: input.data.prohibitedTactics,
            brandRules: input.data.brandRules,
            audienceLimits: input.data.audienceLimits,
            geographyLimits: input.data.geographyLimits,
            approvalPreferences: input.data.approvalPreferences,
            createdBy: input.createdBy,
          })
          .returning();
        await transaction
          .update(resourceConstraints)
          .set({ currentVersionId: createdVersion.id })
          .where(eq(resourceConstraints.id, constraintId));
        return createdVersion;
      });
      return mapVersion(version, input.objectiveId);
    },

    async history(workspaceId, objectiveId) {
      const rows = await database
        .select({ version: resourceConstraintVersions })
        .from(resourceConstraints)
        .innerJoin(
          resourceConstraintVersions,
          eq(resourceConstraints.id, resourceConstraintVersions.resourceConstraintId),
        )
        .where(
          and(
            eq(resourceConstraints.workspaceId, workspaceId),
            eq(resourceConstraints.objectiveId, objectiveId),
          ),
        )
        .orderBy(asc(resourceConstraintVersions.version));
      return rows.map(({ version }) => mapVersion(version, objectiveId));
    },
  };
}
