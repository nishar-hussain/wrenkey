import { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import bcrypt from "bcrypt";
import { verifyMessage } from "ethers";
import { createTransport } from "nodemailer";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import prisma from "../../db.js";
import { config } from "../../config.js";
import { authMiddleware } from "../../middleware/auth.js";
import { sendSuccess, sendError, ValidationError, NotFoundError, AppError } from "../../utils/errors.js";
import { createAuditLog } from "../../utils/audit.js";
import { getRedis } from "../../redis.js";
import { triggerWebhookEvents } from "../webhook/routes.js";
import { parsePagination } from "../../utils/pagination.js";

const OTP_PREFIX = "otp:";
const WEBAUTHN_CHALLENGE_PREFIX = "webauthn:challenge:";
const RATELIMIT_PREFIX = "ratelimit:otp:";
const RP_NAME = "ArKey";
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
  if (attempts === 1) {
    await redis.expire(rateLimitKey, OTP_RATE_WINDOW);
  }
  if (attempts > OTP_RATE_LIMIT) {
    throw new AppError(429, "Too many OTP requests. Please try again in 5 minutes.", "RATE_LIMITED");
  }
}

async function findOrCreateOrg(email: string, orgId?: string, orgName?: string) {
  let organization = orgId
    ? await prisma.organization.findUnique({ where: { id: orgId } })
    : null;
  if (!organization) {
    organization = await prisma.organization.create({
      data: { name: orgName || `${email}'s Org` },
    });
  }
  return organization;
}

async function findOrCreateUser(orgId: string, email: string) {
  let user = await prisma.user.findFirst({ where: { orgId, email } });
  if (!user) {
    user = await prisma.user.create({
      data: { orgId, email, role: "DEVELOPER" },
    });
  }
  return user;
}

async function createUserSession(user: { id: string; role: string }, orgId: string) {
  const { signToken } = await import("../../utils/jwt.js");
  const token = signToken({ sub: user.id, orgId, role: user.role });
  const session = await prisma.session.create({
    data: {
      userId: user.id,
      token,
      type: "READ_WRITE",
      expiresAt: new Date(Date.now() + config.sessionExpirySeconds * 1000),
    },
  });
  return { token, session };
}

export async function authRoutes(app: FastifyInstance) {
  // ─── Email OTP ───────────────────────────────────────────────

  app.post("/auth/email/send", async (request, reply) => {
    try {
      const { email, orgId } = request.body as { email: string; orgId?: string };
      if (!email) throw new ValidationError("Email is required");

      const redis = getRedis();
      await checkOtpRateLimit(redis, "email", email);

      const otp = generateOtp();
      const key = `${OTP_PREFIX}${email}`;
      await redis.setex(key, config.otpExpirySeconds, otp);

      // Send email via nodemailer if configured
      if (config.smtp.host && config.smtp.user) {
        const transporter = createTransport({
          host: config.smtp.host,
          port: config.smtp.port,
          auth: { user: config.smtp.user, pass: config.smtp.pass },
        });
        await transporter.sendMail({
          from: config.smtp.from,
          to: email,
          subject: "ArKey - Your Login Code",
          text: `Your verification code is: ${otp}\n\nThis code expires in ${config.otpExpirySeconds} seconds.`,
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

  app.post("/auth/email/verify", async (request, reply) => {
    try {
      const { email, otp, orgId, orgName } = request.body as {
        email: string;
        otp: string;
        orgId?: string;
        orgName?: string;
      };
      if (!email || !otp) throw new ValidationError("Email and OTP are required");

      const redis = getRedis();
      const key = `${OTP_PREFIX}${email}`;
      const storedOtp = await redis.get(key);

      if (!storedOtp || storedOtp !== otp) {
        throw new ValidationError("Invalid or expired OTP");
      }

      await redis.del(key);

      const organization = await findOrCreateOrg(email, orgId, orgName);
      let user = await findOrCreateUser(organization.id, email);
      const isNewUser = user.createdAt.getTime() === user.updatedAt.getTime();

      // Upsert email authenticator
      const existingAuth = await prisma.authenticator.findFirst({
        where: { userId: user.id, type: "EMAIL" },
      });
      if (existingAuth) {
        await prisma.authenticator.update({
          where: { id: existingAuth.id },
          data: { verified: true },
        });
      } else {
        await prisma.authenticator.create({
          data: { userId: user.id, type: "EMAIL", verified: true },
        });
      }

      const { token, session } = await createUserSession(user, organization.id);

      if (isNewUser) {
        await createAuditLog(organization.id, "SIGNUP", { email }, user.id, request);
        triggerWebhookEvents(organization.id, "user.signup", { userId: user.id, email, method: "EMAIL" });
      }
      await createAuditLog(organization.id, "LOGIN", { method: "EMAIL" }, user.id, request);
      await createAuditLog(organization.id, "SESSION_CREATE", { sessionId: session.id }, user.id, request);
      triggerWebhookEvents(organization.id, "user.login", { userId: user.id, email, method: "EMAIL" });

      return sendSuccess(reply, {
        sessionToken: token,
        user: { id: user.id, email: user.email, role: user.role },
        org: { id: organization.id, name: organization.name },
        expiresAt: session.expiresAt,
      }, 201);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // ─── OAuth ───────────────────────────────────────────────────

  app.post("/auth/oauth", async (request, reply) => {
    try {
      const { provider, code, redirectUri } = request.body as {
        provider: string;
        code: string;
        redirectUri: string;
      };
      if (!provider || !code) throw new ValidationError("Provider and code are required");

      let email: string;
      let name: string;

      // Real Google OAuth token exchange
      if (provider === "google" && config.oauth.googleClientId && config.oauth.googleClientSecret) {
        const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_id: config.oauth.googleClientId,
            client_secret: config.oauth.googleClientSecret,
            code,
            grant_type: "authorization_code",
            redirect_uri: redirectUri || config.corsOrigin,
          }),
        });
        const tokenData = await tokenRes.json() as any;
        if (tokenData.error) {
          throw new ValidationError("OAuth token exchange failed: " + tokenData.error_description);
        }
        const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        const userData = await userRes.json() as any;
        email = userData.email;
        name = userData.name || email;
      } else {
        // Mock for development
        email = `user_${nanoid(6)}@gmail.com`;
        name = `${provider} User`;
      }

      const organization = await findOrCreateOrg(email, undefined, `${email}'s Org`);
      let user = await findOrCreateUser(organization.id, email);
      const isNewUser = !user.name;
      if (isNewUser) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { name },
        });
      }

      const { token, session } = await createUserSession(user, organization.id);

      if (isNewUser) {
        await createAuditLog(organization.id, "SIGNUP", { email, provider }, user.id, request);
        triggerWebhookEvents(organization.id, "user.signup", { userId: user.id, email, method: `OAUTH_${provider}` });
      }
      await createAuditLog(organization.id, "LOGIN", { method: `OAUTH_${provider}` }, user.id, request);
      triggerWebhookEvents(organization.id, "user.login", { userId: user.id, email, method: `OAUTH_${provider}` });

      return sendSuccess(reply, {
        sessionToken: token,
        user: { id: user.id, email: user.email, role: user.role },
        org: { id: organization.id, name: organization.name },
        expiresAt: session.expiresAt,
      }, 201);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // ─── Wallet / SIWE ──────────────────────────────────────────

  app.post("/auth/wallet", async (request, reply) => {
    try {
      const { address, signature, message } = request.body as {
        address: string;
        signature: string;
        message: string;
      };
      if (!address || !signature) throw new ValidationError("Address and signature are required");
      if (!message) throw new ValidationError("Message is required for signature verification");

      const recoveredAddress = verifyMessage(message, signature);
      if (recoveredAddress.toLowerCase() !== address.toLowerCase()) {
        throw new ValidationError("Signature verification failed - address mismatch");
      }

      const walletEmail = `${address.slice(0, 8)}@wallet.local`;
      const orgName = `${address.slice(0, 8)}'s Org`;

      const organization = await findOrCreateOrg(walletEmail, undefined, orgName);
      let user = await findOrCreateUser(organization.id, walletEmail);
      const isNewUser = user.createdAt.getTime() === user.updatedAt.getTime();

      // Upsert wallet authenticator
      const existingAuth = await prisma.authenticator.findFirst({
        where: { userId: user.id, type: "WALLET" },
      });
      if (existingAuth) {
        await prisma.authenticator.update({
          where: { id: existingAuth.id },
          data: { verified: true },
        });
      } else {
        await prisma.authenticator.create({
          data: {
            userId: user.id,
            type: "WALLET",
            credentialId: address.toLowerCase(),
            verified: true,
          },
        });
      }

      const { token, session } = await createUserSession(user, organization.id);

      if (isNewUser) {
        await createAuditLog(organization.id, "SIGNUP", { address }, user.id, request);
        triggerWebhookEvents(organization.id, "user.signup", { userId: user.id, address, method: "WALLET" });
      }
      await createAuditLog(organization.id, "LOGIN", { method: "WALLET" }, user.id, request);
      triggerWebhookEvents(organization.id, "user.login", { userId: user.id, address, method: "WALLET" });

      return sendSuccess(reply, {
        sessionToken: token,
        user: { id: user.id, role: user.role },
        org: { id: organization.id, name: organization.name },
        expiresAt: session.expiresAt,
      }, 201);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // ─── WebAuthn / Passkey ──────────────────────────────────────

  app.post("/auth/webauthn/register", async (request, reply) => {
    try {
      const { email, orgId } = request.body as { email: string; orgId?: string };
      if (!email) throw new ValidationError("Email is required");

      const options = await generateRegistrationOptions({
        rpName: RP_NAME,
        rpID: RP_ID,
        userName: email,
        userDisplayName: email,
        attestationType: "none",
        authenticatorSelection: {
          residentKey: "preferred",
          userVerification: "preferred",
        },
      });

      const redis = getRedis();
      const challengeKey = `${WEBAUTHN_CHALLENGE_PREFIX}${email}`;
      await redis.setex(challengeKey, 300, options.challenge);

      return sendSuccess(reply, { options });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/auth/webauthn/register/verify", async (request, reply) => {
    try {
      const { email, response, orgId, orgName } = request.body as {
        email: string;
        response: any;
        orgId?: string;
        orgName?: string;
      };
      if (!email || !response) throw new ValidationError("Email and response are required");

      const redis = getRedis();
      const challengeKey = `${WEBAUTHN_CHALLENGE_PREFIX}${email}`;
      const expectedChallenge = await redis.get(challengeKey);
      if (!expectedChallenge) throw new ValidationError("Registration challenge expired or not found");

      const verification = await verifyRegistrationResponse({
        response,
        expectedChallenge,
        expectedOrigin: EXPECTED_ORIGIN,
        expectedRPID: RP_ID,
      });

      if (!verification.verified || !verification.registrationInfo) {
        throw new ValidationError("Passkey registration verification failed");
      }

      await redis.del(challengeKey);

      const { registrationInfo } = verification;

      const organization = await findOrCreateOrg(email, orgId, orgName);
      let user = await findOrCreateUser(organization.id, email);
      const isNewUser = user.createdAt.getTime() === user.updatedAt.getTime();

      await prisma.authenticator.create({
        data: {
          userId: user.id,
          type: "PASSKEY",
          credentialId: registrationInfo.credential.id,
          credentialData: {
            publicKey: Buffer.from(registrationInfo.credential.publicKey).toString("base64url"),
            counter: registrationInfo.credential.counter,
            deviceType: registrationInfo.credentialDeviceType,
            backedUp: registrationInfo.credentialBackedUp,
          },
          verified: true,
        },
      });

      const { token, session } = await createUserSession(user, organization.id);

      if (isNewUser) {
        await createAuditLog(organization.id, "SIGNUP", { email, method: "PASSKEY" }, user.id, request);
        triggerWebhookEvents(organization.id, "user.signup", { userId: user.id, email, method: "PASSKEY" });
      }
      await createAuditLog(organization.id, "LOGIN", { method: "PASSKEY" }, user.id, request);
      await createAuditLog(organization.id, "SESSION_CREATE", { sessionId: session.id }, user.id, request);
      triggerWebhookEvents(organization.id, "user.login", { userId: user.id, email, method: "PASSKEY" });

      return sendSuccess(reply, {
        sessionToken: token,
        user: { id: user.id, email: user.email, role: user.role },
        org: { id: organization.id, name: organization.name },
        expiresAt: session.expiresAt,
      }, 201);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/auth/webauthn/authenticate", async (request, reply) => {
    try {
      const { email, orgId } = request.body as { email: string; orgId?: string };
      if (!email) throw new ValidationError("Email is required");

      const user = await prisma.user.findFirst({ where: { email } });
      if (!user) throw new NotFoundError("User");

      const passkeys = await prisma.authenticator.findMany({
        where: { userId: user.id, type: "PASSKEY", verified: true },
      });

      if (passkeys.length === 0) {
        throw new NotFoundError("Passkey credential");
      }

      const allowCredentials = passkeys.map((pk) => ({
        id: pk.credentialId!,
        type: "public-key" as const,
        transports: (pk.credentialData as any)?.transports || ["internal", "hybrid"],
      }));

      const options = await generateAuthenticationOptions({
        rpID: RP_ID,
        allowCredentials,
        userVerification: "preferred",
      });

      const redis = getRedis();
      const challengeKey = `${WEBAUTHN_CHALLENGE_PREFIX}${email}`;
      await redis.setex(challengeKey, 300, options.challenge);

      return sendSuccess(reply, { options });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/auth/webauthn/authenticate/verify", async (request, reply) => {
    try {
      const { email, response } = request.body as { email: string; response: any };
      if (!email || !response) throw new ValidationError("Email and response are required");

      const redis = getRedis();
      const challengeKey = `${WEBAUTHN_CHALLENGE_PREFIX}${email}`;
      const expectedChallenge = await redis.get(challengeKey);
      if (!expectedChallenge) throw new ValidationError("Authentication challenge expired or not found");

      const user = await prisma.user.findFirst({ where: { email } });
      if (!user) throw new NotFoundError("User");

      const passkeys = await prisma.authenticator.findMany({
        where: { userId: user.id, type: "PASSKEY", verified: true },
      });

      const credentialId = response.id;
      const passkey = passkeys.find((pk) => pk.credentialId === credentialId);
      if (!passkey) throw new ValidationError("Unknown passkey credential");

      const credentialData = passkey.credentialData as any;

      const verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge,
        expectedOrigin: EXPECTED_ORIGIN,
        expectedRPID: RP_ID,
        authenticator: {
          credentialID: Buffer.from(passkey.credentialId!, "base64url"),
          credentialPublicKey: Buffer.from(credentialData.publicKey, "base64url"),
          counter: credentialData.counter || 0,
          transports: credentialData.transports || ["internal", "hybrid"],
        },
      });

      if (!verification.verified) {
        throw new ValidationError("Passkey authentication verification failed");
      }

      await redis.del(challengeKey);

      // Update counter
      if (verification.authenticationInfo) {
        await prisma.authenticator.update({
          where: { id: passkey.id },
          data: {
            credentialData: {
              ...credentialData,
              counter: verification.authenticationInfo.newCounter,
            },
          },
        });
      }

      const organization = await prisma.organization.findUnique({ where: { id: user.orgId } });
      if (!organization) throw new NotFoundError("Organization");

      const { token, session } = await createUserSession(user, organization.id);

      await createAuditLog(organization.id, "LOGIN", { method: "PASSKEY" }, user.id, request);
      await createAuditLog(organization.id, "SESSION_CREATE", { sessionId: session.id }, user.id, request);
      triggerWebhookEvents(organization.id, "user.login", { userId: user.id, email, method: "PASSKEY" });

      return sendSuccess(reply, {
        sessionToken: token,
        user: { id: user.id, email: user.email, role: user.role },
        org: { id: organization.id, name: organization.name },
        expiresAt: session.expiresAt,
      }, 201);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // ─── Password-Based Auth ─────────────────────────────────────

  app.post("/auth/password/signup", async (request, reply) => {
    try {
      const { email, password, orgId, orgName } = request.body as {
        email: string;
        password: string;
        orgId?: string;
        orgName?: string;
      };
      if (!email || !password) throw new ValidationError("Email and password are required");
      if (password.length < 8) throw new ValidationError("Password must be at least 8 characters");

      const existingUser = await prisma.user.findFirst({ where: { email } });
      if (existingUser) {
        const existingPwAuth = await prisma.authenticator.findFirst({
          where: { userId: existingUser.id, type: "PASSWORD" },
        });
        if (existingPwAuth) {
          throw new ValidationError("User already exists with this email");
        }
      }

      const passwordHash = await bcrypt.hash(password, 10);

      const organization = await findOrCreateOrg(email, orgId, orgName);
      let user = existingUser || await findOrCreateUser(organization.id, email);
      const isNewUser = !existingUser;

      await prisma.authenticator.create({
        data: {
          userId: user.id,
          type: "PASSWORD",
          credentialData: { hash: passwordHash },
          verified: true,
        },
      });

      const { token, session } = await createUserSession(user, organization.id);

      if (isNewUser) {
        await createAuditLog(organization.id, "SIGNUP", { email, method: "PASSWORD" }, user.id, request);
        triggerWebhookEvents(organization.id, "user.signup", { userId: user.id, email, method: "PASSWORD" });
      }
      await createAuditLog(organization.id, "LOGIN", { method: "PASSWORD" }, user.id, request);
      await createAuditLog(organization.id, "SESSION_CREATE", { sessionId: session.id }, user.id, request);
      triggerWebhookEvents(organization.id, "user.login", { userId: user.id, email, method: "PASSWORD" });

      return sendSuccess(reply, {
        sessionToken: token,
        user: { id: user.id, email: user.email, role: user.role },
        org: { id: organization.id, name: organization.name },
        expiresAt: session.expiresAt,
      }, 201);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/auth/password/login", async (request, reply) => {
    try {
      const { email, password } = request.body as { email: string; password: string };
      if (!email || !password) throw new ValidationError("Email and password are required");

      const user = await prisma.user.findFirst({ where: { email } });
      if (!user) throw new ValidationError("Invalid email or password");

      const pwAuth = await prisma.authenticator.findFirst({
        where: { userId: user.id, type: "PASSWORD", verified: true },
      });
      if (!pwAuth || !pwAuth.credentialData) {
        throw new ValidationError("Invalid email or password");
      }

      const credentialData = pwAuth.credentialData as { hash: string };
      const valid = await bcrypt.compare(password, credentialData.hash);
      if (!valid) {
        throw new ValidationError("Invalid email or password");
      }

      const organization = await prisma.organization.findUnique({ where: { id: user.orgId } });
      if (!organization) throw new NotFoundError("Organization");

      const { token, session } = await createUserSession(user, organization.id);

      await createAuditLog(organization.id, "LOGIN", { method: "PASSWORD" }, user.id, request);
      await createAuditLog(organization.id, "SESSION_CREATE", { sessionId: session.id }, user.id, request);
      triggerWebhookEvents(organization.id, "user.login", { userId: user.id, email, method: "PASSWORD" });

      return sendSuccess(reply, {
        sessionToken: token,
        user: { id: user.id, email: user.email, role: user.role },
        org: { id: organization.id, name: organization.name },
        expiresAt: session.expiresAt,
      }, 201);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // ─── Phone / SMS OTP ─────────────────────────────────────────

  app.post("/auth/phone/send", async (request, reply) => {
    try {
      const { phone, orgId } = request.body as { phone: string; orgId?: string };
      if (!phone) throw new ValidationError("Phone number is required");

      const redis = getRedis();
      await checkOtpRateLimit(redis, "phone", phone);

      const otp = generateOtp();
      const key = `${OTP_PREFIX}${phone}`;
      await redis.setex(key, config.otpExpirySeconds, otp);

      // Send SMS via Twilio if configured
      if (config.twilio.accountSid && config.twilio.authToken) {
        const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${config.twilio.accountSid}/Messages.json`;
        const auth = Buffer.from(`${config.twilio.accountSid}:${config.twilio.authToken}`).toString("base64");
        await fetch(twilioUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Basic ${auth}`,
          },
          body: new URLSearchParams({
            To: phone,
            From: config.twilio.phoneNumber,
            Body: `ArKey verification code: ${otp}`,
          }),
        }).catch(() => {});
      }
      console.log(`[DEV] OTP for phone ${phone}: ${otp}`);

      return sendSuccess(reply, {
        message: "OTP sent",
        expiresIn: config.otpExpirySeconds,
        otp: process.env.NODE_ENV === "development" ? otp : undefined,
      });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/auth/phone/verify", async (request, reply) => {
    try {
      const { phone, otp, orgId, orgName } = request.body as {
        phone: string;
        otp: string;
        orgId?: string;
        orgName?: string;
      };
      if (!phone || !otp) throw new ValidationError("Phone and OTP are required");

      const redis = getRedis();
      const key = `${OTP_PREFIX}${phone}`;
      const storedOtp = await redis.get(key);

      if (!storedOtp || storedOtp !== otp) {
        throw new ValidationError("Invalid or expired OTP");
      }

      await redis.del(key);

      const phoneEmail = `${phone.replace(/[^0-9]/g, "")}@phone.local`;
      const organization = await findOrCreateOrg(phoneEmail, orgId, orgName);
      let user = await prisma.user.findFirst({
        where: { orgId: organization.id, phone },
      });
      if (!user) {
        user = await prisma.user.create({
          data: { orgId: organization.id, email: phoneEmail, phone, role: "DEVELOPER" },
        });
        await createAuditLog(organization.id, "SIGNUP", { phone }, user.id, request);
        triggerWebhookEvents(organization.id, "user.signup", { userId: user.id, phone, method: "PHONE" });
      }

      // Upsert phone authenticator
      const existingAuth = await prisma.authenticator.findFirst({
        where: { userId: user.id, type: "PHONE" },
      });
      if (existingAuth) {
        await prisma.authenticator.update({
          where: { id: existingAuth.id },
          data: { verified: true },
        });
      } else {
        await prisma.authenticator.create({
          data: { userId: user.id, type: "PHONE", verified: true },
        });
      }

      const { token, session } = await createUserSession(user, organization.id);

      await createAuditLog(organization.id, "LOGIN", { method: "PHONE" }, user.id, request);
      await createAuditLog(organization.id, "SESSION_CREATE", { sessionId: session.id }, user.id, request);
      triggerWebhookEvents(organization.id, "user.login", { userId: user.id, phone, method: "PHONE" });

      return sendSuccess(reply, {
        sessionToken: token,
        user: { id: user.id, email: user.email, phone: user.phone, role: user.role },
        org: { id: organization.id, name: organization.name },
        expiresAt: session.expiresAt,
      }, 201);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // ─── Logout ──────────────────────────────────────────────────

  app.post("/auth/logout", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const authHeader = request.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        throw new ValidationError("Bearer token required");
      }
      const token = authHeader.slice(7);

      const deleted = await prisma.session.deleteMany({ where: { token } });
      if (deleted.count === 0) {
        throw new NotFoundError("Session");
      }

      await createAuditLog(request.orgId, "LOGOUT", { token }, request.userId, request);

      return sendSuccess(reply, { message: "Logged out successfully" });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // ─── Session Management ──────────────────────────────────────

  app.get("/sessions", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { limit, offset } = parsePagination(request.query as { limit?: string; offset?: string });
      const [sessions, total] = await Promise.all([
        prisma.session.findMany({
          where: { userId: request.userId, expiresAt: { gt: new Date() } },
          select: { id: true, type: true, createdAt: true, expiresAt: true },
          orderBy: { createdAt: "desc" },
          take: limit,
          skip: offset,
        }),
        prisma.session.count({ where: { userId: request.userId, expiresAt: { gt: new Date() } } }),
      ]);
      return sendSuccess(reply, { sessions, total, limit, offset });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/sessions/refresh", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { signToken } = await import("../../utils/jwt.js");
      const token = signToken({
        sub: request.userId!,
        orgId: request.orgId,
        role: request.auth.role,
      });

      const session = await prisma.session.create({
        data: {
          userId: request.userId!,
          token,
          type: "READ_WRITE",
          expiresAt: new Date(Date.now() + config.sessionExpirySeconds * 1000),
        },
      });

      await createAuditLog(request.orgId, "SESSION_REFRESH", { sessionId: session.id }, request.userId, request);

      return sendSuccess(reply, { sessionToken: token, expiresAt: session.expiresAt });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.delete("/sessions/:id", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      await prisma.session.deleteMany({
        where: { id, userId: request.userId },
      });
      await createAuditLog(request.orgId, "LOGOUT", { sessionId: id }, request.userId, request);
      return sendSuccess(reply, { message: "Session revoked" });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // ─── API Keys ────────────────────────────────────────────────

  app.post("/api-keys", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { name, permissions, allowedIps } = request.body as {
        name: string;
        permissions?: string[];
        allowedIps?: string[];
      };
      if (!name) throw new ValidationError("Name is required");

      const { generateRandomToken, hashSha256 } = await import("../../utils/crypto.js");
      const rawKey = `arkey_${generateRandomToken()}`;
      const keyHash = hashSha256(rawKey);
      const keyPrefix = rawKey.slice(0, 12);

      const apiKey = await prisma.apiKey.create({
        data: {
          orgId: request.orgId,
          name,
          keyHash,
          keyPrefix,
          permissions: permissions || ["*"],
          allowedIps: allowedIps || [],
          expiresAt: new Date(Date.now() + config.apiKeyExpiryDays * 86400 * 1000),
        },
      });

      await createAuditLog(request.orgId, "API_KEY_CREATE", { keyId: apiKey.id, name }, request.userId, request);

      // Return the raw key only once
      return sendSuccess(reply, {
        id: apiKey.id,
        name: apiKey.name,
        key: rawKey,
        keyPrefix,
        permissions: apiKey.permissions,
        expiresAt: apiKey.expiresAt,
      }, 201);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get("/api-keys", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { limit, offset } = parsePagination(request.query as { limit?: string; offset?: string });
      const [keys, total] = await Promise.all([
        prisma.apiKey.findMany({
          where: { orgId: request.orgId },
          select: { id: true, name: true, keyPrefix: true, permissions: true, allowedIps: true, createdAt: true, expiresAt: true },
          orderBy: { createdAt: "desc" },
          take: limit,
          skip: offset,
        }),
        prisma.apiKey.count({ where: { orgId: request.orgId } }),
      ]);
      return sendSuccess(reply, { keys, total, limit, offset });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.delete("/api-keys/:id", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      await prisma.apiKey.deleteMany({ where: { id, orgId: request.orgId } });
      await createAuditLog(request.orgId, "API_KEY_DELETE", { keyId: id }, request.userId, request);
      return sendSuccess(reply, { message: "API key deleted" });
    } catch (err) {
      return sendError(reply, err);
    }
  });
}
