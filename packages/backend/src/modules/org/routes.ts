import { FastifyInstance } from "fastify";
import prisma from "../../db.js";
import { authMiddleware } from "../../middleware/auth.js";
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

  app.get("/orgs", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const orgs = await prisma.organization.findMany();
      return sendSuccess(reply, orgs);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // User management (scoped to current org)
  app.post("/users", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { name, email, phone, role, tags } = request.body as {
        name?: string; email?: string; phone?: string; role?: string; tags?: string[];
      };
      if (!email && !phone) throw new ValidationError("Email or phone required");

      const user = await prisma.user.create({
        data: { orgId: request.orgId, name, email, phone, role: role || "DEVELOPER", tags: tags || [] },
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
      const [data, total] = await Promise.all([
        prisma.user.findMany({
          where: { orgId: request.orgId },
          select: { id: true, name: true, email: true, phone: true, role: true, tags: true, createdAt: true },
          orderBy: { createdAt: "desc" }, take: limit, skip: offset,
        }),
        prisma.user.count({ where: { orgId: request.orgId } }),
      ]);
      return sendSuccess(reply, { data, total, limit, offset });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get("/users/:id", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const user = await prisma.user.findFirst({
        where: { id, orgId: request.orgId },
        select: { id: true, name: true, email: true, phone: true, role: true, tags: true, createdAt: true },
      });
      if (!user) throw new NotFoundError("User");
      return sendSuccess(reply, user);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.patch("/users/:id", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { name, email, phone, role, tags } = request.body as any;
      const result = await prisma.user.updateMany({
        where: { id, orgId: request.orgId },
        data: { name, email, phone, role, tags },
      });
      if (result.count === 0) throw new NotFoundError("User");
      const user = await prisma.user.findUnique({ where: { id }, select: { id: true, name: true, email: true, phone: true, role: true, tags: true, createdAt: true } });
      await createAuditLog(request.orgId, "USER_UPDATE", { userId: id }, request.userId, request);
      return sendSuccess(reply, user);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.delete("/users/:id", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      await prisma.user.deleteMany({ where: { id, orgId: request.orgId } });
      await createAuditLog(request.orgId, "USER_DELETE", { userId: id }, request.userId, request);
      return sendSuccess(reply, { message: "User deleted" });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Audit Logs
  app.get("/audit-logs", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { limit, offset } = parsePagination(request.query as { limit?: string; offset?: string });
      const [data, total] = await Promise.all([
        prisma.auditLog.findMany({
          where: { orgId: request.orgId },
          orderBy: { createdAt: "desc" }, take: limit, skip: offset,
          select: { id: true, action: true, resource: true, details: true, ip: true, userAgent: true, createdAt: true, userId: true },
        }),
        prisma.auditLog.count({ where: { orgId: request.orgId } }),
      ]);
      return sendSuccess(reply, { data, total, limit, offset });
    } catch (err) {
      return sendError(reply, err);
    }
  });
}
