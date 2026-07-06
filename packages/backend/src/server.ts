import { buildApp } from "./app.js";
import { connectRedis, disconnectRedis } from "./redis.js";
import { config } from "./config.js";
import { registerWebSocketGateway } from "./services/websocket.js";
import { seedChains } from "./services/chain.js";
import { startTransactionMonitor, stopTransactionMonitor } from "./services/tx-monitor.js";
import { processPendingDeliveries } from "./modules/webhook/routes.js";

async function start() {
  const app = await buildApp();

  try {
    await connectRedis();
  } catch (err) {
    app.log.warn("Redis not available, continuing without cache");
  }

  try {
    await seedChains();
  } catch (err) {
    app.log.warn("Failed to seed chains, continuing anyway");
  }

  let webhookInterval: ReturnType<typeof setInterval> | null = null;

  try {
    await app.listen({ port: config.port, host: config.host });
    registerWebSocketGateway(app);

    startTransactionMonitor();
    webhookInterval = setInterval(processPendingDeliveries, 30000);

    console.log(`WranKey API server running at http://${config.host}:${config.port}`);
    console.log(`Health: http://${config.host}:${config.port}/health`);
    console.log(`API:    http://${config.host}:${config.port}/api/v1`);
    console.log(`WS:     ws://${config.host}:${config.port}/ws`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received — shutting down gracefully...`);
    try {
      if (webhookInterval) clearInterval(webhookInterval);
      stopTransactionMonitor();
      await app.close();
      await disconnectRedis();
      console.log("Shutdown complete.");
      process.exit(0);
    } catch (err) {
      console.error("Error during shutdown:", err);
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

start();
