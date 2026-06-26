import { FastifyInstance } from "fastify";
import prisma from "../../db.js";
import { authMiddleware } from "../../middleware/auth.js";
import { sendSuccess, sendError } from "../../utils/errors.js";
import { parsePagination } from "../../utils/pagination.js";

const PLANS = [
  {
    key: "free", name: "Free", price: "$0/mo",
    features: [{ label: "Signatures", value: "First 25 Free" }, { label: "Wallets", value: "Up to 1k" }],
  },
  {
    key: "payg", name: "Pay as you go", price: "Variable",
    features: [{ label: "Signatures", value: "Free - 25/mo" }, { label: "Additional", value: "$0.10/tx" }, { label: "Wallets", value: "Up to 1k" }],
  },
  {
    key: "pro", name: "Pro", price: "$99/mo",
    features: [{ label: "Signatures", value: "$0.05/sig" }, { label: "Wallets", value: "Up to 2k" }],
  },
  {
    key: "enterprise", name: "Enterprise", price: "Custom",
    features: [
      { label: "Signatures", value: "Custom Pricing" }, { label: "Wallets", value: "Unlimited" },
      { label: "Enterprise support", value: "" }, { label: "Technical advisory", value: "" },
      { label: "Prioritized features", value: "" }, { label: "SMS auth", value: "On request" },
      { label: "Fiat on-ramp", value: "On request" },
    ],
  },
];

export async function billingRoutes(app: FastifyInstance) {
  app.get("/billing/invoices", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { limit, offset } = parsePagination(request.query as { limit?: string; offset?: string });
      const [data, total] = await Promise.all([
        prisma.invoice.findMany({ where: { orgId: request.orgId }, orderBy: { createdAt: "desc" }, take: limit, skip: offset }),
        prisma.invoice.count({ where: { orgId: request.orgId } }),
      ]);
      return sendSuccess(reply, { data, total, limit, offset });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get("/billing/usage", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { month, year } = request.query as { month?: string; year?: string };
      const now = new Date();
      const m = month ? parseInt(month) - 1 : now.getMonth();
      const y = year ? parseInt(year) : now.getFullYear();
      const start = new Date(y, m, 1);
      const end = new Date(y, m + 1, 1);

      const [wallets, txs, agents, users, webhooks] = await Promise.all([
        prisma.wallet.count({ where: { orgId: request.orgId } }),
        prisma.transaction.count({ where: { orgId: request.orgId } }),
        prisma.agent.count({ where: { orgId: request.orgId } }),
        prisma.user.count({ where: { orgId: request.orgId } }),
        prisma.webhook.count({ where: { orgId: request.orgId } }),
      ]);

      const periodTxs = await prisma.transaction.count({
        where: { orgId: request.orgId, createdAt: { gte: start, lt: end } },
      });
      const periodAudit = await prisma.auditLog.count({
        where: { orgId: request.orgId, createdAt: { gte: start, lt: end } },
      });

      return sendSuccess(reply, {
        month: m + 1, year: y,
        metrics: {
          Signatures: periodTxs,
          Activities: periodAudit,
          Wallets: wallets,
          "Sub-orgs": 0,
          "Private Keys": wallets,
          "Private Keys (in/out)": periodTxs,
        },
      });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get("/billing/plans", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const wallets = await prisma.wallet.count({ where: { orgId: request.orgId } });
      let currentPlan = "free";
      if (wallets > 25) currentPlan = "enterprise";
      else if (wallets > 3) currentPlan = "payg";

      return sendSuccess(reply, { plans: PLANS, currentPlan });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/billing/generate-invoice", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const now = new Date();
      const period = now.toLocaleString("default", { month: "long", year: "numeric" });
      const existing = await prisma.invoice.findFirst({
        where: { orgId: request.orgId, period },
      });
      if (existing) return sendSuccess(reply, { message: "Invoice already exists for this period" });

      const wallets = await prisma.wallet.count({ where: { orgId: request.orgId } });
      let planName = "Free";
      let amount = "$0.00";
      if (wallets > 25) { planName = "Enterprise"; amount = "Custom"; }
      else if (wallets > 3) { planName = "Developer"; amount = "$49.00"; }

      const count = await prisma.invoice.count({ where: { orgId: request.orgId } });
      const invNumber = `INV-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(count + 1).padStart(3, "0")}`;

      const invoice = await prisma.invoice.create({
        data: {
          orgId: request.orgId,
          number: invNumber,
          period,
          plan: planName,
          amount,
          status: "pending",
          dueDate: new Date(now.getFullYear(), now.getMonth() + 1, 1),
        },
      });

      return sendSuccess(reply, invoice, 201);
    } catch (err) {
      return sendError(reply, err);
    }
  });
}
