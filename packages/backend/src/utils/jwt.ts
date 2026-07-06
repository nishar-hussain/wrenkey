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
