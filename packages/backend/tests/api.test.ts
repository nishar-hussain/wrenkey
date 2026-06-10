import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../../src/app";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp({ disableRateLimit: true });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe("API Integration", () => {
  it("GET /health returns ok", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe("ok");
    expect(body.service).toBe("WranKey");
  });

  it("POST /api/v1/auth/email/send returns 400 without email", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/email/send",
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST /api/v1/auth/email/verify returns 400 without email and otp", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/email/verify",
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST /api/v1/auth/password/signup validates password length", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/password/signup",
      payload: { email: "test@test.com", password: "short" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("protected endpoints return 401 without auth", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/wallets",
    });
    expect(res.statusCode).toBe(401);
  });

  it("protected endpoints return 401 with invalid token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/wallets",
      headers: { authorization: "Bearer invalid-token" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("unknown route returns proper error", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/nonexistent",
    });
    expect(res.statusCode).toBe(401); // Falls through to auth middleware
  });
});
