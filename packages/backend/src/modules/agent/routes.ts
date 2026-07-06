import { FastifyInstance } from "fastify";
import prisma from "../../db.js";
import { authMiddleware } from "../../middleware/auth.js";
import { sendSuccess, sendError, ValidationError, NotFoundError } from "../../utils/errors.js";
import { createAuditLog } from "../../utils/audit.js";
import { generateRandomToken, hashSha256 } from "../../utils/crypto.js";
import { triggerWebhookEvents } from "../webhook/routes.js";
import { notifyAgentCreated } from "../../services/notifications.js";
import { parsePagination } from "../../utils/pagination.js";

export async function agentRoutes(app: FastifyInstance) {
  // Create agent
  app.post("/agents", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { name, email, permissions, tags } = request.body as {
        name: string; email?: string; permissions?: string[]; tags?: string[];
      };
      if (!name) throw new ValidationError("Agent name required");

      const user = await prisma.user.create({
        data: {
          orgId: request.orgId, name,
          email: email || `agent_${name.toLowerCase().replace(/\s+/g, "_")}@wrankey.internal`,
          role: "AGENT", tags: tags || [],
        },
      });

      const rawKey = `wrankey_${generateRandomToken()}`;
      const keyHash = hashSha256(rawKey);
      const keyPrefix = rawKey.slice(0, 12);

      const apiKey = await prisma.apiKey.create({
        data: {
          orgId: request.orgId, name: `Agent Key: ${name}`,
          keyHash, keyPrefix, permissions: permissions || ["wallet:sign"], allowedIps: [],
        },
      });

      const agent = await prisma.agent.create({
        data: { orgId: request.orgId, userId: user.id, name, apiKeyId: apiKey.id },
      });

      await createAuditLog(request.orgId, "AGENT_CREATE", { agentId: agent.id, name, userId: user.id }, request.userId, request);
      triggerWebhookEvents(request.orgId, "agent.created", { agentId: agent.id, name, userId: user.id, permissions: permissions || ["wallet:sign"] });
      notifyAgentCreated(request.orgId, name, agent.id).catch(() => {});

      return sendSuccess(reply, {
        agent: { id: agent.id, name: agent.name, status: agent.status, userId: user.id },
        credentials: { userId: user.id, apiKeyId: apiKey.id, apiKey: rawKey, keyPrefix },
      }, 201);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // List agents
  app.get("/agents", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { limit, offset } = parsePagination(request.query as { limit?: string; offset?: string });
      const [data, total] = await Promise.all([
        prisma.agent.findMany({
          where: { orgId: request.orgId },
          include: { user: { select: { id: true, name: true, email: true } } },
          orderBy: { createdAt: "desc" }, take: limit, skip: offset,
        }),
        prisma.agent.count({ where: { orgId: request.orgId } }),
      ]);
      return sendSuccess(reply, { data, total, limit, offset });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Get agent
  app.get("/agents/:id", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const agent = await prisma.agent.findFirst({
        where: { id, orgId: request.orgId },
        include: { user: { select: { id: true, name: true, email: true, role: true, tags: true } } },
      });
      if (!agent) throw new NotFoundError("Agent");
      return sendSuccess(reply, agent);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Revoke agent
  app.delete("/agents/:id", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const agent = await prisma.agent.findFirst({ where: { id, orgId: request.orgId } });
      if (!agent) throw new NotFoundError("Agent");

      await prisma.agent.update({ where: { id }, data: { status: "REVOKED" } });
      if (agent.apiKeyId) await prisma.apiKey.deleteMany({ where: { id: agent.apiKeyId } });
      // Kill all active sessions for the agent's user so revoked agents can't stay authenticated
      await prisma.session.deleteMany({ where: { userId: agent.userId, expiresAt: { gt: new Date() } } });

      await createAuditLog(request.orgId, "AGENT_DELETE", { agentId: id }, request.userId, request);
      triggerWebhookEvents(request.orgId, "agent.revoked", { agentId: id });
      return sendSuccess(reply, { message: "Agent revoked" });
    } catch (err) {
      return sendError(reply, err);
    }
  });
}
