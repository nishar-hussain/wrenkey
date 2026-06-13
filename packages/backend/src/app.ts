import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { config } from "./config.js";
import { AppError } from "./utils/errors.js";
import { authMiddleware } from "./middleware/auth.js";
import { securityHeaders } from "./middleware/security.js";
import { authRoutes } from "./modules/auth/routes.js";
import { orgRoutes } from "./modules/org/routes.js";
import { walletRoutes } from "./modules/wallet/routes.js";
import { policyRoutes } from "./modules/policy/routes.js";
import { transactionRoutes } from "./modules/transaction/routes.js";
import { agentRoutes } from "./modules/agent/routes.js";
import { webhookRoutes } from "./modules/webhook/routes.js";

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
    return reply.status(500).send({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
  });

  app.get("/health", async () => ({
    status: "ok", timestamp: new Date().toISOString(), version: "0.1.0", service: "WranKey",
  }));

  // Auth middleware for protected routes
  const publicPaths = [
    "/health", "/api/v1/health", "/docs",
    "/api/v1/auth/email/send", "/api/v1/auth/email/verify",
    "/api/v1/auth/oauth", "/api/v1/auth/wallet",
    "/api/v1/auth/webauthn/register", "/api/v1/auth/webauthn/register/verify",
    "/api/v1/auth/webauthn/authenticate", "/api/v1/auth/webauthn/authenticate/verify",
    "/api/v1/auth/password/signup", "/api/v1/auth/password/login",
    "/api/v1/auth/phone/send", "/api/v1/auth/phone/verify",
  ];

  app.addHook("onRequest", async (request, reply) => {
    if (!request.url.startsWith("/api/v1/") || publicPaths.includes(request.url)) return;
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
  }, { prefix: "/api/v1" });

  return app;
}
