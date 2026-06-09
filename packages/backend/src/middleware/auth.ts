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
  }
}

export async function authMiddleware(request: FastifyRequest, reply: FastifyReply) {
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
      where: { keyHash, expiresAt: { gt: new Date() } },
    });
    if (!apiKey) {
      throw new UnauthorizedError("Invalid API key");
    }
    request.auth = {
      sub: apiKey.id,
      orgId: apiKey.orgId,
      role: "API_KEY",
      type: "api_key",
    };
    request.orgId = apiKey.orgId;
    return;
  }

  throw new UnauthorizedError("Authentication required");
}

export async function adminMiddleware(request: FastifyRequest, reply: FastifyReply) {
  if (request.auth.role !== "ORG_ADMIN") {
    throw new ForbiddenError("Admin access required");
  }
}
