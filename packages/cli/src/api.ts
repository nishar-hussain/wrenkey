/**
 * WVC CLI API client — thin wrapper around fetch for the WranKey backend /wvc/* endpoints.
 */

import fs from "fs";
import path from "path";
import os from "os";

const CONFIG_DIR = path.join(os.homedir(), ".wvc");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

export interface WvcConfig {
  apiBase: string;
  token?: string;
  apiKey?: string;
  operatorId?: string;
}

export function loadConfig(): WvcConfig {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return { apiBase: "http://localhost:3001" };
  }
}

export function saveConfig(cfg: WvcConfig): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), { mode: 0o600 });
}

export interface ApiOptions {
  method?: string;
  body?: unknown;
}

export async function api<T = any>(endpoint: string, opts: ApiOptions = {}): Promise<T> {
  const cfg = loadConfig();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cfg.token) headers["Authorization"] = `Bearer ${cfg.token}`;
  if (cfg.apiKey) headers["X-Api-Key"] = cfg.apiKey;

  const res = await fetch(`${cfg.apiBase}/api/v1${endpoint}`, {
    method: opts.method || "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  const data = await res.json().catch(() => ({ error: { message: res.statusText } }));
  if (!res.ok) {
    const msg = (data as any)?.error?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data as T;
}
