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

export async function authMiddleware(request: FastifyRequest, _reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  const apiKeyHeader = request.headers["x-api-key"] as string | undefined;

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    try {
      const payload = verifyToken(token);
      request.auth = payload;
      request.userId = payload.sub;
      request.orgId = payload.orgId;
      return;
    } catch {
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

    if (apiKey.allowedIps && apiKey.allowedIps.length > 0) {
      const clientIp = request.ip;
      if (!apiKey.allowedIps.includes(clientIp)) {
        throw new ForbiddenError("IP not allowed for this API key");
      }
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
