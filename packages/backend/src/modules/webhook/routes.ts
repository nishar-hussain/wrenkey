import { FastifyInstance } from "fastify";
import { createHmac } from "crypto";
import prisma from "../../db.js";
import { config } from "../../config.js";
import { authMiddleware } from "../../middleware/auth.js";
import { sendSuccess, sendError, ValidationError, NotFoundError } from "../../utils/errors.js";
import { createAuditLog } from "../../utils/audit.js";
import { generateRandomToken } from "../../utils/crypto.js";

const WEBHOOK_EVENTS = [
  "user.signup",
  "user.login",
  "wallet.created",
  "wallet.imported",
  "wallet.deleted",
  "account.created",
  "transaction.submitted",
  "transaction.confirmed",
  "transaction.failed",
  "policy.created",
  "policy.deleted",
  "policy.triggered",
  "agent.created",
  "agent.revoked",
  "agent.login",
];

export async function webhookRoutes(app: FastifyInstance) {
  app.post("/webhooks", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { url, events } = request.body as {
        url: string;
        events: string[];
      };
      if (!url) throw new ValidationError("Callback URL is required");
      if (!events || events.length === 0) throw new ValidationError("At least one event is required");

      const invalidEvents = events.filter((e) => !WEBHOOK_EVENTS.includes(e));
      if (invalidEvents.length > 0) {
        throw new ValidationError(`Invalid events: ${invalidEvents.join(", ")}`);
      }

      const hmacSecret = generateRandomToken();

      const webhook = await prisma.webhook.create({
        data: {
          orgId: request.orgId,
          userId: request.userId,
          url,
          events,
          hmacSecret,
        },
      });

      await createAuditLog(
        request.orgId,
        "WEBHOOK_CREATE",
        { webhookId: webhook.id, url, events },
        request.userId,
        request
      );

      return sendSuccess(reply, {
        id: webhook.id,
        url: webhook.url,
        events: webhook.events,
        hmacSecret,
      }, 201);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get("/webhooks", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const webhooks = await prisma.webhook.findMany({
        where: { orgId: request.orgId },
        orderBy: { createdAt: "desc" },
        select: { id: true, url: true, events: true, active: true, createdAt: true },
      });
      return sendSuccess(reply, { webhooks });
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
}

// Event emitter utility
export async function triggerWebhookEvents(
  orgId: string,
  event: string,
  payload: Record<string, unknown>
) {
  try {
    const webhooks = await prisma.webhook.findMany({
      where: { orgId, active: true, events: { has: event } },
    });

    for (const webhook of webhooks) {
      const body = JSON.stringify({
        event,
        timestamp: new Date().toISOString(),
        data: payload,
      });
      const signature = createHmac("sha256", webhook.hmacSecret)
        .update(body)
        .digest("hex");

      // Fire and forget webhook delivery
      fetch(webhook.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-ArKey-Signature": signature,
          "X-ArKey-Event": event,
        },
        body,
      }).catch((err) => {
        console.error(`Webhook delivery failed to ${webhook.url}:`, err.message);
      });
    }
  } catch (err) {
    console.error("Error triggering webhooks:", err);
  }
}
