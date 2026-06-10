import { FastifyInstance } from "fastify";
import bcrypt from "bcrypt";
import { createTransport } from "nodemailer";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import prisma from "../../db.js";
import { config } from "../../config.js";
import { sendSuccess, sendError, ValidationError, AppError } from "../../utils/errors.js";
import { createAuditLog } from "../../utils/audit.js";
import { getRedis } from "../../redis.js";
import { triggerWebhookEvents } from "../webhook/routes.js";
import { parsePagination } from "../../utils/pagination.js";
import { signToken } from "../../utils/jwt.js";
import { hashSha256, generateRandomToken } from "../../utils/crypto.js";

const OTP_PREFIX = "otp:";
const RATELIMIT_PREFIX = "ratelimit:otp:";
const RP_NAME = "WranKey";
const RP_ID = process.env.WEBAUTHN_RP_ID || "localhost";
const EXPECTED_ORIGIN = config.corsOrigin;
const OTP_RATE_LIMIT = 3;
const OTP_RATE_WINDOW = 300;

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function checkOtpRateLimit(redis: ReturnType<typeof getRedis>, keyType: string, identifier: string): Promise<void> {
  const rateLimitKey = `${RATELIMIT_PREFIX}${keyType}:${identifier}`;
  const attempts = await redis.incr(rateLimitKey);
  if (attempts === 1) await redis.expire(rateLimitKey, OTP_RATE_WINDOW);
  if (attempts > OTP_RATE_LIMIT) {
    throw new AppError(429, "Too many OTP requests. Try again in 5 minutes.", "RATE_LIMITED");
  }
}

async function findOrCreateOrg(name: string): Promise<{ id: string; name: string }> {
  let org = await prisma.organization.findFirst({ where: { name } });
  if (!org) {
    org = await prisma.organization.create({ data: { name } });
  }
  return org;
}

async function findOrCreateUser(orgId: string, email: string, role = "DEVELOPER") {
  let user = await prisma.user.findFirst({ where: { orgId, email } });
  if (!user) {
    user = await prisma.user.create({ data: { orgId, email, role } });
  }
  return user;
}

export async function authRoutes(app: FastifyInstance) {
  // Email OTP Send
  app.post("/auth/email/send", async (request, reply) => {
    try {
      const { email } = request.body as { email: string };
      if (!email) throw new ValidationError("Email is required");

      const redis = getRedis();
      await checkOtpRateLimit(redis, "email", email);

      const otp = generateOtp();
      await redis.setex(`${OTP_PREFIX}${email}`, config.otpExpirySeconds, otp);

      if (config.smtp.host && config.smtp.user) {
        const transporter = createTransport({
          host: config.smtp.host,
          port: config.smtp.port,
          auth: { user: config.smtp.user, pass: config.smtp.pass },
        });
        await transporter.sendMail({
          from: config.smtp.from,
          to: email,
          subject: "WranKey - Login Code",
          text: `Your code: ${otp}\nExpires in ${config.otpExpirySeconds}s.`,
        }).catch(() => {});
      }

      console.log(`[DEV] OTP for ${email}: ${otp}`);
      return sendSuccess(reply, {
        message: "OTP sent",
        expiresIn: config.otpExpirySeconds,
        otp: process.env.NODE_ENV === "development" ? otp : undefined,
      });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Email OTP Verify
  app.post("/auth/email/verify", async (request, reply) => {
    try {
      const { email, otp, orgName } = request.body as { email: string; otp: string; orgName?: string };
      if (!email || !otp) throw new ValidationError("Email and OTP required");

      const redis = getRedis();
      const storedOtp = await redis.get(`${OTP_PREFIX}${email}`);
      if (!storedOtp || storedOtp !== otp) throw new ValidationError("Invalid or expired OTP");
      await redis.del(`${OTP_PREFIX}${email}`);

      const org = await findOrCreateOrg(orgName || `${email}'s Org`);
      const user = await findOrCreateUser(org.id, email);
      const isNewUser = user.createdAt.getTime() === user.updatedAt.getTime();

      await prisma.authenticator.upsert({
        where: { id: (await prisma.authenticator.findFirst({ where: { userId: user.id, type: "EMAIL" } }))?.id || "" },
        update: { verified: true },
        create: { userId: user.id, type: "EMAIL", verified: true },
      });

      const token = signToken({ sub: user.id, orgId: org.id, role: user.role });
      const session = await prisma.session.create({
        data: {
          userId: user.id, token, type: "READ_WRITE",
          expiresAt: new Date(Date.now() + config.sessionExpirySeconds * 1000),
        },
      });

      if (isNewUser) {
        await createAuditLog(org.id, "SIGNUP", { email }, user.id, request);
        triggerWebhookEvents(org.id, "user.signup", { userId: user.id, email, method: "EMAIL" });
      }
      await createAuditLog(org.id, "LOGIN", { method: "EMAIL" }, user.id, request);
      triggerWebhookEvents(org.id, "user.login", { userId: user.id, email, method: "EMAIL" });

      return sendSuccess(reply, {
        sessionToken: token,
        user: { id: user.id, email: user.email, role: user.role },
        org: { id: org.id, name: org.name },
        expiresAt: session.expiresAt,
      }, 201);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Phone OTP Send
  app.post("/auth/phone/send", async (request, reply) => {
    try {
      const { phone } = request.body as { phone: string };
      if (!phone) throw new ValidationError("Phone number required");

      const redis = getRedis();
      await checkOtpRateLimit(redis, "phone", phone);

      const otp = generateOtp();
      await redis.setex(`${OTP_PREFIX}phone:${phone}`, config.otpExpirySeconds, otp);

      console.log(`[DEV] SMS OTP for ${phone}: ${otp}`);
      return sendSuccess(reply, { message: "OTP sent", expiresIn: config.otpExpirySeconds, otp: process.env.NODE_ENV === "development" ? otp : undefined });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Phone OTP Verify
  app.post("/auth/phone/verify", async (request, reply) => {
    try {
      const { phone, otp, orgName } = request.body as { phone: string; otp: string; orgName?: string };
      if (!phone || !otp) throw new ValidationError("Phone and OTP required");

      const redis = getRedis();
      const storedOtp = await redis.get(`${OTP_PREFIX}phone:${phone}`);
      if (!storedOtp || storedOtp !== otp) throw new ValidationError("Invalid or expired OTP");
      await redis.del(`${OTP_PREFIX}phone:${phone}`);

      const org = await findOrCreateOrg(orgName || `Org-${phone.slice(-4)}`);
      let user = await prisma.user.findFirst({ where: { orgId: org.id, phone } });
      if (!user) user = await prisma.user.create({ data: { orgId: org.id, phone, role: "DEVELOPER" } });

      const token = signToken({ sub: user.id, orgId: org.id, role: user.role });
      const session = await prisma.session.create({
        data: { userId: user.id, token, type: "READ_WRITE", expiresAt: new Date(Date.now() + config.sessionExpirySeconds * 1000) },
      });

      await createAuditLog(org.id, "LOGIN", { method: "PHONE" }, user.id, request);
      triggerWebhookEvents(org.id, "user.login", { userId: user.id, phone, method: "PHONE" });
      return sendSuccess(reply, { sessionToken: token, user: { id: user.id, phone: user.phone, role: user.role }, org: { id: org.id, name: org.name }, expiresAt: session.expiresAt }, 201);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // OAuth
  app.post("/auth/oauth", async (request, reply) => {
    try {
      const { provider, code, redirectUri } = request.body as { provider: string; code: string; redirectUri: string };
      if (!provider || !code) throw new ValidationError("Provider and code required");

      let email: string;
      let name: string;

      if (provider === "google" && config.oauth.googleClientId && config.oauth.googleClientSecret) {
        const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_id: config.oauth.googleClientId,
            client_secret: config.oauth.googleClientSecret,
            code, redirect_uri: redirectUri || config.corsOrigin,
            grant_type: "authorization_code",
          }),
        });
        const tokenData = await tokenRes.json() as any;
        if (tokenData.error) throw new ValidationError("OAuth error: " + tokenData.error);

        const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        const userData = await userRes.json() as any;
        email = userData.email;
        name = userData.name;
      } else {
        throw new ValidationError("OAuth provider not configured");
      }

      const org = await findOrCreateOrg(`${name || email}'s Org`);
      let user = await prisma.user.findFirst({ where: { orgId: org.id, email } });
      if (!user) user = await prisma.user.create({ data: { orgId: org.id, email, name, role: "DEVELOPER" } });

      await prisma.authenticator.upsert({
        where: { id: (await prisma.authenticator.findFirst({ where: { userId: user.id, type: `OAUTH_${provider.toUpperCase()}` } }))?.id || "" },
        update: { verified: true },
        create: { userId: user.id, type: `OAUTH_${provider.toUpperCase()}`, verified: true },
      });

      const token = signToken({ sub: user.id, orgId: org.id, role: user.role });
      const session = await prisma.session.create({
        data: { userId: user.id, token, type: "READ_WRITE", expiresAt: new Date(Date.now() + config.sessionExpirySeconds * 1000) },
      });

      await createAuditLog(org.id, "LOGIN", { method: "OAUTH", provider }, user.id, request);
      triggerWebhookEvents(org.id, "user.login", { userId: user.id, email, method: "OAUTH" });
      return sendSuccess(reply, { sessionToken: token, user: { id: user.id, email: user.email, name: user.name, role: user.role }, org: { id: org.id, name: org.name }, expiresAt: session.expiresAt }, 201);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // WebAuthn Registration Options
  app.post("/auth/webauthn/register", async (request, reply) => {
    try {
      const { email } = request.body as { email: string };
      if (!email) throw new ValidationError("Email required");

      const redis = getRedis();
      const org = await findOrCreateOrg(`${email}'s Org`);
      let user = await prisma.user.findFirst({ where: { orgId: org.id, email } });
      if (!user) user = await prisma.user.create({ data: { orgId: org.id, email, role: "DEVELOPER" } });

      const options = await generateRegistrationOptions({
        rpName: RP_NAME, rpID: RP_ID, userName: email,
        attestationType: "none",
        authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
      });

      await redis.setex(`webauthn:challenge:${user.id}`, 300, options.challenge);
      return sendSuccess(reply, { options, userId: user.id });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // WebAuthn Registration Verify
  app.post("/auth/webauthn/register/verify", async (request, reply) => {
    try {
      const { userId, credential } = request.body as { userId: string; credential: any };
      if (!userId || !credential) throw new ValidationError("userId and credential required");

      const redis = getRedis();
      const challenge = await redis.get(`webauthn:challenge:${userId}`);
      if (!challenge) throw new ValidationError("Challenge expired");

      const verification = await verifyRegistrationResponse({
        response: credential, expectedChallenge: challenge, expectedOrigin: EXPECTED_ORIGIN, expectedRPID: RP_ID,
      });

      if (!verification.verified) throw new ValidationError("Verification failed");

      const regInfo = verification.registrationInfo as {
        credentialId?: string;
        credentialPublicKey?: Uint8Array;
        counter?: number;
      } | undefined;
      const credentialId = regInfo?.credentialId;
      const credentialPublicKey = regInfo?.credentialPublicKey;
      const counter = regInfo?.counter;
      await prisma.authenticator.create({
        data: {
          userId, type: "PASSKEY", credentialId,
          credentialData: { publicKey: Buffer.from(credentialPublicKey!).toString("base64"), counter },
          verified: true,
        },
      });

      await redis.del(`webauthn:challenge:${userId}`);

      const user = await prisma.user.findUnique({ where: { id: userId } });
      const token = signToken({ sub: user!.id, orgId: user!.orgId, role: user!.role });
      const session = await prisma.session.create({
        data: { userId, token, type: "READ_WRITE", expiresAt: new Date(Date.now() + config.sessionExpirySeconds * 1000) },
      });

      await createAuditLog(user!.orgId, "LOGIN", { method: "PASSKEY" }, userId, request);
      triggerWebhookEvents(user!.orgId, "user.login", { userId, method: "PASSKEY" });
      return sendSuccess(reply, { sessionToken: token, user: { id: user!.id, email: user!.email, role: user!.role }, expiresAt: session.expiresAt }, 201);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // WebAuthn Authentication Options
  app.post("/auth/webauthn/authenticate", async (request, reply) => {
    try {
      const { email } = request.body as { email: string };
      if (!email) throw new ValidationError("Email required");

      const user = await prisma.user.findFirst({ where: { email } });
      if (!user) throw new ValidationError("User not found");

      const redis = getRedis();
      const options = await generateAuthenticationOptions({ rpID: RP_ID, userVerification: "preferred" });
      await redis.setex(`webauthn:challenge:${user.id}`, 300, options.challenge);
      return sendSuccess(reply, { options, userId: user.id });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // WebAuthn Authentication Verify
  app.post("/auth/webauthn/authenticate/verify", async (request, reply) => {
    try {
      const { userId, credential } = request.body as { userId: string; credential: any };
      if (!userId || !credential) throw new ValidationError("userId and credential required");

      const redis = getRedis();
      const challenge = await redis.get(`webauthn:challenge:${userId}`);
      if (!challenge) throw new ValidationError("Challenge expired");

      const authenticator = await prisma.authenticator.findFirst({
        where: { userId, type: "PASSKEY", credentialId: credential.id },
      });
      if (!authenticator || !authenticator.credentialData) throw new ValidationError("Authenticator not found");

      const credData = authenticator.credentialData as any;
      const verification = await verifyAuthenticationResponse({
        response: credential, expectedChallenge: challenge, expectedOrigin: EXPECTED_ORIGIN, expectedRPID: RP_ID,
        credential: { id: authenticator.credentialId!, publicKey: Buffer.from(credData.publicKey, "base64"), counter: credData.counter },
      });

      if (!verification.verified) throw new ValidationError("Verification failed");

      await redis.del(`webauthn:challenge:${userId}`);

      const user = await prisma.user.findUnique({ where: { id: userId } });
      const token = signToken({ sub: user!.id, orgId: user!.orgId, role: user!.role });
      const session = await prisma.session.create({
        data: { userId, token, type: "READ_WRITE", expiresAt: new Date(Date.now() + config.sessionExpirySeconds * 1000) },
      });

      await createAuditLog(user!.orgId, "LOGIN", { method: "PASSKEY" }, userId, request);
      triggerWebhookEvents(user!.orgId, "user.login", { userId, method: "PASSKEY" });
      return sendSuccess(reply, { sessionToken: token, user: { id: user!.id, email: user!.email, role: user!.role }, expiresAt: session.expiresAt }, 200);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Wallet Login (SIWE on Arc)
  app.post("/auth/wallet", async (request, reply) => {
    try {
      const { address, signature, message, orgName } = request.body as { address: string; signature: string; message: string; orgName?: string };
      if (!address || !signature) throw new ValidationError("Address and signature required");

      const { verifyMessage } = await import("ethers");
      const recovered = verifyMessage(message || "Sign in to WranKey", signature);
      if (recovered.toLowerCase() !== address.toLowerCase()) throw new ValidationError("Invalid signature");

      const org = await findOrCreateOrg(orgName || `${address.slice(0, 8)}'s Org`);
      let user = await prisma.user.findFirst({ where: { orgId: org.id, email: `${address}@wallet.wrankey` } });
      if (!user) user = await prisma.user.create({ data: { orgId: org.id, email: `${address}@wallet.wrankey`, name: address.slice(0, 12), role: "DEVELOPER" } });

      await prisma.authenticator.upsert({
        where: { id: (await prisma.authenticator.findFirst({ where: { userId: user.id, type: "WALLET" } }))?.id || "" },
        update: { verified: true },
        create: { userId: user.id, type: "WALLET", credentialId: address, verified: true },
      });

      const token = signToken({ sub: user.id, orgId: org.id, role: user.role });
      const session = await prisma.session.create({
        data: { userId: user.id, token, type: "READ_WRITE", expiresAt: new Date(Date.now() + config.sessionExpirySeconds * 1000) },
      });

      await createAuditLog(org.id, "LOGIN", { method: "WALLET", address }, user.id, request);
      triggerWebhookEvents(org.id, "user.login", { userId: user.id, address, method: "WALLET" });
      return sendSuccess(reply, { sessionToken: token, user: { id: user.id, email: user.email, role: user.role }, org: { id: org.id, name: org.name }, expiresAt: session.expiresAt }, 201);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Password signup
  app.post("/auth/password/signup", async (request, reply) => {
    try {
      const { email, password, name } = request.body as { email: string; password: string; name?: string };
      if (!email || !password) throw new ValidationError("Email and password required");
      if (password.length < 8) throw new ValidationError("Password must be at least 8 characters");

      const existing = await prisma.user.findFirst({ where: { email } });
      if (existing) throw new ValidationError("User already exists");

      const passwordHash = await bcrypt.hash(password, 12);
      const org = await findOrCreateOrg(name || `${email}'s Org`);
      const user = await prisma.user.create({ data: { orgId: org.id, email, name, role: "DEVELOPER" } });

      await prisma.authenticator.create({ data: { userId: user.id, type: "PASSWORD", credentialData: { hash: passwordHash }, verified: true } });

      const token = signToken({ sub: user.id, orgId: org.id, role: user.role });
      const session = await prisma.session.create({
        data: { userId: user.id, token, type: "READ_WRITE", expiresAt: new Date(Date.now() + config.sessionExpirySeconds * 1000) },
      });

      await createAuditLog(org.id, "SIGNUP", { method: "PASSWORD" }, user.id, request);
      return sendSuccess(reply, { sessionToken: token, user: { id: user.id, email: user.email, role: user.role }, org: { id: org.id, name: org.name }, expiresAt: session.expiresAt }, 201);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Password login
  app.post("/auth/password/login", async (request, reply) => {
    try {
      const { email, password } = request.body as { email: string; password: string };
      if (!email || !password) throw new ValidationError("Email and password required");

      const user = await prisma.user.findFirst({ where: { email } });
      if (!user) throw new ValidationError("Invalid credentials");

      const auth = await prisma.authenticator.findFirst({ where: { userId: user.id, type: "PASSWORD" } });
      if (!auth?.credentialData) throw new ValidationError("Invalid credentials");

      const valid = await bcrypt.compare(password, (auth.credentialData as any).hash);
      if (!valid) throw new ValidationError("Invalid credentials");

      const token = signToken({ sub: user.id, orgId: user.orgId, role: user.role });
      const session = await prisma.session.create({
        data: { userId: user.id, token, type: "READ_WRITE", expiresAt: new Date(Date.now() + config.sessionExpirySeconds * 1000) },
      });

      await createAuditLog(user.orgId, "LOGIN", { method: "PASSWORD" }, user.id, request);
      triggerWebhookEvents(user.orgId, "user.login", { userId: user.id, method: "PASSWORD" });
      return sendSuccess(reply, { sessionToken: token, user: { id: user.id, email: user.email, role: user.role }, expiresAt: session.expiresAt }, 200);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Session management
  app.post("/sessions/refresh", async (request, reply) => {
    try {
      const authHeader = request.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) throw new AppError(401, "Token required", "UNAUTHORIZED");

      const { verifyToken, signToken } = await import("../../utils/jwt.js");
      const payload = verifyToken(authHeader.slice(7));

      const token = signToken({ sub: payload.sub, orgId: payload.orgId, role: payload.role });
      await prisma.session.updateMany({
        where: { userId: payload.sub, token: authHeader.slice(7) },
        data: { token, expiresAt: new Date(Date.now() + config.sessionExpirySeconds * 1000) },
      });

      return sendSuccess(reply, { sessionToken: token, expiresIn: config.sessionExpirySeconds });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get("/sessions", async (request, reply) => {
    try {
      const authHeader = request.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) throw new AppError(401, "Token required", "UNAUTHORIZED");
      const { verifyToken } = await import("../../utils/jwt.js");
      const payload = verifyToken(authHeader.slice(7));

      const sessions = await prisma.session.findMany({
        where: { userId: payload.sub, expiresAt: { gt: new Date() } },
        select: { id: true, type: true, expiresAt: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      });
      return sendSuccess(reply, sessions);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.delete("/sessions/:id", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      await prisma.session.deleteMany({ where: { id } });
      return sendSuccess(reply, { message: "Session revoked" });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // API Key management
  app.post("/api-keys", async (request, reply) => {
    try {
      const authHeader = request.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) throw new AppError(401, "Token required", "UNAUTHORIZED");
      const { verifyToken } = await import("../../utils/jwt.js");
      const payload = verifyToken(authHeader.slice(7));

      const { name, permissions, allowedIps } = request.body as { name: string; permissions?: string[]; allowedIps?: string[] };
      if (!name) throw new ValidationError("Name required");

      const rawKey = `wrankey_${generateRandomToken()}`;
      const keyHash = hashSha256(rawKey);
      const keyPrefix = rawKey.slice(0, 12);

      const apiKey = await prisma.apiKey.create({
        data: {
          orgId: payload.orgId, name, keyHash, keyPrefix,
          permissions: permissions || ["*"],
          allowedIps: allowedIps || [],
          expiresAt: new Date(Date.now() + config.apiKeyExpiryDays * 86400 * 1000),
        },
      });

      await createAuditLog(payload.orgId, "API_KEY_CREATE", { keyId: apiKey.id, name }, payload.sub, request);
      return sendSuccess(reply, { id: apiKey.id, name: apiKey.name, keyPrefix, apiKey: rawKey, permissions: apiKey.permissions, expiresAt: apiKey.expiresAt }, 201);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get("/api-keys", async (request, reply) => {
    try {
      const authHeader = request.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) throw new AppError(401, "Token required", "UNAUTHORIZED");
      const { verifyToken } = await import("../../utils/jwt.js");
      const payload = verifyToken(authHeader.slice(7));
      const { limit, offset } = parsePagination(request.query as any);

      const [data, total] = await Promise.all([
        prisma.apiKey.findMany({
          where: { orgId: payload.orgId },
          select: { id: true, name: true, keyPrefix: true, permissions: true, allowedIps: true, expiresAt: true, createdAt: true },
          orderBy: { createdAt: "desc" }, take: limit, skip: offset,
        }),
        prisma.apiKey.count({ where: { orgId: payload.orgId } }),
      ]);
      return sendSuccess(reply, { data, total, limit, offset });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.delete("/api-keys/:id", async (request, reply) => {
    try {
      const authHeader = request.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) throw new AppError(401, "Token required", "UNAUTHORIZED");
      const { verifyToken } = await import("../../utils/jwt.js");
      const payload = verifyToken(authHeader.slice(7));
      const { id } = request.params as { id: string };

      await prisma.apiKey.deleteMany({ where: { id, orgId: payload.orgId } });
      await createAuditLog(payload.orgId, "API_KEY_DELETE", { keyId: id }, payload.sub, request);
      return sendSuccess(reply, { message: "API key deleted" });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Logout
  app.post("/auth/logout", async (request, reply) => {
    try {
      const authHeader = request.headers.authorization;
      if (authHeader?.startsWith("Bearer ")) {
        try {
          const { verifyToken } = await import("../../utils/jwt.js");
          const payload = verifyToken(authHeader.slice(7));
          await prisma.session.deleteMany({ where: { token: authHeader.slice(7) } });
          await createAuditLog(payload.orgId, "LOGOUT", {}, payload.sub, request);
        } catch {}
      }
      return sendSuccess(reply, { message: "Logged out" });
    } catch (err) {
      return sendError(reply, err);
    }
  });
}
