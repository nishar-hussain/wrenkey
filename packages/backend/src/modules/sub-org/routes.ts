import { FastifyInstance } from "fastify";
import prisma from "../../db.js";
import { authMiddleware, adminMiddleware } from "../../middleware/auth.js";
import { sendSuccess, sendError, ValidationError, NotFoundError, ForbiddenError } from "../../utils/errors.js";
import { createAuditLog } from "../../utils/audit.js";
import { parsePagination } from "../../utils/pagination.js";
import { signToken } from "../../utils/jwt.js";
import { config } from "../../config.js";
import { provisionSubOrgWallet } from "../../services/sub-org-wallet.js";

async function verifyParentOrg(request: any, subOrgId: string): Promise<any> {
  const subOrg = await prisma.organization.findFirst({ where: { id: subOrgId, parentOrgId: request.orgId } });
  if (!subOrg) throw new NotFoundError("Sub-organization not found or not a child of your organization");
  return subOrg;
}

export async function subOrgRoutes(app: FastifyInstance) {
  // List sub-orgs
  app.get("/sub-orgs", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { limit, offset } = parsePagination(request.query as { limit?: string; offset?: string });
      const [data, total] = await Promise.all([
        prisma.organization.findMany({
          where: { parentOrgId: request.orgId },
          include: { _count: { select: { users: true, wallets: true } } },
          orderBy: { createdAt: "desc" }, take: limit, skip: offset,
        }),
        prisma.organization.count({ where: { parentOrgId: request.orgId } }),
      ]);

      const result = await Promise.all(data.map(async org => ({
        id: org.id, name: org.name,
        rootUserId: "", rootUserEmail: "",
        userCount: org._count.users, walletCount: org._count.wallets,
        createdAt: org.createdAt,
      })));

      if (data.length > 0) {
        const rootUsers = await prisma.user.findMany({
          where: { orgId: { in: data.map(o => o.id) }, role: "ORG_ADMIN" },
          select: { id: true, email: true, orgId: true },
        });
        const rootMap = new Map(rootUsers.map(u => [u.orgId, u]));
        for (const org of result) {
          const root = rootMap.get(org.id);
          if (root) { org.rootUserId = root.id; org.rootUserEmail = root.email || ""; }
        }
      }

      return sendSuccess(reply, { data: result, total, limit, offset });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Create sub-org
  app.post("/sub-orgs", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { name, rootUserEmail } = request.body as { name: string; rootUserEmail?: string };
      if (!name || !name.trim()) throw new ValidationError("Sub-organization name required");
      const isApiKey = request.auth.type === "api_key";
      if (request.auth.role !== "ORG_ADMIN" && !isApiKey) throw new ForbiddenError("Only org admins can create sub-organizations");

      const subOrg = await prisma.organization.create({
        data: { name: name.trim(), parentOrgId: request.orgId },
      });

      let rootUser: any = null;
      if (rootUserEmail) {
        // If a user with this email already exists anywhere (unique constraint),
        // append a suffix so sub-org provisioning doesn't fail on duplicates.
        const existing = await prisma.user.findUnique({
          where: { email: rootUserEmail },
          select: { id: true },
        });
        const email = existing
          ? `${rootUserEmail.split("@")[0]}+${subOrg.name.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()}@${rootUserEmail.split("@")[1]}`
          : rootUserEmail;

        rootUser = await prisma.user.create({
          data: { orgId: subOrg.id, email, role: "ORG_ADMIN", name: rootUserEmail.split("@")[0] },
        });
        // Send invitation if SMTP configured
        if (config.smtp.host && config.smtp.user && config.smtp.pass) {
          try {
            const { randomBytes } = await import("crypto");
            const { getRedis } = await import("../../redis.js");
            const { createTransport } = await import("nodemailer");
            const redis = getRedis();
            const inviteToken = randomBytes(32).toString("hex");
            await redis.setex(`invite:${inviteToken}`, 7 * 24 * 3600, JSON.stringify({ userId: rootUser.id, email: rootUserEmail, orgId: subOrg.id, orgName: subOrg.name }));
            const baseUrl = config.corsOrigin[0] || "http://localhost:5173";
            const transport = createTransport({ host: config.smtp.host, port: config.smtp.port, secure: config.smtp.port === 465, auth: { user: config.smtp.user, pass: config.smtp.pass }, tls: { rejectUnauthorized: !config.isDev } });
            await transport.sendMail({
              from: config.smtp.from, to: rootUserEmail,
              subject: `You've been invited to ${subOrg.name}`,
              text: `Accept: ${baseUrl}/accept-invitation?token=${inviteToken}`,
              html: `<p>You've been invited to join <strong>${subOrg.name}</strong>.</p><p><a href="${baseUrl}/accept-invitation?token=${inviteToken}">Accept Invitation</a></p>`,
            });
          } catch { /* email optional */ }
        }

        // Auto-provision an embedded wallet for the sub-org's root user.
        // Generates a BIP-39 HD wallet and derives EVM + Stellar accounts.
        let provisionedWallet: any = null;
        try {
          provisionedWallet = await provisionSubOrgWallet(subOrg.id, rootUser.id, `${name.trim()} Wallet`);
        } catch (e) {
          console.error("[SubOrg] Wallet provisioning failed:", e instanceof Error ? e.message : e);
        }

        await createAuditLog(request.orgId, "SUBORG_CREATE", { subOrgId: subOrg.id, name, parentOrgId: request.orgId, walletId: provisionedWallet?.walletId, walletAddresses: provisionedWallet?.accounts?.map((a: any) => ({ chainId: a.chainId, address: a.address })) }, request.userId, request);
        return sendSuccess(reply, {
          ...subOrg,
          rootUserId: rootUser?.id,
          rootUserEmail: rootUser?.email,
          wallet: provisionedWallet ? {
            walletId: provisionedWallet.walletId,
            name: provisionedWallet.name,
            accounts: provisionedWallet.accounts,
          } : null,
        }, 201);
      }

      await createAuditLog(request.orgId, "SUBORG_CREATE", { subOrgId: subOrg.id, name, parentOrgId: request.orgId }, request.userId, request);
      return sendSuccess(reply, { ...subOrg, rootUserId: null, rootUserEmail: null, wallet: null }, 201);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Sub-org settings/detail
  app.get("/sub-orgs/:id/settings", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const subOrg = await verifyParentOrg(request, id);
      const [rootUser, userCount, walletCount, policyCount, privateKeyCount, activityCount, wallets] = await Promise.all([
        prisma.user.findFirst({ where: { orgId: id, role: "ORG_ADMIN" }, select: { id: true, email: true, name: true } }),
        prisma.user.count({ where: { orgId: id } }),
        prisma.wallet.count({ where: { orgId: id } }),
        prisma.policy.count({ where: { orgId: id } }),
        prisma.privateKey.count({ where: { orgId: id } }),
        prisma.auditLog.count({ where: { orgId: id } }),
        prisma.wallet.findMany({
          where: { orgId: id },
          include: { accounts: { select: { id: true, chainId: true, address: true, derivationPath: true, index: true } } },
          orderBy: { createdAt: "asc" },
        }),
      ]);
      return sendSuccess(reply, {
        id: subOrg.id, name: subOrg.name, createdAt: subOrg.createdAt,
        rootUser: rootUser || null,
        userCount, walletCount, policyCount, privateKeyCount, activityCount,
        parentOrgId: subOrg.parentOrgId,
        wallets: wallets.map(w => ({
          walletId: w.id,
          name: w.name,
          status: w.status,
          tags: w.tags,
          accounts: w.accounts,
        })),
      });
    } catch (err) { return sendError(reply, err); }
  });

  // List sub-org's wallets
  app.get("/sub-orgs/:id/wallets", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      await verifyParentOrg(request, id);
      const { limit, offset } = parsePagination(request.query as { limit?: string; offset?: string });
      const [data, total] = await Promise.all([
        prisma.wallet.findMany({ where: { orgId: id }, orderBy: { createdAt: "desc" }, take: limit, skip: offset, select: { id: true, name: true, ownerType: true, status: true, tags: true, createdAt: true, _count: { select: { accounts: true } } } }),
        prisma.wallet.count({ where: { orgId: id } }),
      ]);
      return sendSuccess(reply, { data, total, limit, offset });
    } catch (err) { return sendError(reply, err); }
  });

  // List sub-org's users
  app.get("/sub-orgs/:id/users", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      await verifyParentOrg(request, id);
      const { limit, offset } = parsePagination(request.query as { limit?: string; offset?: string });
      const [data, total] = await Promise.all([
        prisma.user.findMany({ where: { orgId: id }, orderBy: { createdAt: "desc" }, take: limit, skip: offset, select: { id: true, name: true, email: true, role: true, tags: true, createdAt: true, _count: { select: { sessions: true } } } }),
        prisma.user.count({ where: { orgId: id } }),
      ]);
      return sendSuccess(reply, { data, total, limit, offset });
    } catch (err) { return sendError(reply, err); }
  });

  // List sub-org's policies
  app.get("/sub-orgs/:id/policies", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      await verifyParentOrg(request, id);
      const { limit, offset } = parsePagination(request.query as { limit?: string; offset?: string });
      const [data, total] = await Promise.all([
        prisma.policy.findMany({ where: { orgId: id }, orderBy: { priority: "desc" }, take: limit, skip: offset }),
        prisma.policy.count({ where: { orgId: id } }),
      ]);
      return sendSuccess(reply, { data, total, limit, offset });
    } catch (err) { return sendError(reply, err); }
  });

  // List sub-org's private keys
  app.get("/sub-orgs/:id/private-keys", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      await verifyParentOrg(request, id);
      const { limit, offset } = parsePagination(request.query as { limit?: string; offset?: string });
      const [data, total] = await Promise.all([
        prisma.privateKey.findMany({
          where: { orgId: id },
          orderBy: { createdAt: "desc" },
          take: limit, skip: offset,
          select: {
            id: true, name: true, curve: true, tags: true, exported: true,
            publicKey: true, derivationIndex: true, status: true,
            walletId: true, createdAt: true,
            addresses: { select: { chainId: true, address: true } },
          },
        }),
        prisma.privateKey.count({ where: { orgId: id } }),
      ]);
      return sendSuccess(reply, { data, total, limit, offset });
    } catch (err) { return sendError(reply, err); }
  });

  // List sub-org's activities (audit logs)
  app.get("/sub-orgs/:id/activities", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      await verifyParentOrg(request, id);
      const { limit, offset } = parsePagination(request.query as { limit?: string; offset?: string });
      const [data, total] = await Promise.all([
        prisma.auditLog.findMany({
          where: { orgId: id },
          orderBy: { createdAt: "desc" },
          take: limit, skip: offset,
          select: {
            id: true, action: true, resource: true, details: true,
            userId: true, ip: true, createdAt: true,
            user: { select: { id: true, email: true, name: true } },
          },
        }),
        prisma.auditLog.count({ where: { orgId: id } }),
      ]);
      return sendSuccess(reply, { data, total, limit, offset });
    } catch (err) { return sendError(reply, err); }
  });

  // Impersonate — generate session token for sub-org
  app.post("/sub-orgs/:id/impersonate", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      await verifyParentOrg(request, id);

      let rootUser = await prisma.user.findFirst({ where: { orgId: id, role: "ORG_ADMIN" } });
      if (!rootUser) {
        rootUser = await prisma.user.findFirst({ where: { orgId: id } });
      }
      if (!rootUser) {
        throw new ValidationError("Sub-org has no users — cannot impersonate. Invite a user to the sub-org first.");
      }

      const token = signToken({ sub: rootUser.id, orgId: id, role: "ORG_ADMIN" });
      const session = await prisma.session.create({
        data: { userId: rootUser.id, token, type: "READ_WRITE", expiresAt: new Date(Date.now() + config.sessionExpirySeconds * 1000) },
      });

      await createAuditLog(request.orgId, "SUBORG_IMPERSONATE", { subOrgId: id }, request.userId, request);

      return sendSuccess(reply, {
        sessionToken: token,
        user: { id: rootUser.id, email: rootUser.email, role: rootUser.role },
        org: { id, name: (await prisma.organization.findUnique({ where: { id }, select: { name: true } }))?.name || "" },
        impersonating: true,
        expiresAt: session.expiresAt,
      });
    } catch (err) { return sendError(reply, err); }
  });

  // Rename sub-org
  app.patch("/sub-orgs/:id", { preHandler: [authMiddleware, adminMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { name } = request.body as { name?: string };
      if (!name) throw new ValidationError("Name required");
      await verifyParentOrg(request, id);
      const updated = await prisma.organization.update({ where: { id }, data: { name } });
      await createAuditLog(request.orgId, "SUBORG_UPDATE", { subOrgId: id, name }, request.userId, request);
      return sendSuccess(reply, updated);
    } catch (err) { return sendError(reply, err); }
  });

  // Delete sub-org
  app.delete("/sub-orgs/:id", { preHandler: [authMiddleware, adminMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      await verifyParentOrg(request, id);

      // Prevent orphaning: check if this sub-org has its own children
      const childCount = await prisma.organization.count({ where: { parentOrgId: id } });
      if (childCount > 0) {
        throw new ValidationError(`Cannot delete a sub-organization that has ${childCount} child organization(s). Delete those first.`);
      }

      await prisma.organization.delete({ where: { id } });
      await createAuditLog(request.orgId, "SUBORG_DELETE", { subOrgId: id }, request.userId, request);
      return sendSuccess(reply, { message: "Sub-organization deleted" });
    } catch (err) { return sendError(reply, err); }
  });

  // Sign a message using a sub-org's wallet (for embedded wallet flows like Bullet).
  // Accepts X-Api-Key auth (API keys from the parent org can sign for sub-orgs).
  app.post("/sub-orgs/:id/sign-message", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { message, chain } = request.body as { message: string; chain?: string };

      if (!message) throw new ValidationError("Message required");

      // API key from parent org can sign for child sub-orgs
      const subOrg = request.auth.type === "api_key"
        ? await prisma.organization.findFirst({ where: { id, parentOrgId: request.orgId } })
        : await verifyParentOrg(request, id);

      if (!subOrg) throw new NotFoundError("Sub-organization not found or not a child of your organization");

      // Find the wallet provisioned for this sub-org
      const wallet = await prisma.wallet.findFirst({
        where: { orgId: id },
        orderBy: { createdAt: "asc" },
      });
      if (!wallet) throw new NotFoundError("No wallet found in sub-organization");

      // Find the Stellar account
      const account = await prisma.walletAccount.findFirst({
        where: { walletId: wallet.id, address: { startsWith: "G" } },
      });
      if (!account) throw new NotFoundError("No Stellar account found in sub-org wallet");

      // Decrypt wallet seed and derive Stellar keypair, then sign
      const { decryptSeedFromStorage } = await import("../../utils/enclave.js");
      const { deriveStellarAccount, signStellarMessage } = await import("../../utils/stellar.js");
      const { getChainByName } = await import("../../services/chain.js");

      const mnemonic = decryptSeedFromStorage(wallet.encryptedSeed);
      const chainInfo = await getChainByName(chain || "stellar-testnet");
      const stellarAccount = deriveStellarAccount(mnemonic, 0, chainInfo.derivationPath);
      const signature = signStellarMessage(stellarAccount.secret, message);

      await createAuditLog(
        request.orgId,
        "WALLET_SIGN_MESSAGE",
        { subOrgId: id, walletId: wallet.id, address: account.address },
        request.userId,
        request,
      );

      return sendSuccess(reply, {
        signature,
        address: account.address,
      });
    } catch (err) { return sendError(reply, err); }
  });
}
