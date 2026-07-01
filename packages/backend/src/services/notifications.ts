import { createTransport } from "nodemailer";
import prisma from "../db.js";
import { config } from "../config.js";

async function getBranding(orgId: string) {
  try {
    const row = await prisma.orgConfig.findUnique({ where: { orgId } });
    const oc = (row?.config as any) || {};
    return { appName: oc.appName || "Wrankey", appLogo: oc.appLogo || "" };
  } catch {
    return { appName: "Wrankey", appLogo: "" };
  }
}

async function getOrgAdmins(orgId: string): Promise<string[]> {
  const admins = await prisma.user.findMany({
    where: { orgId, role: "ORG_ADMIN" },
    select: { email: true },
  });
  return admins.map((u) => u.email).filter(Boolean) as string[];
}

async function sendEmail(to: string, subject: string, html: string, orgId: string) {
  if (!config.smtp.host || !config.smtp.user || !config.smtp.pass) return;

  try {
    const branding = await getBranding(orgId);
    const isSecure = config.smtp.port === 465;
    const transporter = createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: isSecure,
      auth: { user: config.smtp.user, pass: config.smtp.pass },
      tls: { rejectUnauthorized: !config.isDev },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });

    const fromAddress = config.smtp.from.includes("@")
      ? `"${branding.appName}" <${config.smtp.from}>`
      : `"${branding.appName}" <${config.smtp.user}>`;

    const logoHtml = branding.appLogo
      ? `<img src="${branding.appLogo}" alt="${branding.appName}" style="max-height:40px;margin-bottom:16px;" />`
      : "";

    await transporter.sendMail({
      from: fromAddress,
      to,
      subject,
      html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">
        ${logoHtml}
        <h2 style="color:#1e3a8a;">${branding.appName}</h2>
        ${html}
        <hr style="border:0;border-top:1px solid #e2e8f0;margin:24px 0;" />
        <p style="color:#64748b;font-size:12px;">This is an automated notification from ${branding.appName}. You received this because you are an organization admin.</p>
      </div>`,
    });
  } catch (err: any) {
    console.error("[Notifications] Failed to send email:", err.message);
  }
}

export async function notifyLargeTransaction(
  orgId: string,
  txHash: string,
  value: string,
  chain: string,
  to: string,
) {
  const admins = await getOrgAdmins(orgId);
  if (admins.length === 0) return;

  const subject = `Large Transaction Alert — ${value} on ${chain}`;
  const html = `<p>A large transaction has been submitted on your ${chain} wallet:</p>
    <table style="border-collapse:collapse;width:100%;margin:16px 0;">
      <tr><td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:600;background:#f8fafc;">Tx Hash</td><td style="padding:8px 12px;border:1px solid #e2e8f0;font-family:monospace;font-size:12px;">${txHash}</td></tr>
      <tr><td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:600;background:#f8fafc;">Value</td><td style="padding:8px 12px;border:1px solid #e2e8f0;">${value}</td></tr>
      <tr><td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:600;background:#f8fafc;">Chain</td><td style="padding:8px 12px;border:1px solid #e2e8f0;">${chain}</td></tr>
      <tr><td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:600;background:#f8fafc;">To</td><td style="padding:8px 12px;border:1px solid #e2e8f0;font-family:monospace;font-size:12px;">${to}</td></tr>
    </table>`;

  await Promise.all(admins.map((email) => sendEmail(email, subject, html, orgId)));
}

export async function notifyTransactionFailed(
  orgId: string,
  txHash: string,
  reason: string,
  chain: string,
) {
  const admins = await getOrgAdmins(orgId);
  if (admins.length === 0) return;

  const subject = `Transaction Failed on ${chain}`;
  const html = `<p>A transaction on your ${chain} wallet has failed:</p>
    <table style="border-collapse:collapse;width:100%;margin:16px 0;">
      <tr><td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:600;background:#f8fafc;">Tx Hash</td><td style="padding:8px 12px;border:1px solid #e2e8f0;font-family:monospace;font-size:12px;">${txHash}</td></tr>
      <tr><td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:600;background:#f8fafc;">Reason</td><td style="padding:8px 12px;border:1px solid #e2e8f0;color:#dc2626;">${reason}</td></tr>
    </table>`;

  await Promise.all(admins.map((email) => sendEmail(email, subject, html, orgId)));
}

export async function notifyPolicyDenial(
  orgId: string,
  policyName: string,
  to: string,
  value: string,
  chain: string,
) {
  const admins = await getOrgAdmins(orgId);
  if (admins.length === 0) return;

  const subject = `Policy "${policyName}" Blocked a Transaction`;
  const html = `<p>A policy has blocked a transaction on your ${chain} wallet:</p>
    <table style="border-collapse:collapse;width:100%;margin:16px 0;">
      <tr><td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:600;background:#f8fafc;">Policy</td><td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:600;color:#dc2626;">${policyName}</td></tr>
      <tr><td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:600;background:#f8fafc;">To</td><td style="padding:8px 12px;border:1px solid #e2e8f0;font-family:monospace;font-size:12px;">${to}</td></tr>
      <tr><td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:600;background:#f8fafc;">Value</td><td style="padding:8px 12px;border:1px solid #e2e8f0;">${value}</td></tr>
      <tr><td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:600;background:#f8fafc;">Chain</td><td style="padding:8px 12px;border:1px solid #e2e8f0;">${chain}</td></tr>
    </table>`;

  await Promise.all(admins.map((email) => sendEmail(email, subject, html, orgId)));
}

export async function notifyAgentCreated(
  orgId: string,
  agentName: string,
  agentId: string,
) {
  const admins = await getOrgAdmins(orgId);
  if (admins.length === 0) return;

  const subject = `New AI Agent Created — ${agentName}`;
  const html = `<p>A new AI agent has been created in your organization:</p>
    <table style="border-collapse:collapse;width:100%;margin:16px 0;">
      <tr><td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:600;background:#f8fafc;">Agent</td><td style="padding:8px 12px;border:1px solid #e2e8f0;">${agentName}</td></tr>
      <tr><td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:600;background:#f8fafc;">ID</td><td style="padding:8px 12px;border:1px solid #e2e8f0;font-family:monospace;font-size:12px;">${agentId}</td></tr>
    </table>`;

  await Promise.all(admins.map((email) => sendEmail(email, subject, html, orgId)));
}

export async function notifyWalletCreated(
  orgId: string,
  walletName: string,
  walletId: string,
) {
  const admins = await getOrgAdmins(orgId);
  if (admins.length === 0) return;

  const subject = `New Wallet Created — ${walletName}`;
  const html = `<p>A new wallet has been created in your organization:</p>
    <table style="border-collapse:collapse;width:100%;margin:16px 0;">
      <tr><td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:600;background:#f8fafc;">Wallet</td><td style="padding:8px 12px;border:1px solid #e2e8f0;">${walletName}</td></tr>
      <tr><td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:600;background:#f8fafc;">ID</td><td style="padding:8px 12px;border:1px solid #e2e8f0;font-family:monospace;font-size:12px;">${walletId}</td></tr>
    </table>`;

  await Promise.all(admins.map((email) => sendEmail(email, subject, html, orgId)));
}

export async function notifySpendingLimitExceeded(
  orgId: string,
  walletName: string,
  limitType: string,
  currentUsage: string,
  maxLimit: string,
) {
  const admins = await getOrgAdmins(orgId);
  if (admins.length === 0) return;

  const subject = `Spending Limit Exceeded — ${walletName}`;
  const html = `<p>A spending limit has been exceeded for wallet <strong>${walletName}</strong>:</p>
    <table style="border-collapse:collapse;width:100%;margin:16px 0;">
      <tr><td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:600;background:#f8fafc;">Limit Type</td><td style="padding:8px 12px;border:1px solid #e2e8f0;color:#dc2626;">${limitType}</td></tr>
      <tr><td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:600;background:#f8fafc;">Current Usage</td><td style="padding:8px 12px;border:1px solid #e2e8f0;">${currentUsage}</td></tr>
      <tr><td style="padding:8px 12px;border:1px solid #e2e8f0;font-weight:600;background:#f8fafc;">Max Limit</td><td style="padding:8px 12px;border:1px solid #e2e8f0;">${maxLimit}</td></tr>
    </table>`;

  await Promise.all(admins.map((email) => sendEmail(email, subject, html, orgId)));
}
