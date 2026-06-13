import { FastifyInstance } from "fastify";
import { createHmac } from "crypto";
import prisma from "../../db.js";
import { config } from "../../config.js";
import { authMiddleware } from "../../middleware/auth.js";
import { sendSuccess, sendError, ValidationError } from "../../utils/errors.js";
import { createAuditLog } from "../../utils/audit.js";
import { generateRandomToken } from "../../utils/crypto.js";
import { parsePagination } from "../../utils/pagination.js";

const WEBHOOK_EVENTS = [
  "user.signup", "user.login",
  "wallet.created", "wallet.imported", "wallet.deleted", "wallet.exported", "account.created",
  "transaction.submitted", "transaction.confirmed", "transaction.failed",
  "policy.created", "policy.deleted", "policy.triggered",
  "agent.created", "agent.revoked", "agent.login",
];

// Global function to trigger webhooks
export async function triggerWebhookEvents(orgId: string, event: string, data: unknown) {
  try {
    const webhooks = await prisma.webhook.findMany({
      where: { orgId, active: true, events: { has: event } },
    });

    for (const webhook of webhooks) {
      const payload = JSON.stringify({ event, data, timestamp: new Date().toISOString() });
      const signature = createHmac("sha256", webhook.hmacSecret).update(payload).digest("hex");

      fetch(webhook.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-WranKey-Signature": signature },
        body: payload,
      }).catch(() => {});
    }
  } catch {}
}

export async function webhookRoutes(app: FastifyInstance) {
  app.post("/webhooks", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { url, events } = request.body as { url: string; events: string[] };
      if (!url) throw new ValidationError("Callback URL required");
      if (!events || events.length === 0) throw new ValidationError("At least one event required");

      const invalidEvents = events.filter((e) => !WEBHOOK_EVENTS.includes(e));
      if (invalidEvents.length > 0) throw new ValidationError(`Invalid events: ${invalidEvents.join(", ")}`);

      const hmacSecret = generateRandomToken();
      const webhook = await prisma.webhook.create({
        data: { orgId: request.orgId, userId: request.userId, url, events, hmacSecret },
      });

      await createAuditLog(request.orgId, "WEBHOOK_CREATE", { webhookId: webhook.id, url, events }, request.userId, request);
      return sendSuccess(reply, { id: webhook.id, url: webhook.url, events: webhook.events, hmacSecret }, 201);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get("/webhooks", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { limit, offset } = parsePagination(request.query as { limit?: string; offset?: string });
      const [data, total] = await Promise.all([
        prisma.webhook.findMany({
          where: { orgId: request.orgId }, orderBy: { createdAt: "desc" }, take: limit, skip: offset,
          select: { id: true, url: true, events: true, active: true, createdAt: true },
        }),
        prisma.webhook.count({ where: { orgId: request.orgId } }),
      ]);
      return sendSuccess(reply, { data, total, limit, offset });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.delete("/webhooks/:id", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      await prisma.webhook.deleteMany({ where: { id, orgId: request.orgId } });
      await createAuditLog(request.orgId, "WEBHOOK_DELETE", { webhookId: id }, request.userId, request);
      return sendSuccess(reply, { message: "Webhook deleted" });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.patch("/webhooks/:id", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { active, url, events } = request.body as any;
      const wh = await prisma.webhook.updateMany({
        where: { id, orgId: request.orgId }, data: { active, url, events },
      });
      if (wh.count === 0) throw new ValidationError("Webhook not found");
      const updated = await prisma.webhook.findUnique({ where: { id } });
      return sendSuccess(reply, updated);
    } catch (err) {
      return sendError(reply, err);
    }
  });
}
