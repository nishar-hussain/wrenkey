import jwt from "jsonwebtoken";
import { config } from "../config.js";

export interface JwtPayload {
  sub: string;
  orgId: string;
  role: string;
  type: "session" | "api_key";
}

export function signToken(payload: Omit<JwtPayload, "type"> & { type?: string }): string {
  return jwt.sign({ ...payload, type: payload.type || "session" }, config.jwtSecret, {
    expiresIn: config.sessionExpirySeconds,
  });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, config.jwtSecret) as JwtPayload;
}

export function signApiKeyToken(orgId: string, keyId: string, permissions: string[]): string {
  return jwt.sign(
    { sub: keyId, orgId, role: "API_KEY", type: "api_key", permissions },
    config.jwtSecret,
    { expiresIn: config.apiKeyExpiryDays * 86400 }
  );
}
