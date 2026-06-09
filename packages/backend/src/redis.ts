import IORedis from "ioredis";
import { config } from "./config.js";

let redis: IORedis | null = null;

export function getRedis(): IORedis {
  if (!redis) {
    redis = new IORedis(config.redisUrl, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
  }
  return redis;
}

export async function connectRedis(): Promise<void> {
  const r = getRedis();
  try {
    await r.connect();
    console.log("Redis connected");
  } catch (err) {
    console.warn("Redis connection failed, running without cache:", (err as Error).message);
  }
}
