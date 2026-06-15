// Triggering a restart to reload environment variables
import { buildApp } from "./app.js";
import { connectRedis } from "./redis.js";
import { config } from "./config.js";
import { registerWebSocketGateway } from "./services/websocket.js";

async function start() {
  const app = await buildApp();

  try {
    await connectRedis();
  } catch (err) {
    app.log.warn("Redis not available, continuing without cache");
  }

  try {
    await app.listen({ port: config.port, host: config.host });
    registerWebSocketGateway(app);
    console.log(`WranKey API server running at http://${config.host}:${config.port}`);
    console.log(`Health: http://${config.host}:${config.port}/health`);
    console.log(`API:    http://${config.host}:${config.port}/api/v1`);
    console.log(`WS:     ws://${config.host}:${config.port}/ws`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
