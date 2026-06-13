import { FastifyRequest, FastifyReply } from "fastify";
import { verifyToken, JwtPayload } from "../utils/jwt.js";
import { UnauthorizedError, ForbiddenError } from "../utils/errors.js";
import prisma from "../db.js";
import { hashSha256 } from "../utils/crypto.js";

declare module "fastify" {
  interface FastifyRequest {
    auth: JwtPayload;
    userId?: string;
    orgId: string;
    permissions?: string[];
  }
}

// Map URL prefix patterns to required scopes
const SCOPE_MAP: Array<{ pattern: RegExp; methods: string[]; scope: string }> = [
  { pattern: /^\/api\/v1\/wallets/, methods: ["POST"], scope: "wallet:create" },
  { pattern: /^\/api\/v1\/wallets/, methods: ["GET"], scope: "wallet:read" },
  { pattern: /^\/api\/v1\/wallets/, methods: ["DELETE", "PATCH"], scope: "wallet:write" },
  { pattern: /^\/api\/v1\/transactions\/sign/, methods: ["POST"], scope: "wallet:sign" },
  { pattern: /^\/api\/v1\/transactions/, methods: ["GET"], scope: "transaction:read" },
  { pattern: /^\/api\/v1\/policies/, methods: ["POST", "PATCH", "DELETE"], scope: "policy:write" },
  { pattern: /^\/api\/v1\/policies/, methods: ["GET"], scope: "policy:read" },
  { pattern: /^\/api\/v1\/agents/, methods: ["POST", "DELETE"], scope: "agent:write" },
  { pattern: /^\/api\/v1\/agents/, methods: ["GET"], scope: "agent:read" },
  { pattern: /^\/api\/v1\/webhooks/, methods: ["POST", "DELETE", "PATCH"], scope: "webhook:write" },
  { pattern: /^\/api\/v1\/webhooks/, methods: ["GET"], scope: "webhook:read" },
  { pattern: /^\/api\/v1\/users/, methods: ["POST", "PATCH", "DELETE"], scope: "user:write" },
  { pattern: /^\/api\/v1\/users/, methods: ["GET"], scope: "user:read" },
  { pattern: /^\/api\/v1\/orgs/, methods: ["GET", "POST"], scope: "org:read" },
  { pattern: /^\/api\/v1\/api-keys/, methods: ["GET"], scope: "apikey:read" },
  { pattern: /^\/api\/v1\/api-keys/, methods: ["POST", "DELETE"], scope: "apikey:write" },
  { pattern: /^\/api\/v1\/audit-logs/, methods: ["GET"], scope: "audit:read" },
];

function checkScope(permissions: string[], method: string, url: string): boolean {
  if (permissions.includes("*")) return true;
  for (const rule of SCOPE_MAP) {
    if (rule.pattern.test(url) && rule.methods.includes(method)) {
      if (permissions.includes(rule.scope)) return true;
      return false;
    }
  }
  // If no scope mapping matches, deny by default (secure)
  return false;
}

export async function authMiddleware(request: FastifyRequest, _reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  const apiKeyHeader = request.headers["x-api-key"] as string | undefined;

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    try {
      const payload = verifyToken(token);

      // Check session exists in DB and is not expired
      const session = await prisma.session.findFirst({
        where: { token, expiresAt: { gt: new Date() } },
      });
      if (!session) {
        throw new UnauthorizedError("Session expired or revoked");
      }

      request.auth = payload;
      request.userId = payload.sub;
      request.orgId = payload.orgId;
      return;
    } catch (err: any) {
      if (err instanceof UnauthorizedError) throw err;
      throw new UnauthorizedError("Invalid or expired session token");
    }
  }

  if (apiKeyHeader) {
    const keyHash = hashSha256(apiKeyHeader);
    const apiKey = await prisma.apiKey.findFirst({
      where: {
        keyHash,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
    });
    if (!apiKey) {
      throw new UnauthorizedError("Invalid API key");
    }

    // Check IP restrictions
    if (apiKey.allowedIps && apiKey.allowedIps.length > 0) {
      const clientIp = request.ip;
      if (!apiKey.allowedIps.includes(clientIp)) {
        throw new ForbiddenError("IP not allowed for this API key");
      }
    }

    // Enforce API key permissions
    const url = request.url;
    const method = request.method;
    if (!checkScope(apiKey.permissions, method, url)) {
      throw new ForbiddenError(`API key lacks permission for ${method} ${url}`);
    }

    request.auth = {
      sub: apiKey.id,
      orgId: apiKey.orgId,
      role: "API_KEY",
      type: "api_key",
    };
    request.orgId = apiKey.orgId;
    request.permissions = apiKey.permissions;
    return;
  }

  throw new UnauthorizedError("Authentication required");
}

export async function adminMiddleware(request: FastifyRequest, _reply: FastifyReply) {
  if (request.auth.role !== "ORG_ADMIN") {
    throw new ForbiddenError("Admin access required");
  }
}
