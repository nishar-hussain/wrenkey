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
      const org = await prisma.organization.findUnique({
        where: { id: request.orgId },
      });
      if (!org) throw new NotFoundError("Organization");
      return sendSuccess(reply, [org]);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.patch("/org", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { name } = request.body as { name: string };
      if (!name || !name.trim()) throw new ValidationError("Organization name is required");

      const org = await prisma.organization.update({
        where: { id: request.orgId },
        data: { name: name.trim() },
      });

      await createAuditLog(request.orgId, "ORG_UPDATE", { name }, request.userId, request);
      return sendSuccess(reply, org);
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

  app.patch("/users/me", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { name } = request.body as { name?: string };
      if (!name) throw new ValidationError("Name is required");
      const user = await prisma.user.update({
        where: { id: request.userId },
        data: { name },
        select: { id: true, name: true, email: true, phone: true, role: true, tags: true, createdAt: true },
      });
      await createAuditLog(request.orgId, "USER_UPDATE", { userId: request.userId, name }, request.userId, request);
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
  app.get("/activities", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { limit, offset } = parsePagination(request.query as { limit?: string; offset?: string });

      const [logs, users, approvals] = await Promise.all([
        prisma.auditLog.findMany({ where: { orgId: request.orgId }, orderBy: { createdAt: "desc" }, take: limit, skip: offset, select: { id: true, action: true, details: true, createdAt: true, userId: true } }),
        prisma.user.findMany({ where: { orgId: request.orgId }, select: { id: true, email: true, role: true } }),
        prisma.approvalRequest.findMany({ where: { orgId: request.orgId }, select: { id: true, status: true } }),
      ]);

      const userMap = new Map(users.map(u => [u.id, u]));
      const pendingApprovals = approvals.filter(a => a.status === "PENDING").length;

      const data = logs.map(log => {
        const u = log.userId ? userMap.get(log.userId) : null;
        return {
          id: log.id,
          type: (log.action || "").replace(/_/g, " ").toLowerCase(),
          action: log.action,
          initiator: u?.role === "ORG_ADMIN" ? "Root user" : u?.email?.split("@")[0] || "System",
          initiatorEmail: u?.email || "",
          approvals: 1,
          denials: 0,
          createdAt: log.createdAt,
          updatedAt: log.createdAt,
          status: "Completed",
          details: log.details,
        };
      });

      const total = await prisma.auditLog.count({ where: { orgId: request.orgId } });

      return sendSuccess(reply, { data, total, pendingCount: pendingApprovals, limit, offset });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get("/audit-logs", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { limit, offset } = parsePagination(request.query as { limit?: string; offset?: string });
      const { action, resource } = request.query as { action?: string; resource?: string };

      const where: any = { orgId: request.orgId };
      if (action) where.action = action;
      if (resource) where.resource = resource;

      const [data, total] = await Promise.all([
        prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, take: limit, skip: offset, select: { id: true, action: true, resource: true, details: true, ip: true, userAgent: true, createdAt: true, userId: true } }),
        prisma.auditLog.count({ where }),
      ]);
      return sendSuccess(reply, { data, total, limit, offset });
    } catch (err) {
      return sendError(reply, err);
    }
  });
}
