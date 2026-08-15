import { relations, sql } from "drizzle-orm";
import {
  index,
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
