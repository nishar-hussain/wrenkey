import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { config } from "./config.js";
import { AppError } from "./utils/errors.js";
import prisma from "./db.js";
import { authMiddleware } from "./middleware/auth.js";
import { securityHeaders } from "./middleware/security.js";
import { authRoutes } from "./modules/auth/routes.js";
import { orgRoutes } from "./modules/org/routes.js";
import { walletRoutes } from "./modules/wallet/routes.js";
import { policyRoutes } from "./modules/policy/routes.js";
import { transactionRoutes } from "./modules/transaction/routes.js";
import { agentRoutes } from "./modules/agent/routes.js";
import { webhookRoutes } from "./modules/webhook/routes.js";
import { chainRoutes } from "./modules/chain/routes.js";
import { spendingLimitRoutes } from "./modules/spending-limit/routes.js";
import { approvalRoutes } from "./modules/approval/routes.js";
import { tagRoutes } from "./modules/tag/routes.js";
import { configRoutes } from "./modules/config/routes.js";
import { billingRoutes } from "./modules/billing/routes.js";
import { subOrgRoutes } from "./modules/sub-org/routes.js";
import { contractInterfaceRoutes } from "./modules/contract-interface/routes.js";
import { privateKeyRoutes } from "./modules/private-key/routes.js";

export async function buildApp(opts: { disableRateLimit?: boolean } = {}) {
  const app = Fastify({ logger: false, bodyLimit: 1048576 });

  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin || config.corsOrigin.includes(origin)) {
        cb(null, true);
      } else {
        cb(new Error("Not allowed by CORS"), false);
      }
    },
    credentials: true,
  });
  await app.register(cookie);

  if (!opts.disableRateLimit) {
    await app.register(rateLimit, { max: 1000, timeWindow: "1 minute" });
  }

  await app.register(securityHeaders);

  await app.register(swagger, {
    openapi: {
      info: { title: "WranKey API", description: "AI-Native Wallet & Agent Platform on Arc", version: "0.1.0" },
      servers: [{ url: "http://localhost:3001" }],
      components: {
        securitySchemes: {
          bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
          apiKey: { type: "apiKey", in: "header", name: "X-Api-Key" },
        },
      },
    },
  });

  await app.register(swaggerUi, { routePrefix: "/docs", uiConfig: { docExpansion: "list", deepLinking: true } });

  app.setErrorHandler((error: any, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({ error: { code: error.code, message: error.message } });
    }
    if (error.validation) {
      return reply.status(400).send({ error: { code: "VALIDATION_ERROR", message: error.message } });
    }
    console.error("Unhandled error:", error);
    const message = config.isDev ? (error?.message || "Internal server error") : "Internal server error";
    return reply.status(500).send({ error: { code: "INTERNAL_ERROR", message } });
  });

  app.get("/health", async () => ({
    status: "ok", timestamp: new Date().toISOString(), version: "0.1.0", service: "WranKey",
  }));

  app.get("/health/services", async () => {
    const dbOk = await (async () => {
      try { await prisma.$queryRaw`SELECT 1`; return true; } catch { return false; }
    })();

    let redisOk = false;
    try {
      const { getRedis } = await import("./redis.js");
      const r = getRedis();
      redisOk = (await r.ping()) === "PONG";
    } catch { redisOk = false; }

    let rpcOk = false;
    try {
      const { ethers } = await import("ethers");
      const provider = new ethers.JsonRpcProvider(config.defaultRpcUrl);
      await provider.getBlockNumber();
      rpcOk = true;
    } catch { rpcOk = false; }

    return {
      status: dbOk && redisOk ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      services: {
        database: dbOk ? "operational" : "unavailable",
        redis: redisOk ? "operational" : "unavailable",
        blockchain: rpcOk ? "operational" : "unavailable",
      },
    };
  });

  // Auth middleware for protected routes
  const publicPaths = [
    "/health", "/api/v1/health", "/docs",
    "/health/services",
    "/api/v1/auth/config",
    "/api/v1/auth/email/send", "/api/v1/auth/email/verify", "/api/v1/auth/email/lookup",
    "/api/v1/auth/oauth", "/api/v1/auth/wallet",
    "/api/v1/auth/webauthn/register", "/api/v1/auth/webauthn/register/verify",
    "/api/v1/auth/webauthn/authenticate", "/api/v1/auth/webauthn/authenticate/verify",
    "/api/v1/auth/password/signup", "/api/v1/auth/password/login",
    "/api/v1/auth/password/reset", "/api/v1/auth/password/reset/confirm",
    "/api/v1/auth/phone/send", "/api/v1/auth/phone/verify",
    "/api/v1/auth/signup/initiate", "/api/v1/auth/signup/verify",
    "/api/v1/auth/signup/register-options", "/api/v1/auth/signup/confirm",
  ];

  app.addHook("onRequest", async (request, reply) => {
    // Skip OPTIONS (CORS preflight) and non-API routes
    if (request.method === "OPTIONS") return;
    if (!request.url.startsWith("/api/v1/") || publicPaths.includes(request.url)) return;
    // Allow invitation endpoints without auth
    if (request.url.startsWith("/api/v1/auth/invitation/")) return;
    try {
      await authMiddleware(request, reply);
    } catch (err) {
      reply.send(err);
    }
  });

  await app.register(async (api) => {
    await api.register(authRoutes);
    await api.register(orgRoutes);
    await api.register(walletRoutes);
    await api.register(policyRoutes);
    await api.register(transactionRoutes);
    await api.register(agentRoutes);
    await api.register(webhookRoutes);
    await api.register(chainRoutes);
    await api.register(spendingLimitRoutes);
    await api.register(approvalRoutes);
    await api.register(tagRoutes);
    await api.register(configRoutes);
    await api.register(billingRoutes);
    await api.register(subOrgRoutes);
    await api.register(contractInterfaceRoutes);
    await api.register(privateKeyRoutes);
  }, { prefix: "/api/v1" });

  return app;
}
