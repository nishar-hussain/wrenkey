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
const RP_ID = config.webauthnRpId;
const EXPECTED_ORIGIN = config.corsOrigin;
const OTP_RATE_LIMIT = 3;
const OTP_RATE_WINDOW = 300;

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function checkOtpRateLimit(redis: ReturnType<typeof getRedis>, keyType: string, identifier: string): Promise<void> {
  if (config.isDev) return;
  const rateLimitKey = `${RATELIMIT_PREFIX}${keyType}:${identifier}`;
  // Use Lua script for atomic incr + expire
  const luaScript = `
    local current = redis.call('INCR', KEYS[1])
    if current == 1 then
      redis.call('EXPIRE', KEYS[1], ARGV[1])
    end
    return current
  `;
  const attempts = await redis.eval(luaScript, 1, rateLimitKey, OTP_RATE_WINDOW) as number;
  if (attempts > OTP_RATE_LIMIT) {
    throw new AppError(429, "Too many OTP requests. Try again in 5 minutes.", "RATE_LIMITED");
  }
}

async function findOrCreateOrg(name: string): Promise<{ id: string; name: string }> {
  const existing = await prisma.organization.findFirst({ where: { name } });
  if (existing) return existing;
  try {
    return await prisma.organization.create({ data: { name } });
  } catch (err: any) {
    if (err?.code === "P2002") {
      const created = await prisma.organization.findFirst({ where: { name } });
      if (created) return created;
    }
    throw err;
  }
}

async function findOrCreateUser(orgId: string, email: string, opts?: { role?: string; name?: string }): Promise<{ user: any; created: boolean }> {
  const existing = await prisma.user.findFirst({ where: { orgId, email } });
  if (existing) return { user: existing, created: false };
  try {
    const userCount = await prisma.user.count({ where: { orgId } });
    const assignedRole = opts?.role || (userCount === 0 ? "ORG_ADMIN" : "DEVELOPER");
    const user = await prisma.user.create({ data: { orgId, email, role: assignedRole, ...(opts?.name ? { name: opts.name } : {}) } });
    return { user, created: true };
  } catch (err: any) {
    if (err?.code === "P2002") {
      const created = await prisma.user.findFirst({ where: { orgId, email } });
      if (created) return { user: created, created: false };
    }
    throw err;
  }
}

function humanOrgName(email: string): string {
  const username = email.split("@")[0];
  const name = username
    .split(/[^a-zA-Z]/)[0]
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return `${name}'s Org`;
}

export async function authRoutes(app: FastifyInstance) {
  // Public configuration endpoint
  app.get("/auth/config", async (request, reply) => {
    return sendSuccess(reply, {
      googleClientId: config.oauth.googleClientId || "",
    });
  });

  // Email Lookup — check if user exists for "Welcome Back" flow
  app.post("/auth/email/lookup", async (request, reply) => {
    try {
      const { email } = request.body as { email: string };
      if (!email) throw new ValidationError("Email is required");

      const user = await prisma.user.findFirst({
        where: { email },
        include: { org: true },
      });

      if (user) {
        return sendSuccess(reply, {
          exists: true,
          email: user.email,
          org: { id: user.org.id, name: user.org.name },
        });
      }

      return sendSuccess(reply, { exists: false });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Email OTP Send
  app.post("/auth/email/send", async (request, reply) => {
    try {
      const { email } = request.body as { email: string };
      if (!email) throw new ValidationError("Email is required");

      const redis = getRedis();
      await checkOtpRateLimit(redis, "email", email);

      const otp = generateOtp();
      await redis.setex(`${OTP_PREFIX}${email}`, config.otpExpirySeconds, otp);

      // Attempt to send email if SMTP is configured
      let emailSent = false;
      let smtpError = "";
      if (config.smtp.host && config.smtp.user && config.smtp.pass) {
        try {
          const isSecure = config.smtp.port === 465;
          const transporter = createTransport({
            host: config.smtp.host,
            port: config.smtp.port,
            secure: isSecure,
            auth: {
              user: config.smtp.user,
              pass: config.smtp.pass,
            },
            tls: {
              rejectUnauthorized: !config.isDev,
            },
            connectionTimeout: 10000,
            greetingTimeout: 10000,
            socketTimeout: 15000,
          });

          // Verify SMTP connection before sending
          await transporter.verify();
          console.log(`[EMAIL] SMTP connection verified for ${config.smtp.host}:${config.smtp.port}`);

          // Use SMTP_USER as from address (Gmail requires this)
          const fromAddress = config.smtp.from.includes("@")
            ? `"WranKey" <${config.smtp.from}>`
            : `"WranKey" <${config.smtp.user}>`;

          const info = await transporter.sendMail({
            from: fromAddress,
            to: email,
            subject: "WranKey - Login Code",
            text: `Your code: ${otp}\n\nExpires in ${Math.floor(config.otpExpirySeconds / 60)} minutes.`,
            html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">
              <h2 style="color:#1e3a8a;">WranKey</h2>
              <p>Your verification code is:</p>
              <h1 style="font-size:32px;letter-spacing:4px;color:#2563eb;margin:16px 0;">${otp}</h1>
              <p style="color:#64748b;font-size:14px;">This code expires in ${Math.floor(config.otpExpirySeconds / 60)} minutes.</p>
              <p style="color:#94a3b8;font-size:12px;">If you didn't request this, ignore this email.</p>
            </div>`,
          });
          emailSent = true;
          console.log(`[EMAIL] Sent OTP to ${email}, messageId: ${info.messageId}, response: ${info.response}`);
        } catch (smtpErr: any) {
          smtpError = smtpErr.message || "Unknown SMTP error";
          console.error(`[EMAIL] Failed to send OTP to ${email}:`, {
            message: smtpErr.message,
            code: smtpErr.code,
            responseCode: smtpErr.responseCode,
            response: smtpErr.response,
            command: smtpErr.command,
          });
        }
      } else {
        console.warn(`[EMAIL] SMTP not fully configured. host=${config.smtp.host}, user=${config.smtp.user ? "set" : "missing"}, pass=${config.smtp.pass ? "set" : "missing"}`);
      }

      if (!emailSent) {
        console.log(`[DEV] OTP for ${email}: ${otp}`);
      }

      return sendSuccess(reply, {
        message: emailSent
          ? "OTP sent to your email"
          : smtpError
            ? `Email delivery failed: ${smtpError}. Check server logs.`
            : "OTP generated (check server logs - SMTP not configured)",
        emailSent,
        expiresIn: config.otpExpirySeconds,
        ...(config.isDev && !emailSent ? { devOtp: otp } : {}),
      });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Email OTP Verify
  app.post("/auth/email/verify", async (request, reply) => {
    try {
      const { email, otp, orgName, name, tags } = request.body as { email: string; otp: string; orgName?: string; name?: string; tags?: string[] };
      if (!email || !otp) throw new ValidationError("Email and OTP required");

      const redis = getRedis();
      const storedOtp = await redis.get(`${OTP_PREFIX}${email}`);
      if (!storedOtp || storedOtp !== otp) throw new ValidationError("Invalid or expired OTP");
      await redis.del(`${OTP_PREFIX}${email}`);

      const existingUser = await prisma.user.findFirst({ where: { email } });
      let org: { id: string; name: string };
      if (existingUser) {
        org = (await prisma.organization.findUnique({ where: { id: existingUser.orgId } }))!;
      } else {
        org = await findOrCreateOrg(orgName || humanOrgName(email));
      }
      const { user, created: isNewUser } = await findOrCreateUser(org.id, email, { name });

      if (isNewUser && tags && tags.length > 0) {
        await prisma.user.update({
          where: { id: user.id },
          data: { tags },
        });
      }

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
        isNewUser,
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

      if (config.twilio.accountSid && config.twilio.authToken) {
        try {
          const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${config.twilio.accountSid}/Messages.json`;
          const auth = Buffer.from(`${config.twilio.accountSid}:${config.twilio.authToken}`).toString("base64");
          const params = new URLSearchParams({
            To: phone, From: config.twilio.phoneNumber,
            Body: `Your WranKey verification code: ${otp}`,
          });
          await fetch(twilioUrl, {
            method: "POST",
            headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
            body: params.toString(),
          });
        } catch (twilioErr) {
          console.error("Twilio SMS send failed:", twilioErr);
        }
      }
      if (!config.twilio.accountSid || !config.twilio.authToken) {
        console.log(`[DEV] SMS OTP for ${phone}: ${otp}`);
      }
      return sendSuccess(reply, { message: "OTP sent", expiresIn: config.otpExpirySeconds });
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

      const existingUser = await prisma.user.findFirst({ where: { phone } });
      let org: { id: string; name: string };
      if (existingUser) {
        org = (await prisma.organization.findUnique({ where: { id: existingUser.orgId } }))!;
      } else {
        org = await findOrCreateOrg(orgName || `Org-${phone.slice(-4)}`);
      }
      let user = existingUser;
      const isNewUser = !user;
      if (!user) user = await prisma.user.create({ data: { orgId: org.id, phone, role: "DEVELOPER" } });

      await prisma.authenticator.upsert({
        where: { id: (await prisma.authenticator.findFirst({ where: { userId: user.id, type: "PHONE" } }))?.id || "" },
        update: { verified: true },
        create: { userId: user.id, type: "PHONE", verified: true },
      });

      const token = signToken({ sub: user.id, orgId: org.id, role: user.role });
      const session = await prisma.session.create({
        data: { userId: user.id, token, type: "READ_WRITE", expiresAt: new Date(Date.now() + config.sessionExpirySeconds * 1000) },
      });

      if (isNewUser) {
        await createAuditLog(org.id, "SIGNUP", { phone }, user.id, request);
        triggerWebhookEvents(org.id, "user.signup", { userId: user.id, phone, method: "PHONE" });
      }
      await createAuditLog(org.id, "LOGIN", { method: "PHONE" }, user.id, request);
      triggerWebhookEvents(org.id, "user.login", { userId: user.id, phone, method: "PHONE" });
      return sendSuccess(reply, { sessionToken: token, user: { id: user.id, phone: user.phone, role: user.role }, org: { id: org.id, name: org.name }, isNewUser, expiresAt: session.expiresAt }, 201);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // OAuth
  app.post("/auth/oauth", async (request, reply) => {
    try {
      const { provider, code, redirectUri, orgName } = request.body as { provider: string; code: string; redirectUri: string; orgName?: string };
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
            code, redirect_uri: redirectUri || config.corsOrigin[0],
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

      const existingUser = await prisma.user.findFirst({ where: { email } });
      let org: { id: string; name: string };
      if (existingUser) {
        org = (await prisma.organization.findUnique({ where: { id: existingUser.orgId } }))!;
      } else {
        org = await findOrCreateOrg(orgName || `${name || email}'s Org`);
      }
      const { user, created: isNewUser } = await findOrCreateUser(org.id, email, { name });

      await prisma.authenticator.upsert({
        where: { id: (await prisma.authenticator.findFirst({ where: { userId: user.id, type: `OAUTH_${provider.toUpperCase()}` } }))?.id || "" },
        update: { verified: true },
        create: { userId: user.id, type: `OAUTH_${provider.toUpperCase()}`, verified: true },
      });

      const token = signToken({ sub: user.id, orgId: org.id, role: user.role });
      const session = await prisma.session.create({
        data: { userId: user.id, token, type: "READ_WRITE", expiresAt: new Date(Date.now() + config.sessionExpirySeconds * 1000) },
      });

      if (isNewUser) {
        await createAuditLog(org.id, "SIGNUP", { method: "OAUTH", provider }, user.id, request);
        triggerWebhookEvents(org.id, "user.signup", { userId: user.id, email, method: "OAUTH" });
      }
      await createAuditLog(org.id, "LOGIN", { method: "OAUTH", provider }, user.id, request);
      triggerWebhookEvents(org.id, "user.login", { userId: user.id, email, method: "OAUTH" });
      return sendSuccess(reply, { sessionToken: token, user: { id: user.id, email: user.email, name: user.name, role: user.role }, org: { id: org.id, name: org.name }, isNewUser, expiresAt: session.expiresAt }, 201);
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
      const existingUser = await prisma.user.findFirst({ where: { email } });
      let org: { id: string; name: string };
      if (existingUser) {
        org = (await prisma.organization.findUnique({ where: { id: existingUser.orgId } }))!;
      } else {
        org = await findOrCreateOrg(`${email}'s Org`);
      }
      let user = existingUser;
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

      const walletEmail = `${address}@wallet.wrankey`;
      const existingUser = await prisma.user.findFirst({ where: { email: walletEmail } });
      let org: { id: string; name: string };
      if (existingUser) {
        org = (await prisma.organization.findUnique({ where: { id: existingUser.orgId } }))!;
      } else {
        org = await findOrCreateOrg(orgName || `${address.slice(0, 8)}'s Org`);
      }
      const { user, created: isNewUser } = await findOrCreateUser(org.id, walletEmail, { name: address.slice(0, 12) });

      await prisma.authenticator.upsert({
        where: { id: (await prisma.authenticator.findFirst({ where: { userId: user.id, type: "WALLET" } }))?.id || "" },
        update: { verified: true },
        create: { userId: user.id, type: "WALLET", credentialId: address, verified: true },
      });

      const token = signToken({ sub: user.id, orgId: org.id, role: user.role });
      const session = await prisma.session.create({
        data: { userId: user.id, token, type: "READ_WRITE", expiresAt: new Date(Date.now() + config.sessionExpirySeconds * 1000) },
      });

      if (isNewUser) {
        await createAuditLog(org.id, "SIGNUP", { method: "WALLET", address }, user.id, request);
        triggerWebhookEvents(org.id, "user.signup", { userId: user.id, address, method: "WALLET" });
      }
      await createAuditLog(org.id, "LOGIN", { method: "WALLET", address }, user.id, request);
      triggerWebhookEvents(org.id, "user.login", { userId: user.id, address, method: "WALLET" });
      return sendSuccess(reply, { sessionToken: token, user: { id: user.id, email: user.email, role: user.role }, org: { id: org.id, name: org.name }, isNewUser, expiresAt: session.expiresAt }, 201);
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
      const org = await findOrCreateOrg(name || humanOrgName(email));
      const { user } = await findOrCreateUser(org.id, email, { name, role: "ORG_ADMIN" });

      await prisma.authenticator.create({ data: { userId: user.id, type: "PASSWORD", credentialData: { hash: passwordHash }, verified: true } });

      const token = signToken({ sub: user.id, orgId: org.id, role: user.role });
      const session = await prisma.session.create({
        data: { userId: user.id, token, type: "READ_WRITE", expiresAt: new Date(Date.now() + config.sessionExpirySeconds * 1000) },
      });

      await createAuditLog(org.id, "SIGNUP", { method: "PASSWORD" }, user.id, request);
      return sendSuccess(reply, { sessionToken: token, user: { id: user.id, email: user.email, role: user.role }, org: { id: org.id, name: org.name }, isNewUser: true, expiresAt: session.expiresAt }, 201);
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
      if (!user) throw new AppError(401, "Invalid credentials", "UNAUTHORIZED");

      const auth = await prisma.authenticator.findFirst({ where: { userId: user.id, type: "PASSWORD" } });
      if (!auth?.credentialData) throw new AppError(401, "Invalid credentials", "UNAUTHORIZED");

      const valid = await bcrypt.compare(password, (auth.credentialData as any).hash);
      if (!valid) throw new AppError(401, "Invalid credentials", "UNAUTHORIZED");

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

  // Session management - protected by global auth hook
  app.post("/sessions/refresh", async (request, reply) => {
    try {
      const authHeader = request.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) throw new AppError(401, "Token required", "UNAUTHORIZED");

      const { verifyToken, signToken } = await import("../../utils/jwt.js");
      const payload = verifyToken(authHeader.slice(7));

      // Verify session exists and is not expired in DB
      const session = await prisma.session.findFirst({
        where: { token: authHeader.slice(7), userId: payload.sub, expiresAt: { gt: new Date() } },
      });
      if (!session) throw new AppError(401, "Session expired or revoked", "SESSION_EXPIRED");

      const token = signToken({ sub: payload.sub, orgId: payload.orgId, role: payload.role });
      await prisma.session.update({
        where: { id: session.id },
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
      const authHeader = request.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) throw new AppError(401, "Token required", "UNAUTHORIZED");
      const { verifyToken } = await import("../../utils/jwt.js");
      const payload = verifyToken(authHeader.slice(7));

      // Only allow users to delete their own sessions
      const deleted = await prisma.session.deleteMany({
        where: { id, userId: payload.sub },
      });
      if (deleted.count === 0) throw new AppError(404, "Session not found", "NOT_FOUND");

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

      // Verify session in DB
      const session = await prisma.session.findFirst({
        where: { token: authHeader.slice(7), expiresAt: { gt: new Date() } },
      });
      if (!session) throw new AppError(401, "Session expired or revoked", "SESSION_EXPIRED");

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

      // Verify session in DB
      const session = await prisma.session.findFirst({
        where: { token: authHeader.slice(7), expiresAt: { gt: new Date() } },
      });
      if (!session) throw new AppError(401, "Session expired or revoked", "SESSION_EXPIRED");

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

      // Verify session in DB
      const session = await prisma.session.findFirst({
        where: { token: authHeader.slice(7), expiresAt: { gt: new Date() } },
      });
      if (!session) throw new AppError(401, "Session expired or revoked", "SESSION_EXPIRED");

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

  // Password reset request
  app.post("/auth/password/reset", async (request, reply) => {
    try {
      const { email } = request.body as { email: string };
      if (!email) throw new ValidationError("Email required");

      const user = await prisma.user.findFirst({ where: { email } });
      if (!user) return sendSuccess(reply, { message: "If an account exists, a reset link has been sent" });

      const redis = getRedis();
      const resetToken = generateRandomToken();
      await redis.setex(`pwd_reset:${resetToken}`, 900, user.id); // 15 min expiry

      if (config.smtp.host && config.smtp.user && config.smtp.pass) {
        try {
          const { createTransport } = await import("nodemailer");
          const isSecure = config.smtp.port === 465;
          const transporter = createTransport({
            host: config.smtp.host,
            port: config.smtp.port,
            secure: isSecure,
            auth: { user: config.smtp.user, pass: config.smtp.pass },
            tls: { rejectUnauthorized: !config.isDev },
          });
          const fromAddress = config.smtp.from.includes("@")
            ? `"WranKey" <${config.smtp.from}>`
            : `"WranKey" <${config.smtp.user}>`;
          const resetUrl = `${Array.isArray(config.corsOrigin) ? config.corsOrigin[0] : config.corsOrigin}/reset-password?token=${resetToken}`;
          await transporter.sendMail({
            from: fromAddress,
            to: email,
            subject: "WranKey - Reset Your Password",
            text: `Reset your password: ${resetUrl}\n\nExpires in 15 minutes.`,
            html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">
              <h2 style="color:#1e3a8a;">WranKey</h2>
              <p>Click the link below to reset your password:</p>
              <a href="${resetUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;margin:16px 0;">Reset Password</a>
              <p style="color:#64748b;font-size:14px;">This link expires in 15 minutes.</p>
              <p style="color:#94a3b8;font-size:12px;">If you didn't request this, ignore this email.</p>
            </div>`,
          });
          console.log(`[EMAIL] Sent password reset email to ${email}`);
        } catch (resetEmailErr: any) {
          console.error(`[EMAIL] Failed to send password reset to ${email}:`, resetEmailErr.message);
        }
      }
      console.log(`[DEV] Password reset token for ${email}: ${resetToken}`);

      return sendSuccess(reply, { message: "If an account exists, a reset link has been sent" });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Password reset confirm
  app.post("/auth/password/reset/confirm", async (request, reply) => {
    try {
      const { token, newPassword } = request.body as { token: string; newPassword: string };
      if (!token || !newPassword) throw new ValidationError("Token and new password required");
      if (newPassword.length < 8) throw new ValidationError("Password must be at least 8 characters");

      const redis = getRedis();
      const userId = await redis.get(`pwd_reset:${token}`);
      if (!userId) throw new ValidationError("Invalid or expired reset token");

      const passwordHash = await bcrypt.hash(newPassword, 12);
      await prisma.authenticator.updateMany({
        where: { userId, type: "PASSWORD" },
        data: { credentialData: { hash: passwordHash } },
      });
      await redis.del(`pwd_reset:${token}`);

      return sendSuccess(reply, { message: "Password reset successfully" });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Passwordless Signup Initiate
  app.post("/auth/signup/initiate", async (request, reply) => {
    try {
      const { name, email, orgName, hearAbout } = request.body as {
        name: string;
        email: string;
        orgName: string;
        hearAbout?: string;
      };

      if (!name || !email || !orgName) {
        throw new ValidationError("Name, email, and organization name are required");
      }

      const existing = await prisma.user.findFirst({ where: { email } });
      if (existing) {
        throw new ValidationError("User already exists");
      }

      const redis = getRedis();
      const token = generateRandomToken();

      await redis.setex(
        `pending_signup:${token}`,
        86400,
        JSON.stringify({ name, email, orgName, hearAbout })
      );

      if (config.smtp.host && config.smtp.user && config.smtp.pass) {
        try {
          const { createTransport } = await import("nodemailer");
          const isSecure = config.smtp.port === 465;
          const transporter = createTransport({
            host: config.smtp.host,
            port: config.smtp.port,
            secure: isSecure,
            auth: { user: config.smtp.user, pass: config.smtp.pass },
            tls: { rejectUnauthorized: !config.isDev },
          });
          const fromAddress = config.smtp.from.includes("@")
            ? `"WranKey" <${config.smtp.from}>`
            : `"WranKey" <${config.smtp.user}>`;
          const verifyUrl = `${Array.isArray(config.corsOrigin) ? config.corsOrigin[0] : config.corsOrigin}/signup/verify?token=${token}`;
          await transporter.sendMail({
            from: fromAddress,
            to: email,
            subject: "WranKey - Verify Your Email",
            text: `Verify your email to continue creating your account: ${verifyUrl}\n\nThis link expires in 24 hours.`,
            html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">
              <h2 style="color:#1e3a8a;">WranKey</h2>
              <p>Click the link below to verify your email and continue creating your account:</p>
              <a href="${verifyUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;margin:16px 0;">Verify Email</a>
              <p style="color:#64748b;font-size:14px;">This link expires in 24 hours.</p>
              <p style="color:#94a3b8;font-size:12px;">If you didn't request this, ignore this email.</p>
            </div>`,
          });
          console.log(`[EMAIL] Sent signup verification email to ${email}`);
        } catch (emailErr: any) {
          console.error(`[EMAIL] Failed to send signup verification to ${email}:`, emailErr.message);
        }
      }
      console.log(`[DEV] Signup verification link for ${email}: ${Array.isArray(config.corsOrigin) ? config.corsOrigin[0] : config.corsOrigin}/signup/verify?token=${token}`);

      return sendSuccess(reply, { message: "Verification email sent successfully" });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Passwordless Signup Verify Token
  app.get("/auth/signup/verify", async (request, reply) => {
    try {
      const { token } = request.query as { token: string };
      if (!token) throw new ValidationError("Token required");

      const redis = getRedis();
      const dataStr = await redis.get(`pending_signup:${token}`);
      if (!dataStr) {
        throw new ValidationError("Invalid or expired signup verification link");
      }

      const { name, email, orgName } = JSON.parse(dataStr);
      return sendSuccess(reply, { name, email, orgName });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Passwordless Signup Register Options (Passkey Registration Options)
  app.post("/auth/signup/register-options", async (request, reply) => {
    try {
      const { token, attachment } = request.body as {
        token: string;
        attachment?: "platform" | "cross-platform";
      };
      if (!token) throw new ValidationError("Token required");

      const redis = getRedis();
      const dataStr = await redis.get(`pending_signup:${token}`);
      if (!dataStr) {
        throw new ValidationError("Invalid or expired signup session");
      }

      const { email, name } = JSON.parse(dataStr);

      const options = await generateRegistrationOptions({
        rpName: RP_NAME,
        rpID: RP_ID,
        userName: email,
        userDisplayName: name || email,
        attestationType: "none",
        authenticatorSelection: {
          residentKey: "preferred",
          userVerification: "preferred",
          ...(attachment ? { authenticatorAttachment: attachment } : {}),
        },
      });

      await redis.setex(`webauthn:challenge:signup:${token}`, 300, options.challenge);
      return sendSuccess(reply, { options });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Passwordless Signup Confirm (Passkey Registration Confirm)
  app.post("/auth/signup/confirm", async (request, reply) => {
    try {
      const { token, credential } = request.body as {
        token: string;
        credential: any;
      };
      if (!token || !credential) {
        throw new ValidationError("Token and credential are required");
      }

      const redis = getRedis();
      const dataStr = await redis.get(`pending_signup:${token}`);
      if (!dataStr) {
        throw new ValidationError("Invalid or expired signup session");
      }

      const challenge = await redis.get(`webauthn:challenge:signup:${token}`);
      if (!challenge) {
        throw new ValidationError("WebAuthn challenge expired or not found");
      }

      const { name, email, orgName } = JSON.parse(dataStr);

      const verification = await verifyRegistrationResponse({
        response: credential,
        expectedChallenge: challenge,
        expectedOrigin: EXPECTED_ORIGIN,
        expectedRPID: RP_ID,
      });

      if (!verification.verified) {
        throw new ValidationError("Authenticator verification failed");
      }

      const regInfo = verification.registrationInfo as {
        credentialId?: string;
        credentialPublicKey?: Uint8Array;
        counter?: number;
      } | undefined;
      const credentialId = regInfo?.credentialId;
      const credentialPublicKey = regInfo?.credentialPublicKey;
      const counter = regInfo?.counter;

      // Atomic creation of Org, User, and Authenticator records
      const result = await prisma.$transaction(async (tx) => {
        const org = await tx.organization.create({ data: { name: orgName } });
        const user = await tx.user.create({
          data: {
            orgId: org.id,
            email,
            name,
            role: "DEVELOPER",
          },
        });

        await tx.authenticator.create({
          data: {
            userId: user.id,
            type: "PASSKEY",
            credentialId,
            credentialData: {
              publicKey: Buffer.from(credentialPublicKey!).toString("base64"),
              counter,
            },
            verified: true,
          },
        });

        return { org, user };
      });

      const tokenVal = signToken({
        sub: result.user.id,
        orgId: result.org.id,
        role: result.user.role,
      });

      const session = await prisma.session.create({
        data: {
          userId: result.user.id,
          token: tokenVal,
          type: "READ_WRITE",
          expiresAt: new Date(Date.now() + config.sessionExpirySeconds * 1000),
        },
      });

      // Audit logs and webhook triggers
      await createAuditLog(result.org.id, "SIGNUP", { email, method: "PASSKEY" }, result.user.id, request);
      triggerWebhookEvents(result.org.id, "user.signup", { userId: result.user.id, email, method: "PASSKEY" });
      await createAuditLog(result.org.id, "LOGIN", { method: "PASSKEY" }, result.user.id, request);
      triggerWebhookEvents(result.org.id, "user.login", { userId: result.user.id, email, method: "PASSKEY" });

      // Clean up Redis keys
      await redis.del(`pending_signup:${token}`);
      await redis.del(`webauthn:challenge:signup:${token}`);

      return sendSuccess(
        reply,
        {
          sessionToken: tokenVal,
          user: {
            id: result.user.id,
            email: result.user.email,
            name: result.user.name,
            role: result.user.role,
          },
          org: {
            id: result.org.id,
            name: result.org.name,
          },
          expiresAt: session.expiresAt,
        },
        201
      );
    } catch (err) {
      return sendError(reply, err);
    }
  });
}
