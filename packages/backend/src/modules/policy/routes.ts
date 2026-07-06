import { FastifyInstance } from "fastify";
import prisma from "../../db.js";
import { authMiddleware } from "../../middleware/auth.js";
import { sendSuccess, sendError, ValidationError, NotFoundError } from "../../utils/errors.js";
import { createAuditLog } from "../../utils/audit.js";
import { PolicyRuleSchema } from "./engine.js";
import { parsePagination } from "../../utils/pagination.js";

export async function policyRoutes(app: FastifyInstance) {
  app.post("/policies", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { name, effect, conditions, consensus, priority } = request.body as {
        name: string; effect: string; conditions?: unknown[]; consensus?: string; priority?: number;
      };
      if (!name || !effect) throw new ValidationError("Name and effect are required");

      const parsed = PolicyRuleSchema.safeParse({ effect, conditions, consensus });
      if (!parsed.success) {
        throw new ValidationError("Invalid policy format: " + parsed.error.message);
      }

      const policy = await prisma.policy.create({
        data: {
          orgId: request.orgId,
          name,
          effect,
          conditions: (conditions || []) as any,
          consensus: consensus || "ANY",
          priority: priority || 0,
        },
      });

      await createAuditLog(request.orgId, "POLICY_CREATE", { policyId: policy.id, name }, request.userId, request);
      return sendSuccess(reply, policy, 201);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get("/policies", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { limit, offset } = parsePagination(request.query as { limit?: string; offset?: string });
      const [data, total] = await Promise.all([
        prisma.policy.findMany({
          where: { orgId: request.orgId },
          orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
          take: limit, skip: offset,
        }),
        prisma.policy.count({ where: { orgId: request.orgId } }),
      ]);
      return sendSuccess(reply, { data, total, limit, offset });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get("/policies/:id", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const policy = await prisma.policy.findFirst({ where: { id, orgId: request.orgId } });
      if (!policy) throw new NotFoundError("Policy not found");
      return sendSuccess(reply, policy);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.delete("/policies/:id", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      await prisma.policy.deleteMany({ where: { id, orgId: request.orgId } });
      await createAuditLog(request.orgId, "POLICY_DELETE", { policyId: id }, request.userId, request);
      return sendSuccess(reply, { message: "Policy deleted" });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.patch("/policies/:id", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { active, name, effect, conditions, consensus, priority } = request.body as any;

      if (effect || conditions || consensus) {
        const validated = PolicyRuleSchema.safeParse({
          effect: effect ?? "EFFECT_ALLOW",
          conditions: conditions ?? [],
          consensus: consensus ?? "ANY",
        });
        if (!validated.success) {
          throw new ValidationError(`Invalid policy: ${validated.error.errors.map((e: any) => e.message).join(", ")}`);
        }
      }

      const policy = await prisma.policy.updateMany({
        where: { id, orgId: request.orgId },
        data: { active, name, effect, conditions, consensus, priority },
      });
      if (policy.count === 0) throw new NotFoundError("Policy not found");
      const updated = await prisma.policy.findUnique({ where: { id } });
      return sendSuccess(reply, updated);
    } catch (err) {
      return sendError(reply, err);
    }
  });
}
