import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

export const config = {
  port: parseInt(process.env.PORT || "3001", 10),
  host: process.env.HOST || "0.0.0.0",
  databaseUrl: process.env.DATABASE_URL || "",
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
  jwtSecret: process.env.JWT_SECRET || "dev-secret",
  encryptionKey: process.env.ENCRYPTION_KEY || "dev-encryption-key-32characters",
  arcRpcUrl: process.env.ARC_RPC_URL || "https://rpc.arc.network",
  arcChainId: parseInt(process.env.ARC_CHAIN_ID || "1234", 10),
  sessionExpirySeconds: parseInt(process.env.SESSION_EXPIRY_SECONDS || "3600", 10),
  apiKeyExpiryDays: parseInt(process.env.API_KEY_EXPIRY_DAYS || "365", 10),
  otpExpirySeconds: parseInt(process.env.OTP_EXPIRY_SECONDS || "300", 10),
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:5173",
  smtp: {
    host: process.env.SMTP_HOST || "",
    port: parseInt(process.env.SMTP_PORT || "587", 10),
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.FROM_EMAIL || "no-reply@wrankey.io",
  },
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID || "",
    authToken: process.env.TWILIO_AUTH_TOKEN || "",
    phoneNumber: process.env.TWILIO_PHONE_NUMBER || "",
  },
  oauth: {
    googleClientId: process.env.OAUTH_GOOGLE_CLIENT_ID || "",
    googleClientSecret: process.env.OAUTH_GOOGLE_CLIENT_SECRET || "",
  },
  webhookHmacSecret: process.env.WEBHOOK_HMAC_SECRET || "dev-webhook-secret",
  gasSponsorship: {
    enabled: process.env.GAS_SPONSORSHIP_ENABLED === "true",
    maxSponsorAmount: process.env.GAS_SPONSORSHIP_MAX_AMOUNT || "0.01",
    sponsorWalletId: process.env.GAS_SPONSORSHIP_WALLET_ID || "",
  },
};
