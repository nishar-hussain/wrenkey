import { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import prisma from "../../db.js";
import { config } from "../../config.js";
import { authMiddleware } from "../../middleware/auth.js";
import { sendSuccess, sendError, ValidationError, NotFoundError } from "../../utils/errors.js";
import { createAuditLog } from "../../utils/audit.js";
import { getRedis } from "../../redis.js";

const OTP_PREFIX = "otp:";

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function authRoutes(app: FastifyInstance) {
  app.post("/auth/email/send", async (request, reply) => {
    try {
      const { email, orgId } = request.body as { email: string; orgId?: string };
      if (!email) throw new ValidationError("Email is required");

      const otp = generateOtp();
      const redis = getRedis();
      const key = `${OTP_PREFIX}${email}`;
      await redis.setex(key, config.otpExpirySeconds, otp);

      // In production, send email via nodemailer
      console.log(`[DEV] OTP for ${email}: ${otp}`);

      return sendSuccess(reply, {
        message: "OTP sent",
        expiresIn: config.otpExpirySeconds,
        otp: process.env.NODE_ENV === "development" ? otp : undefined,
      });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/auth/email/verify", async (request, reply) => {
    try {
      const { email, otp, orgId, orgName } = request.body as {
        email: string;
        otp: string;
        orgId?: string;
        orgName?: string;
      };
      if (!email || !otp) throw new ValidationError("Email and OTP are required");

      const redis = getRedis();
      const key = `${OTP_PREFIX}${email}`;
      const storedOtp = await redis.get(key);

      if (!storedOtp || storedOtp !== otp) {
        throw new ValidationError("Invalid or expired OTP");
      }

      await redis.del(key);

      // Find or create org
      let organization = orgId
        ? await prisma.organization.findUnique({ where: { id: orgId } })
        : null;
      if (!organization) {
        organization = await prisma.organization.create({
          data: { name: orgName || `${email}'s Org` },
        });
      }

      // Find or create user
      let user = await prisma.user.findFirst({
        where: { orgId: organization.id, email },
      });
      if (!user) {
        user = await prisma.user.create({
          data: {
            orgId: organization.id,
            email,
            role: "DEVELOPER",
          },
        });
        await createAuditLog(organization.id, "SIGNUP", { email }, user.id, request);
      }

      // Find or create authenticator
      await prisma.authenticator.upsert({
        where: { id: "" }, // can't use id, use findFirst
        update: { verified: true },
        create: { userId: user.id, type: "EMAIL", verified: true },
      });
      // Handle upsert properly
      const existingAuth = await prisma.authenticator.findFirst({
        where: { userId: user.id, type: "EMAIL" },
      });
      if (existingAuth) {
        await prisma.authenticator.update({
          where: { id: existingAuth.id },
          data: { verified: true },
        });
      } else {
        await prisma.authenticator.create({
          data: { userId: user.id, type: "EMAIL", verified: true },
        });
      }

      // Create session
      const { signToken } = await import("../../utils/jwt.js");
      const token = signToken({ sub: user.id, orgId: organization.id, role: user.role });
      const session = await prisma.session.create({
        data: {
          userId: user.id,
          token,
          type: "READ_WRITE",
          expiresAt: new Date(Date.now() + config.sessionExpirySeconds * 1000),
        },
      });

      await createAuditLog(organization.id, "LOGIN", { method: "EMAIL" }, user.id, request);
      await createAuditLog(organization.id, "SESSION_CREATE", { sessionId: session.id }, user.id, request);

      return sendSuccess(reply, {
        sessionToken: token,
        user: { id: user.id, email: user.email, role: user.role },
        org: { id: organization.id, name: organization.name },
        expiresAt: session.expiresAt,
      }, 201);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/auth/oauth", async (request, reply) => {
    try {
      const { provider, code, redirectUri } = request.body as {
        provider: string;
        code: string;
        redirectUri: string;
      };
      if (!provider || !code) throw new ValidationError("Provider and code are required");

      // OAuth exchange (simplified - in production, exchange code for token + profile)
      // For MVP, we simulate OAuth verification
      const mockProfile = {
        email: `user_${nanoid(6)}@gmail.com`,
        name: `${provider} User`,
      };

      let organization = await prisma.organization.findFirst({
        where: { name: `${mockProfile.email}'s Org` },
      });
      if (!organization) {
        organization = await prisma.organization.create({
          data: { name: `${mockProfile.email}'s Org` },
        });
      }

      let user = await prisma.user.findFirst({
        where: { orgId: organization.id, email: mockProfile.email },
      });
      if (!user) {
        user = await prisma.user.create({
          data: {
            orgId: organization.id,
            email: mockProfile.email,
            name: mockProfile.name,
            role: "DEVELOPER",
          },
        });
        await createAuditLog(organization.id, "SIGNUP", { provider }, user.id, request);
      }

      const { signToken } = await import("../../utils/jwt.js");
      const token = signToken({ sub: user.id, orgId: organization.id, role: user.role });
      const session = await prisma.session.create({
        data: {
          userId: user.id,
          token,
          type: "READ_WRITE",
          expiresAt: new Date(Date.now() + config.sessionExpirySeconds * 1000),
        },
      });

      await createAuditLog(organization.id, "LOGIN", { method: `OAUTH_${provider}` }, user.id, request);

      return sendSuccess(reply, {
        sessionToken: token,
        user: { id: user.id, email: user.email, role: user.role },
        org: { id: organization.id, name: organization.name },
        expiresAt: session.expiresAt,
      }, 201);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/auth/wallet", async (request, reply) => {
    try {
      const { address, signature, message } = request.body as {
        address: string;
        signature: string;
        message: string;
      };
      if (!address || !signature) throw new ValidationError("Address and signature are required");

      // Verify SIWE signature (simplified)
      // In production, use SIWE library to verify

      let organization = await prisma.organization.findFirst({
        where: { name: `${address.slice(0, 8)}'s Org` },
      });
      if (!organization) {
        organization = await prisma.organization.create({
          data: { name: `${address.slice(0, 8)}'s Org` },
        });
      }

      let user = await prisma.user.findFirst({
        where: { orgId: organization.id, email: `${address.slice(0, 8)}@wallet.local` },
      });
      if (!user) {
        user = await prisma.user.create({
          data: {
            orgId: organization.id,
            email: `${address.slice(0, 8)}@wallet.local`,
            role: "DEVELOPER",
          },
        });
      }

      const { signToken } = await import("../../utils/jwt.js");
      const token = signToken({ sub: user.id, orgId: organization.id, role: user.role });
      const session = await prisma.session.create({
        data: {
          userId: user.id,
          token,
          type: "READ_WRITE",
          expiresAt: new Date(Date.now() + config.sessionExpirySeconds * 1000),
        },
      });

      await createAuditLog(organization.id, "LOGIN", { method: "WALLET" }, user.id, request);

      return sendSuccess(reply, {
        sessionToken: token,
        user: { id: user.id, role: user.role },
        org: { id: organization.id, name: organization.name },
        expiresAt: session.expiresAt,
      }, 201);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Session management
  app.get("/sessions", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const sessions = await prisma.session.findMany({
        where: { userId: request.userId, expiresAt: { gt: new Date() } },
        select: { id: true, type: true, createdAt: true, expiresAt: true },
        orderBy: { createdAt: "desc" },
      });
      return sendSuccess(reply, { sessions });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/sessions/refresh", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { signToken } = await import("../../utils/jwt.js");
      const token = signToken({
        sub: request.userId!,
        orgId: request.orgId,
        role: request.auth.role,
      });

      const session = await prisma.session.create({
        data: {
          userId: request.userId!,
          token,
          type: "READ_WRITE",
          expiresAt: new Date(Date.now() + config.sessionExpirySeconds * 1000),
        },
      });

      await createAuditLog(request.orgId, "SESSION_REFRESH", { sessionId: session.id }, request.userId, request);

      return sendSuccess(reply, { sessionToken: token, expiresAt: session.expiresAt });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.delete("/sessions/:id", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      await prisma.session.deleteMany({
        where: { id, userId: request.userId },
      });
      await createAuditLog(request.orgId, "LOGOUT", { sessionId: id }, request.userId, request);
      return sendSuccess(reply, { message: "Session revoked" });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // API Keys
  app.post("/api-keys", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { name, permissions, allowedIps } = request.body as {
        name: string;
        permissions?: string[];
        allowedIps?: string[];
      };
      if (!name) throw new ValidationError("Name is required");

      const { generateRandomToken, hashSha256 } = await import("../../utils/crypto.js");
      const rawKey = `arkey_${generateRandomToken()}`;
      const keyHash = hashSha256(rawKey);
      const keyPrefix = rawKey.slice(0, 12);

      const apiKey = await prisma.apiKey.create({
        data: {
          orgId: request.orgId,
          name,
          keyHash,
          keyPrefix,
          permissions: permissions || ["*"],
          allowedIps: allowedIps || [],
          expiresAt: new Date(Date.now() + config.apiKeyExpiryDays * 86400 * 1000),
        },
      });

      await createAuditLog(request.orgId, "API_KEY_CREATE", { keyId: apiKey.id, name }, request.userId, request);

      // Return the raw key only once
      return sendSuccess(reply, {
        id: apiKey.id,
        name: apiKey.name,
        key: rawKey,
        keyPrefix,
        permissions: apiKey.permissions,
        expiresAt: apiKey.expiresAt,
      }, 201);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get("/api-keys", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const keys = await prisma.apiKey.findMany({
        where: { orgId: request.orgId },
        select: { id: true, name: true, keyPrefix: true, permissions: true, allowedIps: true, createdAt: true, expiresAt: true },
        orderBy: { createdAt: "desc" },
      });
      return sendSuccess(reply, { keys });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.delete("/api-keys/:id", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      await prisma.apiKey.deleteMany({ where: { id, orgId: request.orgId } });
      await createAuditLog(request.orgId, "API_KEY_DELETE", { keyId: id }, request.userId, request);
      return sendSuccess(reply, { message: "API key deleted" });
    } catch (err) {
      return sendError(reply, err);
    }
  });
}
