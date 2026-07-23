import { createTransport, type Transporter } from "nodemailer";
import { config } from "../config.js";

let cachedTransporter: Transporter | null = null;

export function getEmailTransporter(): Transporter | null {
  if (!config.smtp.host || !config.smtp.user || !config.smtp.pass) {
    return null;
  }

  if (cachedTransporter) {
    return cachedTransporter;
  }

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

  cachedTransporter = transporter;
  return transporter;
}

export function getFromAddress(appName: string = "WranKey"): string {
  const from = config.smtp.from.includes("@")
    ? config.smtp.from
    : config.smtp.user;
  return `"${appName}" <${from}>`;
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  text?: string;
  html: string;
  appName?: string;
}): Promise<{ sent: boolean; error?: string }> {
  const transporter = getEmailTransporter();
  if (!transporter) {
    return { sent: false, error: "SMTP not configured" };
  }

  try {
    const info = await transporter.sendMail({
      from: getFromAddress(opts.appName),
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    });
    console.log(`[EMAIL] Sent to ${opts.to}, messageId: ${info.messageId}`);
    return { sent: true };
  } catch (err: any) {
    console.error(`[EMAIL] Failed to send to ${opts.to}:`, {
      message: err.message,
      code: err.code,
      responseCode: err.responseCode,
      response: err.response,
      command: err.command,
    });
    return { sent: false, error: err.message || "Unknown SMTP error" };
  }
}
