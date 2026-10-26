import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { generateShortDrama } from "./ai";
import * as db from "./db";
import { createCheckoutSession } from "./stripe";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { systemRouter } from "./_core/systemRouter";

const projectInput = z.object({
  title: z.string().trim().min(1).max(180),
  logline: z.string().trim().min(8).max(4000),
  genre: z.string().trim().min(1).max(64),
  tone: z.string().trim().min(1).max(64),
  episodeCount: z.number().int().min(1).max(24),
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  billing: router({
    summary: protectedProcedure.query(async ({ ctx }) => {
      const points = await db.getPointSummary(ctx.user.id);
      const subscription = await db.getSubscription(ctx.user.id);
      return {
        balance: points.balance,
        plan: subscription?.status === "active" ? "pro" : "free",
        subscription,
        recent: points.recent,
      };
    }),
    checkout: protectedProcedure
      .input(z.object({ origin: z.string().url() }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await createCheckoutSession({
            userId: ctx.user.id,
            email: ctx.user.email,
            name: ctx.user.name,
            origin: input.origin,
          });
        } catch (error) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error instanceof Error ? error.message : "Checkout unavailable" });
        }
      }),
  }),
  projects: router({
    list: protectedProcedure.query(({ ctx }) => db.listProjects(ctx.user.id)),
    detail: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(({ ctx, input }) => db.getProject(ctx.user.id, input.id)),
    create: protectedProcedure.input(projectInput).mutation(({ ctx, input }) => db.createProject({ ...input, userId: ctx.user.id })),
    update: protectedProcedure.input(projectInput.extend({ id: z.number().int().positive() })).mutation(({ ctx, input }) => {
      const { id, ...values } = input;
      return db.updateProject(ctx.user.id, id, values);
    }),
  }),
  generation: router({
    create: protectedProcedure
      .input(projectInput.extend({ projectId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const detail = await db.getProject(ctx.user.id, input.projectId);
        if (!detail) throw new TRPCError({ code: "NOT_FOUND", message: "项目不存在" });
        const pointsCost = 25;
        const points = await db.getPointSummary(ctx.user.id);
        if (points.balance < pointsCost) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "POINTS_INSUFFICIENT" });
        }
        await db.updateProject(ctx.user.id, input.projectId, {
          title: input.title,
          logline: input.logline,
          genre: input.genre,
          tone: input.tone,
          episodeCount: input.episodeCount,
        });
        const inputSnapshot = JSON.stringify({ title: input.title, logline: input.logline, genre: input.genre, tone: input.tone, episodeCount: input.episodeCount });
        const job = await db.createGenerationJob({ projectId: input.projectId, userId: ctx.user.id, inputSnapshot, pointsCost });
        let reserved = false;
        try {
          await db.recordLedgerEntry({
            userId: ctx.user.id,
            delta: -pointsCost,
            kind: "generation_reservation",
            reference: `generation:${job.id}`,
            metadata: { projectId: input.projectId, jobId: job.id },
          });
          reserved = true;
          await db.updateGenerationJob(job.id, { status: "running" });
          const generated = await generateShortDrama(input);
          const version = await db.createVersion({
            projectId: input.projectId,
            userId: ctx.user.id,
            inputSnapshot,
            outputJson: JSON.stringify(generated.output),
            model: generated.model,
            pointsCost,
          });
          await db.updateGenerationJob(job.id, { status: "completed", model: generated.model, versionId: version.id, completedAt: new Date() });
          const account = await db.getPointSummary(ctx.user.id);
          return { version, output: generated.output, model: generated.model, pointsCost, balance: account.balance };
        } catch (error) {
          if (reserved) {
            try {
              await db.recordLedgerEntry({
                userId: ctx.user.id,
                delta: pointsCost,
                kind: "generation_refund",
                reference: `generation-refund:${job.id}`,
                metadata: { projectId: input.projectId, jobId: job.id },
              });
            } catch (refundError) {
              console.error("[Billing] Failed to refund a failed generation", refundError);
            }
          }
          await db.updateGenerationJob(job.id, { status: "failed", errorMessage: error instanceof Error ? error.message.slice(0, 500) : "Generation failed", completedAt: new Date() });
          if (error instanceof Error && error.message === "POINTS_INSUFFICIENT") {
            throw new TRPCError({ code: "PRECONDITION_FAILED", message: "POINTS_INSUFFICIENT" });
          }
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI_GENERATION_FAILED" });
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;
