import { FastifyInstance } from "fastify";
import prisma from "../../db.js";
import { authMiddleware, adminMiddleware } from "../../middleware/auth.js";
import { sendSuccess, sendError, ValidationError, NotFoundError } from "../../utils/errors.js";
import { createAuditLog } from "../../utils/audit.js";
import { parsePagination } from "../../utils/pagination.js";

export async function orgRoutes(app: FastifyInstance) {
  app.post("/orgs", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { name } = request.body as { name: string };
      if (!name) throw new ValidationError("Organization name is required");

      const org = await prisma.organization.create({ data: { name } });
      await createAuditLog(org.id, "ORG_CREATE", { name }, request.userId, request);

      return sendSuccess(reply, org, 201);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get("/orgs/:orgId", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { orgId } = request.params as { orgId: string };
      const org = await prisma.organization.findUnique({ where: { id: orgId } });
      if (!org) throw new NotFoundError("Organization");
      return sendSuccess(reply, org);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Users
  app.post("/users", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { name, email, phone, role, tags } = request.body as {
        name?: string;
        email?: string;
        phone?: string;
        role?: string;
        tags?: string[];
      };
      if (!email && !phone) throw new ValidationError("Email or phone is required");

      const user = await prisma.user.create({
        data: {
          orgId: request.orgId,
          name,
          email,
          phone,
          role: role || "DEVELOPER",
          tags: tags || [],
        },
        select: { id: true, name: true, email: true, phone: true, role: true, tags: true, createdAt: true },
      });

      await createAuditLog(request.orgId, "USER_CREATE", { userId: user.id, email }, request.userId, request);
      return sendSuccess(reply, user, 201);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get("/users", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { limit, offset } = parsePagination(request.query as { limit?: string; offset?: string });
      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where: { orgId: request.orgId },
          select: { id: true, name: true, email: true, phone: true, role: true, tags: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: limit,
          skip: offset,
        }),
        prisma.user.count({ where: { orgId: request.orgId } }),
      ]);
      return sendSuccess(reply, { users, total, limit, offset });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.patch("/users/:userId", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { userId } = request.params as { userId: string };
      const { name, email, phone, tags } = request.body as {
        name?: string;
        email?: string;
        phone?: string;
        tags?: string[];
      };

      const user = await prisma.user.updateMany({
        where: { id: userId, orgId: request.orgId },
        data: { ...(name !== undefined && { name }), ...(email !== undefined && { email }), ...(phone !== undefined && { phone }), ...(tags !== undefined && { tags }) },
      });
      if (user.count === 0) throw new NotFoundError("User");

      const updated = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true, phone: true, role: true, tags: true },
      });

      await createAuditLog(request.orgId, "USER_UPDATE", { userId }, request.userId, request);
      return sendSuccess(reply, updated);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.delete("/users/:userId", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { userId } = request.params as { userId: string };
      await prisma.user.deleteMany({ where: { id: userId, orgId: request.orgId } });
      await createAuditLog(request.orgId, "USER_DELETE", { userId }, request.userId, request);
      return sendSuccess(reply, { message: "User deleted" });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Audit Logs
  app.get("/audit-logs", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { limit, offset } = parsePagination(request.query as { limit?: string; offset?: string });
      const [logs, total] = await Promise.all([
        prisma.auditLog.findMany({
          where: { orgId: request.orgId },
          orderBy: { createdAt: "desc" },
          take: limit,
          skip: offset,
        }),
        prisma.auditLog.count({ where: { orgId: request.orgId } }),
      ]);
      return sendSuccess(reply, { logs, total, limit, offset });
    } catch (err) {
      return sendError(reply, err);
    }
  });
}
