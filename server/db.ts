import { and, desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  generationJobs,
  InsertUser,
  projectVersions,
  projects,
  stripeEvents,
  subscriptions,
  usageLedger,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0];
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db;
}

export async function ensureWelcomeCredits(userId: number) {
  const db = await requireDb();
  const reference = `welcome:${userId}`;
  const existing = await db.select({ id: usageLedger.id }).from(usageLedger).where(eq(usageLedger.reference, reference)).limit(1);
  if (existing.length === 0) {
    try {
      await db.insert(usageLedger).values({
        userId,
        delta: 100,
        balanceAfter: 100,
        kind: "welcome_grant",
        reference,
        metadata: JSON.stringify({ points: 100 }),
      });
    } catch (error) {
      // Another request may have initialized the same account concurrently.
      if (!String(error).toLowerCase().includes("duplicate")) throw error;
    }
  }
}

export async function getPointSummary(userId: number) {
  await ensureWelcomeCredits(userId);
  const db = await requireDb();
  const [total] = await db.select({ total: sql<number>`COALESCE(SUM(${usageLedger.delta}), 0)` }).from(usageLedger).where(eq(usageLedger.userId, userId));
  const recent = await db.select().from(usageLedger).where(eq(usageLedger.userId, userId)).orderBy(desc(usageLedger.createdAt)).limit(12);
  return { balance: Number(total?.total ?? 0), recent };
}

export async function recordLedgerEntry(input: {
  userId: number;
  delta: number;
  kind: string;
  reference: string;
  metadata?: Record<string, unknown>;
}) {
  const db = await requireDb();
  await ensureWelcomeCredits(input.userId);
  return db.transaction(async tx => {
    const existing = await tx.select().from(usageLedger).where(eq(usageLedger.reference, input.reference)).limit(1);
    if (existing[0]) return existing[0];
    // The welcome grant guarantees at least one row per account. Locking the
    // account's ledger rows serializes balance calculation and prevents two
    // concurrent generations from spending the same points.
    await tx.execute(sql`SELECT id FROM usage_ledger WHERE userId = ${input.userId} FOR UPDATE`);
    const [total] = await tx.select({ total: sql<number>`COALESCE(SUM(${usageLedger.delta}), 0)` }).from(usageLedger).where(eq(usageLedger.userId, input.userId));
    const balanceAfter = Number(total?.total ?? 0) + input.delta;
    if (balanceAfter < 0) throw new Error("POINTS_INSUFFICIENT");
    const result = await tx.insert(usageLedger).values({
      userId: input.userId,
      delta: input.delta,
      balanceAfter,
      kind: input.kind,
      reference: input.reference,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    });
    const inserted = await tx.select().from(usageLedger).where(eq(usageLedger.id, result[0].insertId)).limit(1);
    return inserted[0];
  });
}

export async function listProjects(userId: number) {
  const db = await requireDb();
  return db.select().from(projects).where(eq(projects.userId, userId)).orderBy(desc(projects.updatedAt));
}

export async function getProject(userId: number, id: number) {
  const db = await requireDb();
  const project = await db.select().from(projects).where(and(eq(projects.id, id), eq(projects.userId, userId))).limit(1);
  if (!project[0]) return undefined;
  const versions = await db.select().from(projectVersions).where(and(eq(projectVersions.projectId, id), eq(projectVersions.userId, userId))).orderBy(desc(projectVersions.versionNumber)).limit(12);
  return { project: project[0], versions };
}

export async function createProject(input: {
  userId: number;
  title: string;
  logline: string;
  genre: string;
  tone: string;
  episodeCount: number;
}) {
  const db = await requireDb();
  const result = await db.insert(projects).values(input);
  const created = await db.select().from(projects).where(eq(projects.id, result[0].insertId)).limit(1);
  return created[0];
}

export async function updateProject(userId: number, id: number, input: Partial<Pick<typeof projects.$inferInsert, "title" | "logline" | "genre" | "tone" | "episodeCount">>) {
  const db = await requireDb();
  await db.update(projects).set({ ...input, updatedAt: new Date() }).where(and(eq(projects.id, id), eq(projects.userId, userId)));
  const updated = await db.select().from(projects).where(and(eq(projects.id, id), eq(projects.userId, userId))).limit(1);
  return updated[0];
}

export async function createGenerationJob(input: {
  projectId: number;
  userId: number;
  inputSnapshot: string;
  pointsCost: number;
}) {
  const db = await requireDb();
  const result = await db.insert(generationJobs).values(input);
  const job = await db.select().from(generationJobs).where(eq(generationJobs.id, result[0].insertId)).limit(1);
  return job[0];
}

export async function updateGenerationJob(id: number, input: Partial<typeof generationJobs.$inferInsert>) {
  const db = await requireDb();
  await db.update(generationJobs).set(input).where(eq(generationJobs.id, id));
}

export async function createVersion(input: {
  projectId: number;
  userId: number;
  inputSnapshot: string;
  outputJson: string;
  model: string;
  pointsCost: number;
}) {
  const db = await requireDb();
  const [latest] = await db.select({ versionNumber: projectVersions.versionNumber }).from(projectVersions).where(eq(projectVersions.projectId, input.projectId)).orderBy(desc(projectVersions.versionNumber)).limit(1);
  const versionNumber = Number(latest?.versionNumber ?? 0) + 1;
  const result = await db.insert(projectVersions).values({ ...input, versionNumber });
  const version = await db.select().from(projectVersions).where(eq(projectVersions.id, result[0].insertId)).limit(1);
  await db.update(projects).set({ currentVersionId: result[0].insertId, updatedAt: new Date() }).where(and(eq(projects.id, input.projectId), eq(projects.userId, input.userId)));
  return version[0];
}

export async function getSubscription(userId: number) {
  const db = await requireDb();
  const result = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
  return result[0] ?? null;
}

export async function getSubscriptionByCustomer(customerId: string) {
  const db = await requireDb();
  const result = await db.select().from(subscriptions).where(eq(subscriptions.stripeCustomerId, customerId)).limit(1);
  return result[0] ?? null;
}

export async function upsertSubscription(input: {
  userId: number;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  priceId?: string | null;
  status: string;
  currentPeriodEnd?: Date | null;
  cancelAtPeriodEnd?: boolean;
}) {
  const db = await requireDb();
  const values = {
    userId: input.userId,
    stripeCustomerId: input.stripeCustomerId ?? null,
    stripeSubscriptionId: input.stripeSubscriptionId ?? null,
    priceId: input.priceId ?? null,
    status: input.status,
    currentPeriodEnd: input.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: input.cancelAtPeriodEnd ? 1 : 0,
  };
  await db.insert(subscriptions).values(values).onDuplicateKeyUpdate({
    set: {
      ...values,
      userId: undefined,
      updatedAt: new Date(),
    },
  });
  return getSubscription(input.userId);
}

export async function recordStripeEvent(eventId: string, eventType: string) {
  const db = await requireDb();
  try {
    await db.insert(stripeEvents).values({ eventId, eventType });
    return true;
  } catch (error) {
    if (String(error).toLowerCase().includes("duplicate")) return false;
    throw error;
  }
}

export async function grantSubscriptionCredits(userId: number, subscriptionId: string, cycleKey: string) {
  return recordLedgerEntry({
    userId,
    delta: 600,
    kind: "subscription_grant",
    reference: `subscription-grant:${subscriptionId}:${cycleKey}`,
    metadata: { points: 600, subscriptionId, cycleKey },
  });
}
