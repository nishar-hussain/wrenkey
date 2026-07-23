import type { FastifyRequest, FastifyReply } from "fastify";
import prisma from "../db.js";

declare module "fastify" {
  interface FastifyRequest {
    authProxyOrgId?: string;
    authProxyConfig?: Record<string, any>;
  }
}

export async function authProxyMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const configId = request.headers["x-auth-proxy-config-id"] as string | undefined;
  if (!configId || typeof configId !== "string") {
    reply.status(400).send({ error: { message: "Missing X-Auth-Proxy-Config-Id header" } });
    return;
  }

  let orgConfigRow;
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ org_id: string; config: any }>>(
      `SELECT org_id, config FROM org_configs WHERE config->>'configId' = $1 LIMIT 1`,
      configId,
    );
    orgConfigRow = rows[0];
  } catch {
    reply.status(500).send({ error: { message: "Failed to look up organization" } });
    return;
  }

  if (!orgConfigRow) {
    reply.status(400).send({ error: { message: "Invalid config ID" } });
    return;
  }

  const cfg = typeof orgConfigRow.config === "string"
    ? JSON.parse(orgConfigRow.config)
    : orgConfigRow.config;

  if (!cfg.authProxyEnabled) {
    reply.status(403).send({ error: { message: "Auth proxy is disabled for this organization" } });
    return;
  }

  // CORS / Origin validation
  const rawOrigins = (cfg.allowedOrigins || "").toString();
  const allowed = rawOrigins
    .split(/,|\n/)
    .map((s: string) => s.trim())
    .filter((s: string) => s.length > 0);

  if (allowed.length > 0 && !allowed.includes("*")) {
    const origin = request.headers.origin as string | undefined;
    if (!origin || !allowed.includes(origin)) {
      reply.status(403).send({
        error: { message: `Origin "${origin || "none"}" is not allowed` },
      });
      return;
    }
  }

  request.authProxyOrgId = orgConfigRow.org_id;
  request.authProxyConfig = cfg;
}
