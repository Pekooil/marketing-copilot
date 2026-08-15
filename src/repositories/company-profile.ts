import "server-only";

import { asc, eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import { companyProfiles, companyProfileVersions } from "@/db/schema";
import {
  ProfileVersionConflictError,
  type CompanyProfileRepository,
  type CompanyProfileVersion,
  type ProfileAuthor,
} from "@/domain/company-profile";

function serializeAuthor(author: ProfileAuthor) {
  return `${author.actorType}:${author.actorId}`;
}

function parseAuthor(createdByActor: string, founderDecisionRef: string | null): ProfileAuthor {
  const [actorType, ...actorParts] = createdByActor.split(":");
  return {
    actorType: actorType as ProfileAuthor["actorType"],
    actorId: actorParts.join(":"),
    founderDecisionRef: founderDecisionRef ?? undefined,
  };
}

function toDomain(row: typeof companyProfileVersions.$inferSelect): CompanyProfileVersion {
  return {
    id: row.id,
    profileId: row.companyProfileId,
    workspaceId: row.workspaceId,
    version: row.version,
    payload: row.canonicalPayload as CompanyProfileVersion["payload"],
    author: parseAuthor(row.createdByActor, row.founderDecisionRef),
  };
}

export function createPostgresCompanyProfileRepository(
  database: Database,
): CompanyProfileRepository {
  return {
    async current(workspaceId) {
      const [row] = await database
        .select({ version: companyProfileVersions })
        .from(companyProfiles)
        .innerJoin(
          companyProfileVersions,
          eq(companyProfiles.currentVersionId, companyProfileVersions.id),
        )
        .where(eq(companyProfiles.workspaceId, workspaceId))
        .limit(1);
      return row ? toDomain(row.version) : null;
    },

    async append(input) {
      return database.transaction(async (transaction) => {
        const [existing] = await transaction
          .select()
          .from(companyProfiles)
          .where(eq(companyProfiles.workspaceId, input.workspaceId))
          .limit(1)
          .for("update");

        let profileId = existing?.id;
        if (!existing) {
          if (input.expectedVersion !== 0) throw new ProfileVersionConflictError("Profile does not exist.");
          const [created] = await transaction
            .insert(companyProfiles)
            .values({ workspaceId: input.workspaceId })
            .returning({ id: companyProfiles.id });
          profileId = created.id;
        } else {
          const [current] = await transaction
            .select({ version: companyProfileVersions.version })
            .from(companyProfileVersions)
            .where(eq(companyProfileVersions.id, existing.currentVersionId!))
            .limit(1);
          if (current?.version !== input.expectedVersion) {
            throw new ProfileVersionConflictError("Profile version changed before this save.");
          }
        }

        const [version] = await transaction
          .insert(companyProfileVersions)
          .values({
            workspaceId: input.workspaceId,
            companyProfileId: profileId,
            version: input.expectedVersion + 1,
            canonicalPayload: input.payload,
            createdByActor: serializeAuthor(input.author),
            founderDecisionRef: input.author.founderDecisionRef,
          })
          .returning();

        await transaction
          .update(companyProfiles)
          .set({ currentVersionId: version.id })
          .where(eq(companyProfiles.id, profileId));

        return toDomain(version);
      });
    },

    async history(workspaceId) {
      const rows = await database
        .select()
        .from(companyProfileVersions)
        .where(eq(companyProfileVersions.workspaceId, workspaceId))
        .orderBy(asc(companyProfileVersions.version));
      return rows.map(toDomain);
    },
  };
}
