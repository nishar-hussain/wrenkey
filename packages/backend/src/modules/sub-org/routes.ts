import { FastifyInstance } from "fastify";
import prisma from "../../db.js";
import { authMiddleware } from "../../middleware/auth.js";
import { sendSuccess, sendError, ValidationError, NotFoundError, ForbiddenError } from "../../utils/errors.js";
import { createAuditLog } from "../../utils/audit.js";
import { parsePagination } from "../../utils/pagination.js";

export async function subOrgRoutes(app: FastifyInstance) {
  app.get("/sub-orgs", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { limit, offset } = parsePagination(request.query as { limit?: string; offset?: string });
      const [data, total] = await Promise.all([
        prisma.organization.findMany({
          where: { parentOrgId: request.orgId },
          include: {
            _count: { select: { users: true, wallets: true } },
          },
          orderBy: { createdAt: "desc" }, take: limit, skip: offset,
        }),
        prisma.organization.count({ where: { parentOrgId: request.orgId } }),
      ]);

      const result = await Promise.all(data.map(async org => {
        return {
          id: org.id, name: org.name,
          rootUserId: "",
          rootUserEmail: "",
          userCount: org._count.users, walletCount: org._count.wallets,
          createdAt: org.createdAt,
        };
      }));

      if (data.length > 0) {
        const rootUsers = await prisma.user.findMany({
          where: { orgId: { in: data.map(o => o.id) }, role: "ORG_ADMIN" },
          select: { id: true, email: true, orgId: true },
        });
        const rootMap = new Map(rootUsers.map(u => [u.orgId, u]));
        for (const org of result) {
          const root = rootMap.get(org.id);
          if (root) {
            org.rootUserId = root.id;
            org.rootUserEmail = root.email;
          }
        }
      }

      return sendSuccess(reply, { data: result, total, limit, offset });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/sub-orgs", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { name, rootUserEmail } = request.body as { name: string; rootUserEmail?: string };
      if (!name || !name.trim()) throw new ValidationError("Sub-organization name required");

      if (request.auth.role !== "ORG_ADMIN") throw new ForbiddenError("Only org admins can create sub-organizations");

      const subOrg = await prisma.organization.create({
        data: { name: name.trim(), parentOrgId: request.orgId },
      });

      if (rootUserEmail) {
        await prisma.user.create({
          data: { orgId: subOrg.id, email: rootUserEmail, role: "ORG_ADMIN", name: rootUserEmail.split("@")[0] },
        });
      }

      await createAuditLog(request.orgId, "SUBORG_CREATE", { subOrgId: subOrg.id, name, parentOrgId: request.orgId }, request.userId, request);
      return sendSuccess(reply, subOrg, 201);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.patch("/sub-orgs/:id", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { name } = request.body as { name?: string };
      if (!name) throw new ValidationError("Name required");

      const subOrg = await prisma.organization.findFirst({ where: { id, parentOrgId: request.orgId } });
      if (!subOrg) throw new NotFoundError("Sub-organization");

      const updated = await prisma.organization.update({ where: { id }, data: { name } });
      await createAuditLog(request.orgId, "SUBORG_UPDATE", { subOrgId: id, name }, request.userId, request);
      return sendSuccess(reply, updated);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.delete("/sub-orgs/:id", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const subOrg = await prisma.organization.findFirst({ where: { id, parentOrgId: request.orgId } });
      if (!subOrg) throw new NotFoundError("Sub-organization");

      await prisma.organization.delete({ where: { id } });
      await createAuditLog(request.orgId, "SUBORG_DELETE", { subOrgId: id }, request.userId, request);
      return sendSuccess(reply, { message: "Sub-organization deleted" });
    } catch (err) {
      return sendError(reply, err);
    }
  });
}
