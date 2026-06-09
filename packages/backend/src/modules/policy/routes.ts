import { FastifyInstance } from "fastify";
import prisma from "../../db.js";
import { authMiddleware } from "../../middleware/auth.js";
import { sendSuccess, sendError, ValidationError, NotFoundError } from "../../utils/errors.js";
import { createAuditLog } from "../../utils/audit.js";
import { PolicyRuleSchema } from "./engine.js";

export async function policyRoutes(app: FastifyInstance) {
  app.post("/policies", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { name, effect, conditions, consensus, priority } = request.body as {
        name: string;
        effect: string;
        conditions?: unknown[];
        consensus?: string;
        priority?: number;
      };
      if (!name || !effect) throw new ValidationError("Name and effect are required");

      // Validate policy structure
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
      const policies = await prisma.policy.findMany({
        where: { orgId: request.orgId },
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      });
      return sendSuccess(reply, { policies });
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
}
