import prisma from "../db.js";
import { FastifyRequest } from "fastify";

export type AuditAction =
  | "LOGIN" | "SIGNUP" | "LOGOUT"
  | "WALLET_CREATE" | "WALLET_DELETE" | "WALLET_IMPORT" | "WALLET_EXPORT"
  | "WALLET_FREEZE" | "WALLET_UNFREEZE" | "WALLET_ROTATE" | "WALLET_SIGN_MESSAGE"
  | "ACCOUNT_CREATE"
  | "TX_SIGN" | "TX_BROADCAST" | "TX_CONFIRMED" | "TX_FAILED"
  | "TX_SIMULATE" | "TX_CANCEL" | "TX_REPLACE" | "TX_RETRY"
  | "POLICY_CREATE" | "POLICY_DELETE" | "POLICY_EVAL" | "POLICY_DENY"
  | "AGENT_CREATE" | "AGENT_DELETE"
  | "API_KEY_CREATE" | "API_KEY_DELETE"
  | "SESSION_CREATE" | "SESSION_REFRESH"
  | "WEBHOOK_CREATE" | "WEBHOOK_DELETE"
  | "ORG_CREATE" | "ORG_UPDATE" | "USER_CREATE" | "USER_UPDATE" | "USER_DELETE"
  | "SPENDING_LIMIT_CREATE" | "SPENDING_LIMIT_UPDATE" | "SPENDING_LIMIT_DELETE"
  | "CHAIN_ADD" | "CHAIN_REMOVE"
  | "APPROVAL_REQUEST" | "APPROVAL_GRANT" | "APPROVAL_REJECT";

export async function createAuditLog(
  orgId: string,
  action: AuditAction,
  details?: Record<string, unknown>,
  userId?: string,
  request?: FastifyRequest
) {
  try {
    await prisma.auditLog.create({
      data: {
        orgId,
        userId: userId || null,
        action,
        resource: details?.resourceId as string | undefined,
        details: (details || {}) as any,
        ip: request?.ip || undefined,
        userAgent: request?.headers?.["user-agent"] || undefined,
      },
    });
  } catch (err) {
    console.error("Failed to create audit log:", err);
  }
}
