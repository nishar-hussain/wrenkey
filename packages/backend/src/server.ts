import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import { config } from "./config.js";
import { connectRedis } from "./redis.js";
import { authMiddleware } from "./middleware/auth.js";
import { AppError } from "./utils/errors.js";
import { authRoutes } from "./modules/auth/routes.js";
import { orgRoutes } from "./modules/org/routes.js";
import { walletRoutes } from "./modules/wallet/routes.js";
import { policyRoutes } from "./modules/policy/routes.js";
import { transactionRoutes } from "./modules/transaction/routes.js";
import { agentRoutes } from "./modules/agent/routes.js";
import { webhookRoutes } from "./modules/webhook/routes.js";

const app = Fastify({
  logger: {
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "HH:MM:ss Z",
        ignore: "pid,hostname",
      },
    },
  },
});

async function start() {
  // Plugins
  await app.register(cors, {
    origin: config.corsOrigin,
    credentials: true,
  });

  await app.register(cookie);

  await app.register(rateLimit, {
    max: 1000,
    timeWindow: "1 minute",
  });

  // Global error handler
  app.setErrorHandler((error: any, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message },
      });
    }
    // Fastify validation errors
    if (error.validation) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: error.message },
      });
    }
    request.log.error(error);
    return reply.status(500).send({
      error: { code: "INTERNAL_ERROR", message: "Internal server error" },
    });
  });

  // Health check
  app.get("/health", async () => {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      version: "0.1.0",
      service: "ArKey",
    };
  });

  // Protected routes
  app.addHook("onRequest", async (request, reply) => {
    // Skip auth for public routes
    const publicPaths = [
      "/health",
      "/api/v1/health",
      "/api/v1/auth/email/send",
      "/api/v1/auth/email/verify",
      "/api/v1/auth/oauth",
      "/api/v1/auth/wallet",
    ];

    if (!request.url.startsWith("/api/v1/") || publicPaths.includes(request.url)) {
      return;
    }

    try {
      await authMiddleware(request, reply);
    } catch (err) {
      reply.send(err);
    }
  });

  // Register routes under API prefix
  await app.register(async (api) => {
    await api.register(authRoutes, { prefix: "/auth" });
    await api.register(orgRoutes);
    await api.register(walletRoutes);
    await api.register(policyRoutes);
    await api.register(transactionRoutes);
    await api.register(agentRoutes);
    await api.register(webhookRoutes);
  }, { prefix: "/api/v1" });

  // Connect services
  try {
    await connectRedis();
  } catch (err) {
    app.log.warn("Redis not available, continuing without cache");
  }

  // Start server
  try {
    await app.listen({ port: config.port, host: config.host });
    console.log(`\n🚀 ArKey API server running at http://${config.host}:${config.port}`);
    console.log(`   Health check: http://${config.host}:${config.port}/health`);
    console.log(`   API base:     http://${config.host}:${config.port}/api/v1\n`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
