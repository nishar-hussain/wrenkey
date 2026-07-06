import { FastifyInstance } from "fastify";
import prisma from "../../db.js";
import { authMiddleware, adminMiddleware } from "../../middleware/auth.js";
import { sendSuccess, sendError, ValidationError, NotFoundError, ForbiddenError } from "../../utils/errors.js";
import { createAuditLog } from "../../utils/audit.js";
import { parsePagination } from "../../utils/pagination.js";
import { signToken } from "../../utils/jwt.js";
import { config } from "../../config.js";

async function verifyParentOrg(request: any, subOrgId: string): Promise<any> {
  const subOrg = await prisma.organization.findFirst({ where: { id: subOrgId, parentOrgId: request.orgId } });
  if (!subOrg) throw new NotFoundError("Sub-organization not found or not a child of your organization");
  return subOrg;
}

export async function subOrgRoutes(app: FastifyInstance) {
  // List sub-orgs
  app.get("/sub-orgs", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { limit, offset } = parsePagination(request.query as { limit?: string; offset?: string });
      const [data, total] = await Promise.all([
        prisma.organization.findMany({
          where: { parentOrgId: request.orgId },
          include: { _count: { select: { users: true, wallets: true } } },
          orderBy: { createdAt: "desc" }, take: limit, skip: offset,
        }),
        prisma.organization.count({ where: { parentOrgId: request.orgId } }),
      ]);

      const result = await Promise.all(data.map(async org => ({
        id: org.id, name: org.name,
        rootUserId: "", rootUserEmail: "",
        userCount: org._count.users, walletCount: org._count.wallets,
        createdAt: org.createdAt,
      })));

      if (data.length > 0) {
        const rootUsers = await prisma.user.findMany({
          where: { orgId: { in: data.map(o => o.id) }, role: "ORG_ADMIN" },
          select: { id: true, email: true, orgId: true },
        });
        const rootMap = new Map(rootUsers.map(u => [u.orgId, u]));
        for (const org of result) {
          const root = rootMap.get(org.id);
          if (root) { org.rootUserId = root.id; org.rootUserEmail = root.email || ""; }
        }
      }

      return sendSuccess(reply, { data: result, total, limit, offset });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Create sub-org
  app.post("/sub-orgs", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { name, rootUserEmail } = request.body as { name: string; rootUserEmail?: string };
      if (!name || !name.trim()) throw new ValidationError("Sub-organization name required");
      if (request.auth.role !== "ORG_ADMIN") throw new ForbiddenError("Only org admins can create sub-organizations");

      const subOrg = await prisma.organization.create({
        data: { name: name.trim(), parentOrgId: request.orgId },
      });

      let rootUser: any = null;
      if (rootUserEmail) {
        rootUser = await prisma.user.create({
          data: { orgId: subOrg.id, email: rootUserEmail, role: "ORG_ADMIN", name: rootUserEmail.split("@")[0] },
        });
        // Send invitation if SMTP configured
        if (config.smtp.host && config.smtp.user && config.smtp.pass) {
          try {
            const { randomBytes } = await import("crypto");
            const { getRedis } = await import("../../redis.js");
            const { createTransport } = await import("nodemailer");
            const redis = getRedis();
            const inviteToken = randomBytes(32).toString("hex");
            await redis.setex(`invite:${inviteToken}`, 7 * 24 * 3600, JSON.stringify({ userId: rootUser.id, email: rootUserEmail, orgId: subOrg.id, orgName: subOrg.name }));
            const baseUrl = config.corsOrigin[0] || "http://localhost:5173";
            const transport = createTransport({ host: config.smtp.host, port: config.smtp.port, secure: config.smtp.port === 465, auth: { user: config.smtp.user, pass: config.smtp.pass }, tls: { rejectUnauthorized: !config.isDev } });
            await transport.sendMail({
              from: config.smtp.from, to: rootUserEmail,
              subject: `You've been invited to ${subOrg.name}`,
              text: `Accept: ${baseUrl}/accept-invitation?token=${inviteToken}`,
              html: `<p>You've been invited to join <strong>${subOrg.name}</strong>.</p><p><a href="${baseUrl}/accept-invitation?token=${inviteToken}">Accept Invitation</a></p>`,
            });
          } catch { /* email optional */ }
        }
      }

      await createAuditLog(request.orgId, "SUBORG_CREATE", { subOrgId: subOrg.id, name, parentOrgId: request.orgId }, request.userId, request);
      return sendSuccess(reply, { ...subOrg, rootUserId: rootUser?.id, rootUserEmail: rootUser?.email }, 201);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Sub-org settings/detail
  app.get("/sub-orgs/:id/settings", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const subOrg = await verifyParentOrg(request, id);
      const [rootUser, userCount, walletCount, policyCount] = await Promise.all([
        prisma.user.findFirst({ where: { orgId: id, role: "ORG_ADMIN" }, select: { id: true, email: true, name: true } }),
        prisma.user.count({ where: { orgId: id } }),
        prisma.wallet.count({ where: { orgId: id } }),
        prisma.policy.count({ where: { orgId: id } }),
      ]);
      return sendSuccess(reply, {
        id: subOrg.id, name: subOrg.name, createdAt: subOrg.createdAt,
        rootUser: rootUser || null,
        userCount, walletCount, policyCount,
        parentOrgId: subOrg.parentOrgId,
      });
    } catch (err) { return sendError(reply, err); }
  });

  // List sub-org's wallets
  app.get("/sub-orgs/:id/wallets", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      await verifyParentOrg(request, id);
      const { limit, offset } = parsePagination(request.query as { limit?: string; offset?: string });
      const [data, total] = await Promise.all([
        prisma.wallet.findMany({ where: { orgId: id }, orderBy: { createdAt: "desc" }, take: limit, skip: offset, select: { id: true, name: true, ownerType: true, status: true, tags: true, createdAt: true, _count: { select: { accounts: true } } } }),
        prisma.wallet.count({ where: { orgId: id } }),
      ]);
      return sendSuccess(reply, { data, total, limit, offset });
    } catch (err) { return sendError(reply, err); }
  });

  // List sub-org's users
  app.get("/sub-orgs/:id/users", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      await verifyParentOrg(request, id);
      const { limit, offset } = parsePagination(request.query as { limit?: string; offset?: string });
      const [data, total] = await Promise.all([
        prisma.user.findMany({ where: { orgId: id }, orderBy: { createdAt: "desc" }, take: limit, skip: offset, select: { id: true, name: true, email: true, role: true, tags: true, createdAt: true, _count: { select: { sessions: true } } } }),
        prisma.user.count({ where: { orgId: id } }),
      ]);
      return sendSuccess(reply, { data, total, limit, offset });
    } catch (err) { return sendError(reply, err); }
  });

  // List sub-org's policies
  app.get("/sub-orgs/:id/policies", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      await verifyParentOrg(request, id);
      const { limit, offset } = parsePagination(request.query as { limit?: string; offset?: string });
      const [data, total] = await Promise.all([
        prisma.policy.findMany({ where: { orgId: id }, orderBy: { priority: "desc" }, take: limit, skip: offset }),
        prisma.policy.count({ where: { orgId: id } }),
      ]);
      return sendSuccess(reply, { data, total, limit, offset });
    } catch (err) { return sendError(reply, err); }
  });

  // Impersonate — generate session token for sub-org
  app.post("/sub-orgs/:id/impersonate", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      await verifyParentOrg(request, id);

      let rootUser = await prisma.user.findFirst({ where: { orgId: id, role: "ORG_ADMIN" } });
      if (!rootUser) {
        rootUser = await prisma.user.findFirst({ where: { orgId: id } });
      }
      if (!rootUser) {
        throw new ValidationError("Sub-org has no users — cannot impersonate. Invite a user to the sub-org first.");
      }

      const token = signToken({ sub: rootUser.id, orgId: id, role: "ORG_ADMIN" });
      const session = await prisma.session.create({
        data: { userId: rootUser.id, token, type: "READ_WRITE", expiresAt: new Date(Date.now() + config.sessionExpirySeconds * 1000) },
      });

      await createAuditLog(request.orgId, "SUBORG_UPDATE", { subOrgId: id, action: "IMPERSONATE" }, request.userId, request);

      return sendSuccess(reply, {
        sessionToken: token,
        user: { id: rootUser.id, email: rootUser.email, role: rootUser.role },
        org: { id, name: (await prisma.organization.findUnique({ where: { id }, select: { name: true } }))?.name || "" },
        impersonating: true,
        expiresAt: session.expiresAt,
      });
    } catch (err) { return sendError(reply, err); }
  });

  // Rename sub-org
  app.patch("/sub-orgs/:id", { preHandler: [authMiddleware, adminMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { name } = request.body as { name?: string };
      if (!name) throw new ValidationError("Name required");
      await verifyParentOrg(request, id);
      const updated = await prisma.organization.update({ where: { id }, data: { name } });
      await createAuditLog(request.orgId, "SUBORG_UPDATE", { subOrgId: id, name }, request.userId, request);
      return sendSuccess(reply, updated);
    } catch (err) { return sendError(reply, err); }
  });

  // Delete sub-org
  app.delete("/sub-orgs/:id", { preHandler: [authMiddleware, adminMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      await verifyParentOrg(request, id);
      await prisma.organization.delete({ where: { id } });
      await createAuditLog(request.orgId, "SUBORG_DELETE", { subOrgId: id }, request.userId, request);
      return sendSuccess(reply, { message: "Sub-organization deleted" });
    } catch (err) { return sendError(reply, err); }
  });
}
