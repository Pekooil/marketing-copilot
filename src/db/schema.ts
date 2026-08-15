import { relations, sql } from "drizzle-orm";
import {
  index,
  integer,
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
