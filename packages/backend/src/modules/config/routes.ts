import { FastifyInstance } from "fastify";
import { randomUUID } from "crypto";
import prisma from "../../db.js";
import { authMiddleware, adminMiddleware } from "../../middleware/auth.js";
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
  redirectUrl: "",
  passkeyAuth: true,
  walletAuth: true,
  oauthCredentials: [] as Array<{ provider: string; clientId: string; clientSecret: string; credentialId: string }>,
  onRampProviders: [] as Array<{ provider: string; publishableKey: string; secretKey: string; projectId: string; privateKey: string; environment: string; credentialId: string }>,
  rootQuorumMembers: [] as string[],
  rootQuorumThreshold: 1,
};

/** Redact sensitive fields (OAuth client secrets, on-ramp private keys) before returning to the client. */
function redactSecrets(config: any): any {
  const redacted = { ...config };
  if (Array.isArray(redacted.oauthCredentials)) {
    redacted.oauthCredentials = redacted.oauthCredentials.map((c: any) => ({
      ...c,
      clientSecret: c.clientSecret ? "***REDACTED***" : "",
    }));
  }
  if (Array.isArray(redacted.onRampProviders)) {
    redacted.onRampProviders = redacted.onRampProviders.map((p: any) => ({
      ...p,
      secretKey: p.secretKey ? "***REDACTED***" : "",
      privateKey: p.privateKey ? "***REDACTED***" : "",
    }));
  }
  return redacted;
}

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
      if (!merged.configId) {
        merged.configId = randomUUID();
        await prisma.orgConfig.update({
          where: { orgId: request.orgId },
          data: { config: merged },
        });
      }
      return sendSuccess(reply, redactSecrets(merged));
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.patch("/configuration", { preHandler: [authMiddleware, adminMiddleware] }, async (request, reply) => {
    try {
      const body = request.body as Record<string, any> || {};
      const cfg = await prisma.orgConfig.findUnique({ where: { orgId: request.orgId } });
      const current = cfg ? { ...DEFAULT_CONFIG, ...(cfg.config as any), ...body } : { ...DEFAULT_CONFIG, ...body };

      const updated = await prisma.orgConfig.upsert({
        where: { orgId: request.orgId },
        update: { config: current },
        create: { orgId: request.orgId, config: current },
      });

      await createAuditLog(request.orgId, "CONFIG_UPDATE", { keys: Object.keys(body) }, request.userId, request);
      return sendSuccess(reply, redactSecrets(current));
    } catch (err) {
      return sendError(reply, err);
    }
  });
}
