import { FastifyInstance } from "fastify";
import bcrypt from "bcrypt";
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

function validateEmail(email: string) {
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ValidationError("Invalid email format");
  }
}

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
    const org = await prisma.organization.create({ data: { name } });
    await prisma.orgConfig.upsert({
      where: { orgId: org.id },
      create: { orgId: org.id, config: { otpEnabled: true, otpEmail: true, otpLength: 6, otpType: "numeric", sessionExpiry: 900 } },
      update: {},
    });
    return org;
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

async function getOrgConfig(orgId: string): Promise<Record<string, any>> {
  try {
    const row = await prisma.orgConfig.findUnique({ where: { orgId } });
    return (row?.config as any) || {};
  } catch { return {}; }
}

async function getEffectiveSessionExpiry(orgId: string): Promise<number> {
  const orgConfig = await getOrgConfig(orgId);
  const orgExpiry = typeof orgConfig.sessionExpiry === "number" ? orgConfig.sessionExpiry : config.sessionExpirySeconds;
  return Math.min(orgExpiry, config.sessionExpirySeconds);
}

async function getOrgBranding(orgId: string): Promise<{ appName: string; appLogo: string }> {
  const orgConfig = await getOrgConfig(orgId);
  return {
    appName: (orgConfig.appName as string) || "WranKey",
    appLogo: (orgConfig.appLogo as string) || "",
  };
}

async function getOtpConfig(orgId?: string): Promise<{ otpLength: number; otpType: string; otpEnabled: boolean; otpEmail: boolean; otpSms: boolean }> {
  if (!orgId) return { otpLength: 6, otpType: "numeric", otpEnabled: true, otpEmail: true, otpSms: false };
  const orgConfig = await getOrgConfig(orgId);
  return {
    otpLength: (typeof orgConfig.otpLength === "number" ? orgConfig.otpLength : 6),
    otpType: (orgConfig.otpType === "alphanumeric" ? "alphanumeric" : "numeric"),
    otpEnabled: orgConfig.otpEnabled !== false,
    otpEmail: orgConfig.otpEmail !== false,
    otpSms: orgConfig.otpSms === true,
  };
}

function generateOtpConfigurable(length: number, type: string): string {
  if (type === "alphanumeric") {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let result = "";
    for (let i = 0; i < length; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
    return result;
  }
  const min = Math.pow(10, length - 1);
  const max = Math.pow(10, length) - 1;
  return Math.floor(min + Math.random() * (max - min + 1)).toString();
}

export async function authRoutes(app: FastifyInstance) {
  // Public configuration endpoint — returns server-level + org-level auth config
  app.get("/auth/config", async (request, reply) => {
    try {
      const baseConfig: Record<string, any> = {
        googleClientId: config.oauth.googleClientId || "",
        sessionExpiry: config.sessionExpirySeconds,
        otpEnabled: true,
        otpLength: 6,
        otpType: "numeric",
        otpEmail: true,
        otpSms: false,
        passkeyAuth: true,
        walletAuth: true,
        socialOAuth: true,
        googleLogin: true,
        appleLogin: false,
        xLogin: false,
        discordLogin: false,
        redirectUrl: "https://example.com/auth/callback",
        appName: "WranKey",
        appLogo: "",
        requireTokenLookup: false,
      };

      // If authenticated, overlay org-level config
      if (request.userId && request.orgId) {
        try {
          const orgConfigRow = await prisma.orgConfig.findUnique({ where: { orgId: request.orgId } });
          const oc = (orgConfigRow?.config as any) || {};
          if (oc.sessionExpiry !== undefined) baseConfig.sessionExpiry = oc.sessionExpiry;
          if (oc.otpEnabled !== undefined) baseConfig.otpEnabled = oc.otpEnabled;
          if (oc.otpLength !== undefined) baseConfig.otpLength = oc.otpLength;
          if (oc.otpType !== undefined) baseConfig.otpType = oc.otpType;
          if (oc.otpEmail !== undefined) baseConfig.otpEmail = oc.otpEmail;
          if (oc.otpSms !== undefined) baseConfig.otpSms = oc.otpSms;
          if (oc.passkeyAuth !== undefined) baseConfig.passkeyAuth = oc.passkeyAuth;
          if (oc.walletAuth !== undefined) baseConfig.walletAuth = oc.walletAuth;
          if (oc.socialOAuth !== undefined) baseConfig.socialOAuth = oc.socialOAuth;
          if (oc.googleLogin !== undefined) baseConfig.googleLogin = oc.googleLogin;
          if (oc.appleLogin !== undefined) baseConfig.appleLogin = oc.appleLogin;
          if (oc.xLogin !== undefined) baseConfig.xLogin = oc.xLogin;
          if (oc.discordLogin !== undefined) baseConfig.discordLogin = oc.discordLogin;
          if (oc.redirectUrl !== undefined) baseConfig.redirectUrl = oc.redirectUrl;
          if (oc.appName !== undefined) baseConfig.appName = oc.appName;
          if (oc.appLogo !== undefined) baseConfig.appLogo = oc.appLogo;
          if (oc.requireTokenLookup !== undefined) baseConfig.requireTokenLookup = oc.requireTokenLookup;
        } catch { /* use server defaults */ }
      }

      return sendSuccess(reply, baseConfig);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Protected: get current session user + org (used by frontend to validate token on load)
  app.get("/auth/me", async (request, reply) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: request.userId },
        include: { org: true },
      });
      if (!user) throw new ValidationError("User not found");
      return sendSuccess(reply, {
        user: { id: user.id, email: user.email, role: user.role },
        org: { id: user.org.id, name: user.org.name },
      });
    } catch (err) {
      return sendError(reply, err);
    }
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
        // Check if org requires token for account lookups
        const orgConfig = await getOrgConfig(user.orgId);
        if (orgConfig.requireTokenLookup === true) {
          const authHeader = request.headers.authorization;
          if (!authHeader || !authHeader.startsWith("Bearer ")) {
            throw new AppError(401, "Authentication required for account lookups", "UNAUTHORIZED");
          }
          const token = authHeader.slice(7);
          const session = await prisma.session.findFirst({
            where: { token, userId: user.id, expiresAt: { gt: new Date() } },
          });
          if (!session) throw new AppError(401, "Invalid or expired session", "UNAUTHORIZED");
        }

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

      // Look up org config for branding + OTP settings
      let branding = { appName: "WranKey", appLogo: "" };
      let otpCfg = { otpLength: 6, otpType: "numeric", otpEnabled: true, otpEmail: true, otpSms: false };
      try {
        const user = await prisma.user.findFirst({ where: { email }, select: { orgId: true } });
        if (user) {
          branding = await getOrgBranding(user.orgId);
          otpCfg = await getOtpConfig(user.orgId);
        }
      } catch { /* use defaults */ }

      if (!otpCfg.otpEnabled) throw new ValidationError("OTP authentication is disabled for this organization");
      if (!otpCfg.otpEmail) throw new ValidationError("Email OTP is disabled for this organization");

      const otp = generateOtpConfigurable(otpCfg.otpLength, otpCfg.otpType);
      await redis.setex(`${OTP_PREFIX}${email}`, config.otpExpirySeconds, otp);

      // Attempt to send email if SMTP is configured
      let emailSent = false;
      let smtpError = "";
      const { sendEmail } = await import("../../utils/email.js");
      if (config.smtp.host && config.smtp.user && config.smtp.pass) {
        const logoHtml = branding.appLogo ? `<img src="${branding.appLogo}" alt="${branding.appName}" style="max-height:40px;margin-bottom:16px;" />` : "";
        const result = await sendEmail({
          to: email,
          subject: `${branding.appName} - Login Code`,
          text: `Your code: ${otp}\n\nExpires in ${Math.floor(config.otpExpirySeconds / 60)} minutes.`,
          html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">
            ${logoHtml}
            <h2 style="color:#1e3a8a;">${branding.appName}</h2>
            <p>Your verification code is:</p>
            <h1 style="font-size:32px;letter-spacing:4px;color:#2563eb;margin:16px 0;">${otp}</h1>
            <p style="color:#64748b;font-size:14px;">This code expires in ${Math.floor(config.otpExpirySeconds / 60)} minutes.</p>
            <p style="color:#94a3b8;font-size:12px;">If you didn't request this, ignore this email.</p>
          </div>`,
          appName: branding.appName,
        });
        emailSent = result.sent;
        if (!emailSent) smtpError = result.error || "Unknown SMTP error";
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
        where: { userId_type: { userId: user.id, type: "EMAIL" } },
        update: { verified: true },
        create: { userId: user.id, type: "EMAIL", verified: true },
      });

      const token = signToken({ sub: user.id, orgId: org.id, role: user.role });
      const expiry = await getEffectiveSessionExpiry(org.id);
      const session = await prisma.session.create({
        data: {
          userId: user.id, token, type: "READ_WRITE",
          expiresAt: new Date(Date.now() + expiry * 1000),
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
        where: { userId_type: { userId: user.id, type: "PHONE" } },
        update: { verified: true },
        create: { userId: user.id, type: "PHONE", verified: true },
      });

      const token = signToken({ sub: user.id, orgId: org.id, role: user.role });
      const expiry = await getEffectiveSessionExpiry(org.id);
      const session = await prisma.session.create({
        data: { userId: user.id, token, type: "READ_WRITE", expiresAt: new Date(Date.now() + expiry * 1000) },
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
      const { provider, code, redirectUri, orgName, orgId, codeVerifier, name: reqName } = request.body as { provider: string; code: string; redirectUri: string; orgName?: string; orgId?: string; codeVerifier?: string; name?: string };
      if (!provider || !code) throw new ValidationError("Provider and code required");

      let clientId = "";
      let clientSecret = "";

      // Try org-level credentials first
      if (orgId) {
        try {
          const orgConfigRow = await prisma.orgConfig.findUnique({ where: { orgId }, select: { config: true } });
          const oc = (orgConfigRow?.config as any) || {};
          const creds = (oc.oauthCredentials || []) as Array<{ provider: string; clientId: string; clientSecret: string }>;
          const match = creds.find((c: any) => c.provider?.toLowerCase() === provider.toLowerCase());
          if (match) { clientId = match.clientId; clientSecret = match.clientSecret; }
        } catch { /* fall through to server-level */ }
      }

      // Fallback to server-level Google credentials
      if (!clientId && provider === "google") {
        clientId = config.oauth.googleClientId;
        clientSecret = config.oauth.googleClientSecret;
      }

      if (!clientId || !clientSecret) throw new ValidationError(`OAuth provider "${provider}" not configured for this organization`);

      let email: string;
      let name: string;

      if (provider === "google") {
        const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri || config.corsOrigin[0], grant_type: "authorization_code" }),
        });
        const tokenData = await tokenRes.json() as any;
        if (tokenData.error) throw new ValidationError("OAuth error: " + tokenData.error_description || tokenData.error);
        const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { Authorization: `Bearer ${tokenData.access_token}` } });
        const userData = await userRes.json() as any;
        email = userData.email;
        name = userData.name;
      } else if (provider === "discord") {
        const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, grant_type: "authorization_code", redirect_uri: redirectUri || config.corsOrigin[0] }),
        });
        const tokenData = await tokenRes.json() as any;
        if (tokenData.error) throw new ValidationError("Discord OAuth error: " + tokenData.error);
        const userRes = await fetch("https://discord.com/api/users/@me", { headers: { Authorization: `Bearer ${tokenData.access_token}` } });
        const userData = await userRes.json() as any;
        email = userData.email || `${userData.username}@discord.user`;
        name = userData.global_name || userData.username;
      } else if (provider === "github") {
        const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri || config.corsOrigin[0] }),
        });
        const tokenData = await tokenRes.json() as any;
        if (tokenData.error) throw new ValidationError("GitHub OAuth error: " + tokenData.error);
        const userRes = await fetch("https://api.github.com/user", { headers: { Authorization: `Bearer ${tokenData.access_token}`, "User-Agent": "WranKey" } });
        const userData = await userRes.json() as any;
        const emailsRes = await fetch("https://api.github.com/user/emails", { headers: { Authorization: `Bearer ${tokenData.access_token}`, "User-Agent": "WranKey" } });
        const emails = await emailsRes.json() as any[];
        const primaryEmail = Array.isArray(emails) ? emails.find((e: any) => e.primary)?.email : userData.email;
        email = primaryEmail || `${userData.login}@github.user`;
        name = userData.name || userData.login;
      } else if (provider === "apple") {
        // Apple returns user info in the first request; use id_token to extract
        const tokenRes = await fetch("https://appleid.apple.com/auth/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, grant_type: "authorization_code", redirect_uri: redirectUri || config.corsOrigin[0] }),
        });
        const tokenData = await tokenRes.json() as any;
        if (tokenData.error) throw new ValidationError("Apple OAuth error: " + tokenData.error);
        // Decode id_token payload (JWT middle part)
        const idTokenParts = (tokenData.id_token || "").split(".");
        if (idTokenParts.length < 2) throw new ValidationError("Invalid Apple id_token");
        const payload = JSON.parse(Buffer.from(idTokenParts[1], "base64url").toString("utf8")) as any;
        email = payload.email || `${payload.sub}@appleid.user`;
        name = payload.name || email?.split("@")[0] || "Apple User";
      } else if (provider === "x" || provider === "twitter") {
        // Twitter OAuth 2.0 with PKCE
        const codeChallengeVerifier = codeVerifier || "";
        const tokenRes = await fetch("https://api.twitter.com/2/oauth2/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded", "Authorization": `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}` },
          body: new URLSearchParams({ code, grant_type: "authorization_code", redirect_uri: redirectUri || config.corsOrigin[0], code_verifier: codeChallengeVerifier }),
        });
        const tokenData = await tokenRes.json() as any;
        if (tokenData.error) throw new ValidationError("Twitter OAuth error: " + tokenData.error_description || tokenData.error);
        const userRes = await fetch("https://api.twitter.com/2/users/me", { headers: { Authorization: `Bearer ${tokenData.access_token}` } });
        const userData = await userRes.json() as any;
        const twitterUser = userData.data || {};
        email = `${twitterUser.username || twitterUser.id}@twitter.user`;
        name = twitterUser.name || twitterUser.username || "Twitter User";
      } else {
        throw new ValidationError(`Unsupported OAuth provider: ${provider}`);
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
        where: { userId_type: { userId: user.id, type: `OAUTH_${provider.toUpperCase()}` } },
        update: { verified: true },
        create: { userId: user.id, type: `OAUTH_${provider.toUpperCase()}`, verified: true },
      });

      const token = signToken({ sub: user.id, orgId: org.id, role: user.role });
      const expiry = await getEffectiveSessionExpiry(org.id);
      const session = await prisma.session.create({
        data: { userId: user.id, token, type: "READ_WRITE", expiresAt: new Date(Date.now() + expiry * 1000) },
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
      if (!credentialPublicKey) throw new ValidationError("Missing credentialPublicKey in WebAuthn response");
      await prisma.authenticator.create({
        data: {
          userId, type: "PASSKEY", credentialId,
          credentialData: { publicKey: Buffer.from(credentialPublicKey).toString("base64"), counter },
          verified: true,
        },
      });

      await redis.del(`webauthn:challenge:${userId}`);

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw new ValidationError("User not found");
      const token = signToken({ sub: user.id, orgId: user.orgId, role: user.role });
      const expiry = await getEffectiveSessionExpiry(user!.orgId);
      const session = await prisma.session.create({
        data: { userId, token, type: "READ_WRITE", expiresAt: new Date(Date.now() + expiry * 1000) },
      });

      await createAuditLog(user.orgId, "LOGIN", { method: "PASSKEY" }, userId, request);
      triggerWebhookEvents(user.orgId, "user.login", { userId, method: "PASSKEY" });
      return sendSuccess(reply, { sessionToken: token, user: { id: user.id, email: user.email, role: user.role }, expiresAt: session.expiresAt }, 201);
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
      if (!user) throw new ValidationError("User not found");
      const token = signToken({ sub: user.id, orgId: user.orgId, role: user.role });
      const expiry = await getEffectiveSessionExpiry(user.orgId);
      const session = await prisma.session.create({
        data: { userId, token, type: "READ_WRITE", expiresAt: new Date(Date.now() + expiry * 1000) },
      });

      await createAuditLog(user.orgId, "LOGIN", { method: "PASSKEY" }, userId, request);
      triggerWebhookEvents(user.orgId, "user.login", { userId, method: "PASSKEY" });
      return sendSuccess(reply, { sessionToken: token, user: { id: user.id, email: user.email, role: user.role }, expiresAt: session.expiresAt }, 200);
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
        where: { userId_type: { userId: user.id, type: "WALLET" } },
        update: { verified: true },
        create: { userId: user.id, type: "WALLET", credentialId: address, verified: true },
      });

      const token = signToken({ sub: user.id, orgId: org.id, role: user.role });
      const expiry = await getEffectiveSessionExpiry(org.id);
      const session = await prisma.session.create({
        data: { userId: user.id, token, type: "READ_WRITE", expiresAt: new Date(Date.now() + expiry * 1000) },
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
      const expiry = await getEffectiveSessionExpiry(org.id);
      const session = await prisma.session.create({
        data: { userId: user.id, token, type: "READ_WRITE", expiresAt: new Date(Date.now() + expiry * 1000) },
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
      const expiry = await getEffectiveSessionExpiry(user.orgId);
      const session = await prisma.session.create({
        data: { userId: user.id, token, type: "READ_WRITE", expiresAt: new Date(Date.now() + expiry * 1000) },
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
      const expiry = await getEffectiveSessionExpiry(payload.orgId);
      await prisma.session.update({
        where: { id: session.id },
        data: { token, expiresAt: new Date(Date.now() + expiry * 1000) },
      });

      return sendSuccess(reply, { sessionToken: token, expiresIn: expiry });
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
        } catch (e) {
          app.log?.warn?.("Logout: session cleanup failed, continuing", (e as any)?.message);
        }
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
          const { sendEmail } = await import("../../utils/email.js");
          const branding = await getOrgBranding(user.orgId);
          const resetUrl = `${Array.isArray(config.corsOrigin) ? config.corsOrigin[0] : config.corsOrigin}/reset-password?token=${resetToken}`;
          const logoHtml = branding.appLogo ? `<img src="${branding.appLogo}" alt="${branding.appName}" style="max-height:40px;margin-bottom:16px;" />` : "";
          await sendEmail({
            to: email,
            subject: `${branding.appName} - Reset Your Password`,
            text: `Reset your password: ${resetUrl}\n\nExpires in 15 minutes.`,
            html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">
              ${logoHtml}
              <h2 style="color:#1e3a8a;">${branding.appName}</h2>
              <p>Click the link below to reset your password:</p>
              <a href="${resetUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;margin:16px 0;">Reset Password</a>
              <p style="color:#64748b;font-size:14px;">This link expires in 15 minutes.</p>
              <p style="color:#94a3b8;font-size:12px;">If you didn't request this, ignore this email.</p>
            </div>`,
            appName: branding.appName,
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
      const updateResult = await prisma.authenticator.updateMany({
        where: { userId, type: "PASSWORD" },
        data: { credentialData: { hash: passwordHash } },
      });
      if (updateResult.count === 0) throw new ValidationError("No password authenticator found — sign up with a password first");
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
          const { sendEmail } = await import("../../utils/email.js");
          const verifyUrl = `${Array.isArray(config.corsOrigin) ? config.corsOrigin[0] : config.corsOrigin}/signup/verify?token=${token}`;
          await sendEmail({
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
            appName: "WranKey",
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
      if (!credentialPublicKey) throw new ValidationError("Missing credentialPublicKey in WebAuthn response");

      // Atomic creation of Org, User, and Authenticator records
      const result = await prisma.$transaction(async (tx) => {
        const org = await tx.organization.create({ data: { name: orgName } });
        const user = await tx.user.create({
          data: {
            orgId: org.id,
            email,
            name,
            role: "ORG_ADMIN",
          },
        });

        await tx.authenticator.create({
          data: {
            userId: user.id,
            type: "PASSKEY",
            credentialId,
            credentialData: {
              publicKey: Buffer.from(credentialPublicKey).toString("base64"),
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
          expiresAt: new Date(Date.now() + (await getEffectiveSessionExpiry(result.org.id)) * 1000),
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

  // Invitation: verify token
  app.get("/auth/invitation/:token", async (request, reply) => {
    try {
      const { token } = request.params as { token: string };
      if (!token) throw new ValidationError("Token required");

      const redis = getRedis();
      const data = await redis.get(`invite:${token}`);
      if (!data) throw new ValidationError("Invalid or expired invitation");

      const invite = JSON.parse(data);
      return sendSuccess(reply, {
        valid: true,
        email: invite.email,
        orgName: invite.orgName,
      });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Invitation: accept (verify OTP + activate user)
  app.post("/auth/invitation/accept", async (request, reply) => {
    try {
      const { token, otp } = request.body as { token: string; otp: string };
      if (!token || !otp) throw new ValidationError("Token and OTP required");

      const redis = getRedis();
      const inviteData = await redis.get(`invite:${token}`);
      if (!inviteData) throw new ValidationError("Invalid or expired invitation");

      const invite = JSON.parse(inviteData);
      const email = invite.email;

      // Verify OTP
      const storedOtp = await redis.get(`otp:${email}`);
      if (!storedOtp || storedOtp !== otp) throw new ValidationError("Invalid or expired OTP");
      await redis.del(`otp:${email}`);
      await redis.del(`invite:${token}`);

      // Find or create authenticator and session
      const user = await prisma.user.findUnique({ where: { id: invite.userId }, include: { org: true } });
      if (!user) throw new ValidationError("User not found");

      await prisma.authenticator.upsert({
        where: { userId_type: { userId: user.id, type: "EMAIL" } },
        update: { verified: true },
        create: { userId: user.id, type: "EMAIL", verified: true },
      });

      const sessionToken = signToken({ sub: user.id, orgId: user.orgId, role: user.role });
      const expiry = await getEffectiveSessionExpiry(user.orgId);
      const session = await prisma.session.create({
        data: {
          userId: user.id, token: sessionToken, type: "READ_WRITE",
          expiresAt: new Date(Date.now() + expiry * 1000),
        },
      });

      await createAuditLog(user.orgId, "INVITATION_ACCEPT", { email }, user.id, request);
      triggerWebhookEvents(user.orgId, "user.login", { userId: user.id, email, method: "INVITATION" });

      return sendSuccess(reply, {
        sessionToken,
        user: { id: user.id, email: user.email, role: user.role },
        org: { id: user.org.id, name: user.org.name },
        expiresAt: session.expiresAt,
      }, 201);
    } catch (err) {
      return sendError(reply, err);
    }
  });
}
