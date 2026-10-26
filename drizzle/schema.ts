import { index, int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const projects = mysqlTable("projects", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  title: varchar("title", { length: 180 }).notNull(),
  logline: text("logline").notNull(),
  genre: varchar("genre", { length: 64 }).notNull(),
  tone: varchar("tone", { length: 64 }).notNull(),
  episodeCount: int("episodeCount").notNull().default(6),
  currentVersionId: int("currentVersionId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  userIndex: index("projects_user_idx").on(table.userId),
}));

export const projectVersions = mysqlTable("project_versions", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  userId: int("userId").notNull(),
  versionNumber: int("versionNumber").notNull(),
  inputSnapshot: text("inputSnapshot").notNull(),
  outputJson: text("outputJson").notNull(),
  model: varchar("model", { length: 160 }).notNull(),
  pointsCost: int("pointsCost").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  projectIndex: index("versions_project_idx").on(table.projectId),
  userIndex: index("versions_user_idx").on(table.userId),
  versionUnique: uniqueIndex("project_version_unique").on(table.projectId, table.versionNumber),
}));

export const generationJobs = mysqlTable("generation_jobs", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  userId: int("userId").notNull(),
  status: varchar("status", { length: 32 }).notNull().default("queued"),
  inputSnapshot: text("inputSnapshot").notNull(),
  model: varchar("model", { length: 160 }),
  pointsCost: int("pointsCost").notNull().default(25),
  versionId: int("versionId"),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
}, table => ({
  userIndex: index("jobs_user_idx").on(table.userId),
  projectIndex: index("jobs_project_idx").on(table.projectId),
}));

export const usageLedger = mysqlTable("usage_ledger", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  delta: int("delta").notNull(),
  balanceAfter: int("balanceAfter").notNull(),
  kind: varchar("kind", { length: 40 }).notNull(),
  reference: varchar("reference", { length: 180 }).notNull(),
  metadata: text("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  referenceUnique: uniqueIndex("usage_reference_unique").on(table.reference),
  userIndex: index("usage_user_idx").on(table.userId),
}));

export const subscriptions = mysqlTable("subscriptions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  stripeCustomerId: varchar("stripeCustomerId", { length: 120 }),
  stripeSubscriptionId: varchar("stripeSubscriptionId", { length: 120 }),
  priceId: varchar("priceId", { length: 120 }),
  status: varchar("status", { length: 40 }).notNull().default("inactive"),
  currentPeriodEnd: timestamp("currentPeriodEnd"),
  cancelAtPeriodEnd: int("cancelAtPeriodEnd").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  userUnique: uniqueIndex("subscription_user_unique").on(table.userId),
  customerIndex: index("subscription_customer_idx").on(table.stripeCustomerId),
}));

export const stripeEvents = mysqlTable("stripe_events", {
  id: int("id").autoincrement().primaryKey(),
  eventId: varchar("eventId", { length: 120 }).notNull().unique(),
  eventType: varchar("eventType", { length: 100 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type ProjectVersion = typeof projectVersions.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
