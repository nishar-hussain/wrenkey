import prisma from "../db.js";
import { FastifyRequest } from "fastify";

export type AuditAction =
  | "LOGIN"
  | "SIGNUP"
  | "LOGOUT"
  | "WALLET_CREATE"
  | "WALLET_DELETE"
  | "WALLET_IMPORT"
  | "WALLET_EXPORT"
  | "ACCOUNT_CREATE"
  | "TX_SIGN"
  | "TX_BROADCAST"
  | "TX_CONFIRMED"
  | "TX_FAILED"
  | "POLICY_CREATE"
  | "POLICY_DELETE"
  | "POLICY_EVAL"
  | "POLICY_DENY"
  | "AGENT_CREATE"
  | "AGENT_DELETE"
  | "API_KEY_CREATE"
  | "API_KEY_DELETE"
  | "SESSION_CREATE"
  | "SESSION_REFRESH"
  | "WEBHOOK_CREATE"
  | "WEBHOOK_DELETE"
  | "ORG_CREATE"
  | "USER_CREATE"
  | "USER_UPDATE"
  | "USER_DELETE";

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
        userAgent: request?.headers["user-agent"] || undefined,
      },
    });
  } catch (err) {
    console.error("Failed to create audit log:", err);
  }
}
