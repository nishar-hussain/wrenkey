import { FastifyInstance } from "fastify";
import { createTransport } from "nodemailer";
import { randomBytes } from "crypto";
import prisma from "../../db.js";
import { authMiddleware } from "../../middleware/auth.js";
import { sendSuccess, sendError, ValidationError, NotFoundError } from "../../utils/errors.js";
import { createAuditLog } from "../../utils/audit.js";
import { parsePagination } from "../../utils/pagination.js";
import { config } from "../../config.js";
import { getRedis } from "../../redis.js";

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

      // Check if user already exists
      let existingUser = null;
      if (email) {
        existingUser = await prisma.user.findUnique({
          where: { email },
          include: { authenticators: true },
        });
      } else if (phone) {
        existingUser = await prisma.user.findUnique({
          where: { phone },
          include: { authenticators: true },
        });
      }

      if (existingUser) {
        if (existingUser.orgId !== request.orgId) {
          throw new ValidationError("A user with this email or phone already exists in another organization");
        }
        const hasAuthenticators = existingUser.authenticators.length > 0;
        if (hasAuthenticators) {
          throw new ValidationError("A user with this email or phone already exists in your organization");
        }
      }

      const org = await prisma.organization.findUnique({ where: { id: request.orgId }, select: { name: true } });

      let user;
      if (existingUser) {
        // Reuse the existing pending user (updating their info in case it has changed)
        user = await prisma.user.update({
          where: { id: existingUser.id },
          data: { name, role: role || "DEVELOPER", tags: tags || [] },
          select: { id: true, name: true, email: true, phone: true, role: true, tags: true, createdAt: true },
        });
      } else {
        user = await prisma.user.create({
          data: { orgId: request.orgId, name, email, phone, role: role || "DEVELOPER", tags: tags || [] },
          select: { id: true, name: true, email: true, phone: true, role: true, tags: true, createdAt: true },
        });
      }

      await createAuditLog(request.orgId, "USER_CREATE", { userId: user.id, email }, request.userId, request);

      // Generate invitation token and store in Redis (best-effort — a Redis
      // outage must not block user creation; the invite link is simply skipped).
      const inviteToken = randomBytes(32).toString("hex");
      const INIVITE_TTL = 7 * 24 * 3600;
      let redisAvailable = true;
      try {
        const redis = getRedis();
        await redis.setex(
          `invite:${inviteToken}`,
          INIVITE_TTL,
          JSON.stringify({ userId: user.id, email: user.email || email, orgId: request.orgId, orgName: org?.name || "" }),
        );
      } catch (redisErr: any) {
        redisAvailable = false;
        console.warn(`[users.create] Redis unavailable, skipping invitation token: ${redisErr?.message || redisErr}`);
      }

      const baseUrl = config.corsOrigin[0] || "http://localhost:5173";
      const inviteLink = redisAvailable ? `${baseUrl}/accept-invitation?token=${inviteToken}` : "";

      let emailStatus: "sent" | "skipped" | "failed" = "skipped";
      let emailError = "";

      if (!redisAvailable) {
        // No invite token could be persisted, so don't send a broken link.
        console.log(`[DEV] User ${email} created but invitation link skipped (Redis unavailable)`);
      } else if (email && config.smtp.host && config.smtp.user && config.smtp.pass) {
        try {
          let branding = { appName: "WranKey", appLogo: "" };
          try {
            const orgConfigRow = await prisma.orgConfig.findUnique({ where: { orgId: request.orgId } });
            const oc = (orgConfigRow?.config as any) || {};
            branding = { appName: oc.appName || "WranKey", appLogo: oc.appLogo || "" };
          } catch { /* use defaults */ }

          const isSecure = config.smtp.port === 465;
          const transporter = createTransport({
            host: config.smtp.host,
            port: config.smtp.port,
            secure: isSecure,
            auth: { user: config.smtp.user, pass: config.smtp.pass },
            tls: { rejectUnauthorized: !config.isDev },
            connectionTimeout: 10000,
            greetingTimeout: 10000,
            socketTimeout: 15000,
          });
          const fromAddress = config.smtp.from.includes("@")
            ? `"${branding.appName}" <${config.smtp.from}>`
            : `"${branding.appName}" <${config.smtp.user}>`;
          const logoHtml = branding.appLogo ? `<img src="${branding.appLogo}" alt="${branding.appName}" style="max-height:40px;margin-bottom:16px;" />` : "";
          await transporter.sendMail({
            from: fromAddress,
            to: email,
            subject: `You've been invited to ${org?.name || branding.appName}`,
            text: `Hi ${name || email},\n\nYou've been invited to join "${org?.name || "an organization"}" on ${branding.appName}.\n\nAccept your invitation here: ${inviteLink}`,
            html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">
              ${logoHtml}
              <h2 style="color:#1e3a8a;">${branding.appName}</h2>
              <p>Hi ${name || email},</p>
              <p>You've been invited to join <strong>${org?.name || "an organization"}</strong> on ${branding.appName}.</p>
              <p style="margin:24px 0;">
                <a href="${inviteLink}" style="background:#2563eb;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Accept Invitation</a>
              </p>
              <p style="color:#64748b;font-size:14px;">This invitation expires in 7 days.</p>
            </div>`,
          });
          emailStatus = "sent";
          console.log(`[EMAIL] Sent invitation to ${email}`);
        } catch (err: any) {
          emailStatus = "failed";
          emailError = err.message || "Unknown SMTP error";
          console.error(`[EMAIL] Failed to send invitation to ${email}:`, emailError);
        }
      } else if (email) {
        console.log(`[DEV] Invitation for ${email}: ${inviteLink}`);
      }

      return sendSuccess(reply, {
        ...user,
        inviteLink,
        emailStatus,
        emailError: emailError || undefined,
      }, 201);
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
          select: { id: true, name: true, email: true, phone: true, role: true, tags: true, createdAt: true, _count: { select: { sessions: { where: { expiresAt: { gte: new Date() } } } } } },
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
