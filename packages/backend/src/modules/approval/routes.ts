import { FastifyInstance } from "fastify";
import prisma from "../../db.js";
import { authMiddleware } from "../../middleware/auth.js";
import { sendSuccess, sendError, ValidationError, NotFoundError, ForbiddenError } from "../../utils/errors.js";
import { createAuditLog } from "../../utils/audit.js";
import { parsePagination } from "../../utils/pagination.js";
import { decryptSeedFromStorage, signTransaction, broadcastTransaction } from "../../utils/enclave.js";
import { triggerWebhookEvents } from "../webhook/routes.js";

export async function approvalRoutes(app: FastifyInstance) {
  app.get("/approval-requests", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { limit, offset } = parsePagination(request.query as { limit?: string; offset?: string });
      const { status } = request.query as { status?: string };

      const where: any = { orgId: request.orgId };
      if (status) where.status = status;

      const [data, total] = await Promise.all([
        prisma.approvalRequest.findMany({ where, orderBy: { createdAt: "desc" }, take: limit, skip: offset }),
        prisma.approvalRequest.count({ where }),
      ]);
      return sendSuccess(reply, { data, total, limit, offset });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get("/approval-requests/:id", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const req = await prisma.approvalRequest.findFirst({
        where: { id, orgId: request.orgId },
      });
      if (!req) throw new NotFoundError("Approval request");

      const transaction = await prisma.transaction.findUnique({
        where: { id: req.transactionId },
        include: { account: { include: { chain: { select: { name: true, chainId: true } } } } },
      });

      return sendSuccess(reply, { ...req, transaction });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/approval-requests/:id/approve", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      const approvalReq = await prisma.approvalRequest.findFirst({ where: { id, orgId: request.orgId } });
      if (!approvalReq) throw new NotFoundError("Approval request");
      if (approvalReq.status !== "PENDING") throw new ValidationError("Approval request already resolved");

      if (approvalReq.approvedBy.includes(request.userId!)) {
        throw new ValidationError("You have already approved this request");
      }

      const approvedBy = [...approvalReq.approvedBy, request.userId!];
      const isFullyApproved = approvedBy.length >= approvalReq.requiredApprovals;

      await prisma.approvalRequest.update({
        where: { id },
        data: {
          approvedBy,
          status: isFullyApproved ? "APPROVED" : "PENDING",
        },
      });

      await createAuditLog(request.orgId, "APPROVAL_GRANT", { approvalId: id, approvedBy: request.userId, fullyApproved: isFullyApproved }, request.userId, request);

      if (isFullyApproved) {
        const transaction = await prisma.transaction.findUnique({
          where: { id: approvalReq.transactionId },
          include: { account: { include: { chain: true } } },
        });
        if (transaction && transaction.signedTx) {
          try {
            const { hash } = await broadcastTransaction(transaction.signedTx, transaction.account.chain.rpcUrl);
            await prisma.transaction.update({
              where: { id: transaction.id },
              data: { txHash: hash, status: "BROADCAST" },
            });
            await createAuditLog(request.orgId, "TX_BROADCAST", { transactionId: transaction.id, txHash: hash }, request.userId, request);
            triggerWebhookEvents(request.orgId, "transaction.submitted", { transactionId: transaction.id, txHash: hash });
          } catch (broadcastErr: any) {
            await prisma.transaction.update({
              where: { id: transaction.id },
              data: { status: "FAILED", error: broadcastErr.message },
            });
          }
        }
      }

      return sendSuccess(reply, { id, status: isFullyApproved ? "APPROVED" : "PENDING", approvedCount: approvedBy.length, requiredApprovals: approvalReq.requiredApprovals });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/approval-requests/:id/reject", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      const approvalReq = await prisma.approvalRequest.findFirst({ where: { id, orgId: request.orgId } });
      if (!approvalReq) throw new NotFoundError("Approval request");
      if (approvalReq.status !== "PENDING") throw new ValidationError("Approval request already resolved");

      const rejectedBy = [...approvalReq.rejectedBy, request.userId!];

      await prisma.approvalRequest.update({
        where: { id },
        data: { rejectedBy, status: "REJECTED" },
      });

      await prisma.transaction.update({
        where: { id: approvalReq.transactionId },
        data: { status: "FAILED", error: "Consensus rejected" },
      });

      await createAuditLog(request.orgId, "APPROVAL_REJECT", { approvalId: id, rejectedBy: request.userId }, request.userId, request);

      return sendSuccess(reply, { id, status: "REJECTED" });
    } catch (err) {
      return sendError(reply, err);
    }
  });
}
