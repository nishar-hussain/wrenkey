import { FastifyInstance } from "fastify";
import prisma from "../../db.js";
import { authMiddleware } from "../../middleware/auth.js";
import { sendSuccess, sendError, ValidationError, NotFoundError } from "../../utils/errors.js";
import { createAuditLog } from "../../utils/audit.js";
import { parsePagination } from "../../utils/pagination.js";

export async function spendingLimitRoutes(app: FastifyInstance) {
  app.post("/spending-limits", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { walletId, chainId, name, maxPerTx, maxDaily, maxMonthly, allowlist, denylist } = request.body as {
        walletId?: string; chainId?: string; name: string; maxPerTx?: string; maxDaily?: string;
        maxMonthly?: string; allowlist?: string[]; denylist?: string[];
      };
      if (!name) throw new ValidationError("Limit name required");

      const limit = await prisma.spendingLimit.create({
        data: {
          orgId: request.orgId, walletId, chainId, name,
          maxPerTx, maxDaily, maxMonthly,
          allowlist: allowlist || [], denylist: denylist || [],
        },
      });

      await createAuditLog(request.orgId, "SPENDING_LIMIT_CREATE", { limitId: limit.id, name, walletId }, request.userId, request);
      return sendSuccess(reply, limit, 201);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get("/spending-limits", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { limit, offset } = parsePagination(request.query as { limit?: string; offset?: string });
      const { walletId } = request.query as { walletId?: string };

      const where: any = { orgId: request.orgId };
      if (walletId) where.walletId = walletId;

      const [data, total] = await Promise.all([
        prisma.spendingLimit.findMany({ where, orderBy: { createdAt: "desc" }, take: limit, skip: offset }),
        prisma.spendingLimit.count({ where }),
      ]);
      return sendSuccess(reply, { data, total, limit, offset });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get("/spending-limits/:id", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const sl = await prisma.spendingLimit.findFirst({ where: { id, orgId: request.orgId } });
      if (!sl) throw new NotFoundError("Spending limit");
      return sendSuccess(reply, sl);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.patch("/spending-limits/:id", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { name, maxPerTx, maxDaily, maxMonthly, allowlist, denylist, active } = request.body as any;

      const result = await prisma.spendingLimit.updateMany({
        where: { id, orgId: request.orgId },
        data: { name, maxPerTx, maxDaily, maxMonthly, allowlist, denylist, active },
      });
      if (result.count === 0) throw new NotFoundError("Spending limit");

      const updated = await prisma.spendingLimit.findUnique({ where: { id } });
      await createAuditLog(request.orgId, "SPENDING_LIMIT_UPDATE", { limitId: id }, request.userId, request);
      return sendSuccess(reply, updated);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.delete("/spending-limits/:id", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      await prisma.spendingLimit.deleteMany({ where: { id, orgId: request.orgId } });
      await createAuditLog(request.orgId, "SPENDING_LIMIT_DELETE", { limitId: id }, request.userId, request);
      return sendSuccess(reply, { message: "Spending limit deleted" });
    } catch (err) {
      return sendError(reply, err);
    }
  });
}
