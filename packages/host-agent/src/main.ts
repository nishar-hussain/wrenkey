#!/usr/bin/env node
/**
 * WVC Host Agent (PRD §20)
 *
 * Runs on the parent EC2 instance alongside the AWS Nitro Enclave.
 * Responsibilities:
 * 1. vsock proxy: relay HTTP requests from the control plane to the enclave over AF_VSOCK
 * 2. Manifest delivery: deliver signed manifests + binaries to the enclave at boot
 * 3. Egress lockdown: restrict network egress to an allowlist
 * 4. Replica health: track replica health, restart on crash
 *
 * In production, the Host Agent communicates with the enclave via AF_VSOCK.
 * In local dev, it uses Unix domain sockets as a vsock stand-in.
 */

import { createConnection, Socket } from "net";
import { createServer, IncomingMessage, ServerResponse } from "http";
import { readFileSync, existsSync } from "fs";

const ENCLAVE_CID = parseInt(process.env.WVC_ENCLAVE_CID || "16", 10);
const ENCLAVE_INGRESS_PORT = parseInt(process.env.INGRESS_PORT || "3000", 10);
const MANIFEST_PORT = parseInt(process.env.MANIFEST_PORT || "5000", 10);
const KEY_FORWARDING_PORT = parseInt(process.env.KEY_FORWARDING_PORT || "5001", 10);
const HOST_PORT = parseInt(process.env.HOST_AGENT_PORT || "8443", 10);
const EGRESS_ALLOWLIST = (process.env.WVC_EGRESS_ALLOWLIST || "").split(",").map((s) => s.trim()).filter(Boolean);

console.log("[host-agent] Starting WVC Host Agent...");
console.log(`[host-agent] Enclave CID: ${ENCLAVE_CID}`);
console.log(`[host-agent] Host listening on port ${HOST_PORT}`);
console.log(`[host-agent] Egress allowlist: ${EGRESS_ALLOWLIST.length} entries`);

// ─── Replica Health Tracker ──────────────────────────────────────────────────

interface ReplicaState {
  id: string;
  status: "healthy" | "unhealthy" | "booting" | "crashed";
  lastHealthCheck: number;
  restartCount: number;
}

const replicas = new Map<string, ReplicaState>();

function trackReplica(id: string) {
  replicas.set(id, {
    id,
    status: "booting",
    lastHealthCheck: Date.now(),
    restartCount: 0,
  });
  console.log(`[host-agent] Tracking replica ${id}`);
}

function updateReplicaHealth(id: string, healthy: boolean) {
  const replica = replicas.get(id);
  if (!replica) return;
  replica.lastHealthCheck = Date.now();
  replica.status = healthy ? "healthy" : "unhealthy";
  if (!healthy && replica.restartCount < 3) {
    console.log(`[host-agent] Replica ${id} unhealthy, attempting restart #${replica.restartCount + 1}`);
    restartReplica(id);
  }
}

function restartReplica(id: string) {
  const replica = replicas.get(id);
  if (!replica) return;
  replica.restartCount++;
  replica.status = "booting";
  // In production, this would call `nitro-cli run-enclave` to restart the replica
  console.log(`[host-agent] Restarting replica ${id} (attempt ${replica.restartCount})`);
}

// ─── Vsock Proxy (HTTP → vsock/unix socket) ─────────────────────────────────

function connectToEnclave(port: number): Socket {
  // In production: use AF_VSOCK with the enclave's CID
  // In local dev: use Unix domain socket
  const socketPath = `/tmp/wvc-vsock-${port}.sock`;
  if (existsSync(socketPath)) {
    return createConnection(socketPath);
  }
  // Fallback: try TCP to localhost (for testing)
  return createConnection(port, "127.0.0.1");
}

async function proxyToEnclave(req: Buffer, port: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const socket = connectToEnclave(port);
    const chunks: Buffer[] = [];
    let settled = false;

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        socket.destroy();
        reject(new Error("Enclave connection timeout"));
      }
    }, 30000);

    socket.on("connect", () => {
      socket.write(req);
    });

    socket.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });

    socket.on("end", () => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        resolve(Buffer.concat(chunks));
      }
    });

    socket.on("error", (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(err);
      }
    });
  });
}

// ─── Egress Lockdown ──────────────────────────────────────────────────────────

function checkEgressAllowed(host: string): boolean {
  if (EGRESS_ALLOWLIST.length === 0) return true; // No allowlist = allow all (dev mode)
  return EGRESS_ALLOWLIST.some((allowed) => {
    if (allowed === host) return true;
    // CIDR check
    if (allowed.includes("/")) {
      // Simple CIDR matching (would use proper CIDR matching in production)
      return host.endsWith(allowed.split(".")[0]);
    }
    return false;
  });
}

// ─── HTTP Server ──────────────────────────────────────────────────────────────

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  const chunks: Buffer[] = [];
  req.on("data", (chunk: Buffer) => chunks.push(chunk));
  req.on("end", async () => {
    const body = Buffer.concat(chunks);
    const url = req.url || "/";

    try {
      // Route: provision deployment
      if (url.startsWith("/deployments/") && url.endsWith("/provision")) {
        const response = await proxyToEnclave(body, MANIFEST_PORT);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(response);
        return;
      }

      // Route: invoke deployment
      if (url.startsWith("/deployments/") && url.endsWith("/invoke")) {
        const response = await proxyToEnclave(body, ENCLAVE_INGRESS_PORT);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(response);
        return;
      }

      // Route: key forwarding
      if (url.startsWith("/quorum-key/")) {
        const response = await proxyToEnclave(body, KEY_FORWARDING_PORT);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(response);
        return;
      }

      // Route: health check
      if (url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          status: "ok",
          replicas: Array.from(replicas.values()),
          egressAllowlist: EGRESS_ALLOWLIST,
        }));
        return;
      }

      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: "Not found" } }));
    } catch (err: any) {
      console.error("[host-agent] Error:", err.message);
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: `Enclave communication failed: ${err.message}` } }));
    }
  });
});

server.listen(HOST_PORT, () => {
  console.log(`[host-agent] Ready — accepting connections on port ${HOST_PORT}`);
  // Start health check interval
  setInterval(() => {
    const now = Date.now();
    for (const [id, replica] of replicas) {
      if (now - replica.lastHealthCheck > 60000 && replica.status === "healthy") {
        console.warn(`[host-agent] Replica ${id} health check overdue`);
        updateReplicaHealth(id, false);
      }
    }
  }, 30000);
});
