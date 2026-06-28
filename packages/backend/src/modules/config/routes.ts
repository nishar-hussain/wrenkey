import { FastifyInstance } from "fastify";
import { randomUUID } from "crypto";
import prisma from "../../db.js";
import { authMiddleware } from "../../middleware/auth.js";
import { sendSuccess, sendError } from "../../utils/errors.js";
import { createAuditLog } from "../../utils/audit.js";

const DEFAULT_CONFIG = {
  authProxyEnabled: false,
  sessionExpiry: 900,
  allowedOrigins: "",
  otpEnabled: true,
  otpLength: 6,
  otpType: "alphanumeric",
  otpEmail: true,
  otpSms: false,
  appName: "",
  appLogo: "",
  requireTokenLookup: false,
  socialOAuth: true,
  googleLogin: true,
  appleLogin: false,
  xLogin: false,
  discordLogin: false,
  redirectUrl: "https://example.com/auth/callback",
  passkeyAuth: true,
  walletAuth: true,
  oauthCredentials: [] as Array<{ provider: string; clientId: string; clientSecret: string; credentialId: string }>,
  onRampProviders: [] as Array<{ provider: string; publishableKey: string; secretKey: string; projectId: string; privateKey: string; environment: string; credentialId: string }>,
};

export async function configRoutes(app: FastifyInstance) {
  app.get("/configuration", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      let cfg = await prisma.orgConfig.findUnique({ where: { orgId: request.orgId } });
      if (!cfg) {
        const configId = randomUUID();
        cfg = await prisma.orgConfig.create({
          data: { orgId: request.orgId, config: { ...DEFAULT_CONFIG, configId } },
        });
      }
      const merged = { ...DEFAULT_CONFIG, ...(cfg.config as any) };
      // Ensure configId exists
      if (!merged.configId) {
        merged.configId = randomUUID();
        await prisma.orgConfig.update({
          where: { orgId: request.orgId },
          data: { config: merged },
        });
      }
      return sendSuccess(reply, merged);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.patch("/configuration", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const body = request.body as Record<string, any> || {};
      let cfg = await prisma.orgConfig.findUnique({ where: { orgId: request.orgId } });
      const current = cfg ? { ...DEFAULT_CONFIG, ...(cfg.config as any), ...body } : { ...DEFAULT_CONFIG, ...body };

      const updated = await prisma.orgConfig.upsert({
        where: { orgId: request.orgId },
        update: { config: current },
        create: { orgId: request.orgId, config: current },
      });

      await createAuditLog(request.orgId, "CONFIG_UPDATE", { keys: Object.keys(body) }, request.userId, request);
      return sendSuccess(reply, current);
    } catch (err) {
      return sendError(reply, err);
    }
  });
}
