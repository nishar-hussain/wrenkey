import { FastifyInstance } from "fastify";
import { createHmac } from "crypto";
import prisma from "../../db.js";
import { config } from "../../config.js";
import { authMiddleware } from "../../middleware/auth.js";
import { sendSuccess, sendError, ValidationError, NotFoundError } from "../../utils/errors.js";
import { createAuditLog } from "../../utils/audit.js";
import { generateRandomToken } from "../../utils/crypto.js";
import { parsePagination } from "../../utils/pagination.js";
import { notifyOrg } from "../../services/websocket.js";

const WEBHOOK_EVENTS = [
  "user.signup", "user.login",
  "wallet.created", "wallet.imported", "wallet.deleted", "wallet.exported", "wallet.frozen", "wallet.unfrozen", "wallet.rotated",
  "account.created", "account.deleted",
  "transaction.submitted", "transaction.confirmed", "transaction.failed",
  "policy.created", "policy.deleted", "policy.triggered",
  "agent.created", "agent.revoked", "agent.login",
  "wvc.deployment.live", "wvc.deployment.unhealthy",
  "wvc.manifest.approved", "wvc.manifest.approval_needed",
  "wvc.key_ceremony.started", "wvc.key_ceremony.completed",
];

const MAX_RETRIES = parseInt(process.env.WEBHOOK_MAX_RETRIES || "5", 10);
const BASE_DELAY_MS = parseInt(process.env.WEBHOOK_RETRY_BASE_DELAY_MS || "60000", 10);
const MAX_DELAY_MS = parseInt(process.env.WEBHOOK_RETRY_MAX_DELAY_MS || "3600000", 10);

function calculateNextAttempt(attemptCount: number): Date {
  const delay = Math.min(BASE_DELAY_MS * Math.pow(2, attemptCount), MAX_DELAY_MS);
  return new Date(Date.now() + delay);
}

async function deliverWebhook(delivery: { id: string; webhookId: string; event: string; payload: any }, webhook: { url: string; hmacSecret: string }, attempt: number): Promise<boolean> {
  const payloadStr = JSON.stringify({ event: delivery.event, data: delivery.payload, timestamp: new Date().toISOString() });
  const signature = createHmac("sha256", webhook.hmacSecret).update(payloadStr).digest("hex");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(webhook.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-WranKey-Signature": signature },
      body: payloadStr,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (res.ok) {
      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: { status: "DELIVERED", attemptCount: attempt + 1, lastAttemptAt: new Date(), nextAttemptAt: null },
      });
      return true;
    }

    const errMsg = `HTTP ${res.status}`;
    if (attempt + 1 >= MAX_RETRIES) {
      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: { status: "FAILED", attemptCount: attempt + 1, lastAttemptAt: new Date(), lastError: errMsg, nextAttemptAt: null },
      });
    } else {
      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: { status: "RETRYING", attemptCount: attempt + 1, lastAttemptAt: new Date(), lastError: errMsg, nextAttemptAt: calculateNextAttempt(attempt + 1) },
      });
    }
    return false;
  } catch (err: any) {
    clearTimeout(timeout);
    const errMsg = err.message || "Network error";

    if (attempt + 1 >= MAX_RETRIES) {
      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: { status: "FAILED", attemptCount: attempt + 1, lastAttemptAt: new Date(), lastError: errMsg, nextAttemptAt: null },
      });
    } else {
      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: { status: "RETRYING", attemptCount: attempt + 1, lastAttemptAt: new Date(), lastError: errMsg, nextAttemptAt: calculateNextAttempt(attempt + 1) },
      });
    }
    return false;
  }
}

export async function processPendingDeliveries() {
  try {
    const now = new Date();
    const pending = await prisma.webhookDelivery.findMany({
      where: {
        status: { in: ["PENDING", "RETRYING"] },
        OR: [
          { nextAttemptAt: null },
          { nextAttemptAt: { lte: now } },
        ],
        attemptCount: { lt: MAX_RETRIES },
      },
      take: 50,
      orderBy: { nextAttemptAt: "asc" },
    });

    for (const delivery of pending) {
      const webhook = await prisma.webhook.findUnique({
        where: { id: delivery.webhookId },
        select: { url: true, hmacSecret: true, active: true },
      });

      if (!webhook || !webhook.active) {
        await prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: { status: "FAILED", lastError: "Webhook deleted or deactivated", nextAttemptAt: null },
        });
        continue;
      }

      await deliverWebhook(
        { id: delivery.id, webhookId: delivery.webhookId, event: delivery.event, payload: delivery.payload },
        webhook,
        delivery.attemptCount
      );
    }
  } catch (err) {
    console.error("[WEBHOOK] Error processing deliveries:", err);
  }
}

export async function triggerWebhookEvents(orgId: string, event: string, data: unknown) {
  try {
    const webhooks = await prisma.webhook.findMany({
      where: { orgId, active: true, events: { has: event } },
    });

    for (const webhook of webhooks) {
      const delivery = await prisma.webhookDelivery.create({
        data: {
          webhookId: webhook.id,
          orgId,
          event,
          payload: data as any,
          status: "PENDING",
          attemptCount: 0,
          nextAttemptAt: new Date(),
        },
      });

      deliverWebhook(
        { id: delivery.id, webhookId: webhook.id, event, payload: data },
        { url: webhook.url, hmacSecret: webhook.hmacSecret },
        0
      ).catch((err) => {
        console.error(`[WEBHOOK] Immediate delivery failed for ${webhook.id}:`, err);
      });
    }

    notifyOrg(orgId, event, data);
  } catch (err) {
    console.error("[WEBHOOK] Error fetching webhooks:", err);
  }
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
      const { search } = request.query as { search?: string };

      const where: any = { orgId: request.orgId };
      if (search) {
        where.url = { contains: search, mode: "insensitive" };
      }
      const [data, total] = await Promise.all([
        prisma.webhook.findMany({
          where, orderBy: { createdAt: "desc" }, take: limit, skip: offset,
          select: { id: true, url: true, events: true, active: true, createdAt: true },
        }),
        prisma.webhook.count({ where }),
      ]);
      return sendSuccess(reply, { data, total, limit, offset });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.delete("/webhooks/:id", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const result = await prisma.webhook.deleteMany({ where: { id, orgId: request.orgId } });
      if (result.count === 0) throw new NotFoundError("Webhook");
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
      if (events && Array.isArray(events)) {
        const invalid = events.filter((e: string) => !WEBHOOK_EVENTS.includes(e));
        if (invalid.length > 0) throw new ValidationError(`Invalid event types: ${invalid.join(", ")}`);
      }
      const wh = await prisma.webhook.updateMany({
        where: { id, orgId: request.orgId }, data: { active, url, events },
      });
      if (wh.count === 0) throw new NotFoundError("Webhook not found");
      const updated = await prisma.webhook.findUnique({ where: { id } });
      return sendSuccess(reply, updated);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // GET /webhooks/event-types — list all available event types
  app.get("/webhooks/event-types", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      return sendSuccess(reply, { events: WEBHOOK_EVENTS });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // POST /webhooks/:id/test — send a test event to verify the endpoint is reachable
  app.post("/webhooks/:id/test", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const wh = await prisma.webhook.findFirst({ where: { id, orgId: request.orgId } });
      if (!wh) throw new NotFoundError("Webhook");
      if (!wh.active) throw new ValidationError("Webhook is not active");

      const testPayload = { event: "test", data: { message: "Test from WranKey", timestamp: new Date().toISOString() }, timestamp: new Date().toISOString() };
      const result = await deliverWebhook({ id: "test", webhookId: wh.id, event: "test", payload: testPayload }, { url: wh.url, hmacSecret: wh.hmacSecret }, 0);
      return sendSuccess(reply, { delivered: result, message: result ? "Test event delivered successfully" : "Test event delivery failed — check the endpoint URL" });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // POST /webhooks/:id/deliveries/:deliveryId/retry — manually retry a failed delivery
  app.post("/webhooks/:id/deliveries/:deliveryId/retry", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id, deliveryId } = request.params as { id: string; deliveryId: string };
      const wh = await prisma.webhook.findFirst({ where: { id, orgId: request.orgId } });
      if (!wh) throw new NotFoundError("Webhook");

      const delivery = await prisma.webhookDelivery.findFirst({ where: { id: deliveryId, webhookId: id } });
      if (!delivery) throw new NotFoundError("Delivery");
      if (delivery.status === "DELIVERED") throw new ValidationError("Delivery already succeeded");

      await prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: { status: "PENDING", nextAttemptAt: new Date(), lastError: null },
      });

      // Fire immediate retry
      deliverWebhook({ id: delivery.id, webhookId: wh.id, event: delivery.event, payload: delivery.payload }, { url: wh.url, hmacSecret: wh.hmacSecret }, delivery.attemptCount).catch(() => {});

      return sendSuccess(reply, { message: "Delivery re-queued for retry" });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get("/webhooks/:id/deliveries", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { limit, offset } = parsePagination(request.query as { limit?: string; offset?: string });

      const wh = await prisma.webhook.findFirst({ where: { id, orgId: request.orgId } });
      if (!wh) throw new NotFoundError("Webhook");

      const [data, total] = await Promise.all([
        prisma.webhookDelivery.findMany({
          where: { webhookId: id },
          orderBy: { createdAt: "desc" },
          take: limit,
          skip: offset,
        }),
        prisma.webhookDelivery.count({ where: { webhookId: id } }),
      ]);
      return sendSuccess(reply, { data, total, limit, offset });
    } catch (err) {
      return sendError(reply, err);
    }
  });
}
