import { FastifyInstance } from "fastify";
import prisma from "../../db.js";
import { authMiddleware } from "../../middleware/auth.js";
import { sendSuccess, sendError, ValidationError, NotFoundError } from "../../utils/errors.js";
import { createAuditLog } from "../../utils/audit.js";
import { generateRandomToken, hashSha256 } from "../../utils/crypto.js";
import { triggerWebhookEvents } from "../webhook/routes.js";
import { parsePagination } from "../../utils/pagination.js";

export async function agentRoutes(app: FastifyInstance) {
  // Create agent (delegated user + API key)
  app.post("/agents", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { name, email, permissions, tags } = request.body as {
        name: string;
        email?: string;
        permissions?: string[];
        tags?: string[];
      };
      if (!name) throw new ValidationError("Agent name is required");

      // Create user for agent
      const user = await prisma.user.create({
        data: {
          orgId: request.orgId,
          name,
          email: email || `agent_${name.toLowerCase().replace(/\s+/g, "_")}@arkey.internal`,
          role: "AGENT",
          tags: tags || [],
        },
      });

      // Create API key for the agent
      const rawKey = `arkey_${generateRandomToken()}`;
      const keyHash = hashSha256(rawKey);
      const keyPrefix = rawKey.slice(0, 12);

      const apiKey = await prisma.apiKey.create({
        data: {
          orgId: request.orgId,
          name: `Agent Key: ${name}`,
          keyHash,
          keyPrefix,
          permissions: permissions || ["wallet:sign"],
          allowedIps: [],
        },
      });

      // Create agent record
      const agent = await prisma.agent.create({
        data: {
          orgId: request.orgId,
          userId: user.id,
          name,
          apiKeyId: apiKey.id,
        },
      });

      await createAuditLog(request.orgId, "AGENT_CREATE", { agentId: agent.id, name, userId: user.id }, request.userId, request);

      triggerWebhookEvents(request.orgId, "agent.created", {
        agentId: agent.id,
        name,
        userId: user.id,
        permissions: permissions || ["wallet:sign"],
      });

      return sendSuccess(reply, {
        agent: {
          id: agent.id,
          name: agent.name,
          status: agent.status,
          userId: user.id,
        },
        credentials: {
          userId: user.id,
          apiKeyId: apiKey.id,
          apiKey: rawKey,
          keyPrefix,
        },
      }, 201);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // List agents
  app.get("/agents", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { limit, offset } = parsePagination(request.query as { limit?: string; offset?: string });
      const [agents, total] = await Promise.all([
        prisma.agent.findMany({
          where: { orgId: request.orgId },
          include: {
            user: { select: { id: true, name: true, email: true, tags: true } },
          },
          orderBy: { createdAt: "desc" },
          take: limit,
          skip: offset,
        }),
        prisma.agent.count({ where: { orgId: request.orgId } }),
      ]);
      return sendSuccess(reply, { agents, total, limit, offset });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Get agent details
  app.get("/agents/:id", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const agent = await prisma.agent.findFirst({
        where: { id, orgId: request.orgId },
        include: {
          user: { select: { id: true, name: true, email: true, tags: true } },
        },
      });
      if (!agent) throw new NotFoundError("Agent");
      return sendSuccess(reply, agent);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Delete/Revoke agent
  app.delete("/agents/:id", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const agent = await prisma.agent.findFirst({ where: { id, orgId: request.orgId } });
      if (!agent) throw new NotFoundError("Agent");

      // Revoke agent and its API key
      await prisma.agent.update({ where: { id }, data: { status: "REVOKED" } });

      if (agent.apiKeyId) {
        await prisma.apiKey.deleteMany({ where: { id: agent.apiKeyId, orgId: request.orgId } });
      }

      await createAuditLog(request.orgId, "AGENT_DELETE", { agentId: id, name: agent.name }, request.userId, request);

      triggerWebhookEvents(request.orgId, "agent.revoked", {
        agentId: id,
        name: agent.name,
      });

      return sendSuccess(reply, { message: "Agent revoked" });
    } catch (err) {
      return sendError(reply, err);
    }
  });
}
