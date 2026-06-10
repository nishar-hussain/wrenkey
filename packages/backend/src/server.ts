import { buildApp } from "./app.js";
import { connectRedis } from "./redis.js";
import { config } from "./config.js";

async function start() {
  const app = await buildApp();

  try {
    await connectRedis();
  } catch (err) {
    app.log.warn("Redis not available, continuing without cache");
  }

  try {
    await app.listen({ port: config.port, host: config.host });
    console.log(`\n🚀 WranKey API server running at http://${config.host}:${config.port}`);
    console.log(`   Health check: http://${config.host}:${config.port}/health`);
    console.log(`   API base:     http://${config.host}:${config.port}/api/v1\n`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
