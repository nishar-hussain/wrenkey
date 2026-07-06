import { FastifyInstance } from "fastify";
import { WebSocketServer, WebSocket } from "ws";
import { verifyToken } from "../utils/jwt.js";

const clients = new Map<string, Set<WebSocket>>();

export function registerWebSocketGateway(app: FastifyInstance) {
  const wss = new WebSocketServer({
    server: app.server,
    path: "/ws",
    verifyClient: (info: { req: { url?: string; headers: { host?: string } } }, cb: (res: boolean, code?: number, message?: string) => void) => {
      const url = new URL(info.req.url!, `http://${info.req.headers.host}`);
      const token = url.searchParams.get("token");
      if (!token) {
        cb(false, 401, "Authentication required");
        return;
      }
      try {
        const payload = verifyToken(token);
        (info.req as any).authPayload = payload;
        cb(true);
      } catch {
        cb(false, 401, "Invalid token");
      }
    },
  });

  wss.on("connection", (ws: WebSocket, req: any) => {
    const payload = req.authPayload;
    const orgId = payload.orgId;

    if (!clients.has(orgId)) {
      clients.set(orgId, new Set());
    }
    clients.get(orgId)!.add(ws);

    ws.send(JSON.stringify({ type: "connected", message: "Subscribed to transaction events" }));

    ws.on("close", () => {
      clients.get(orgId)?.delete(ws);
      if (clients.get(orgId)?.size === 0) {
        clients.delete(orgId);
      }
    });

    ws.on("message", (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === "ping") {
          ws.send(JSON.stringify({ type: "pong" }));
        }
      } catch {}
    });
  });
}

export function notifyOrg(orgId: string, event: string, data: unknown) {
  const orgClients = clients.get(orgId);
  if (!orgClients) return;

  const payload = JSON.stringify({ event, data, timestamp: new Date().toISOString() });

  for (const ws of orgClients) {
    if (ws.readyState === ws.OPEN) {
      try {
        ws.send(payload);
      } catch {}
    }
  }
}

export function notifyTransactionStatus(orgId: string, transactionId: string, status: string, txHash?: string) {
  notifyOrg(orgId, "transaction.status", { transactionId, status, txHash });
}
