import { FastifyInstance } from "fastify";
import prisma from "../../db.js";
import { authMiddleware } from "../../middleware/auth.js";
import { sendSuccess, sendError, ValidationError, NotFoundError } from "../../utils/errors.js";
import { createAuditLog } from "../../utils/audit.js";
import { parsePagination } from "../../utils/pagination.js";
import { getChainByName, getDefaultChain } from "../../services/chain.js";
import {
  decryptSeedFromStorage,
  deriveAccount,
  encryptSeedForStorage,
} from "../../utils/enclave.js";

export async function privateKeyRoutes(app: FastifyInstance) {

  app.post("/private-keys", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { walletId, name, chain } = request.body as { walletId: string; name: string; chain?: string };
      if (!walletId || !name) throw new ValidationError("walletId and name are required");

      const wallet = await prisma.wallet.findFirst({
        where: { id: walletId, orgId: request.orgId },
      });
      if (!wallet) throw new NotFoundError("Wallet");

      const chainInfo = chain ? (await getChainByName(chain).catch(() => null)) || await getDefaultChain() : await getDefaultChain();
      if (!chainInfo) throw new ValidationError("No active chain found");

      const mnemonic = decryptSeedFromStorage(wallet.encryptedSeed);
      const count = await prisma.privateKey.count({ where: { walletId } });
      const fullPath = `${chainInfo.derivationPath}/${count}`;
      const hdNode = deriveAccount(mnemonic, count, chainInfo.derivationPath);
      const encryptedPk = encryptSeedForStorage(hdNode.privateKey);

      const privateKey = await prisma.privateKey.create({
        data: {
          orgId: request.orgId,
          walletId,
          name,
          encryptedPrivateKey: encryptedPk,
          publicKey: hdNode.address,
          addresses: {
            create: {
              chainId: chainInfo.id,
              address: hdNode.address,
            },
          },
        },
        include: { addresses: true },
      });

      await createAuditLog(request.orgId, "PRIVATE_KEY_CREATE", { privateKeyId: privateKey.id, name, walletId }, request.userId, request);
      return sendSuccess(reply, privateKey, 201);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get("/private-keys", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { search } = request.query as { search?: string };
      const { limit, offset } = parsePagination(request.query as { limit?: string; offset?: string });

      const where: any = { orgId: request.orgId };
      if (search) {
        where.OR = [
          { name: { contains: search, mode: "insensitive" } },
          { publicKey: { contains: search } },
          { wallet: { name: { contains: search, mode: "insensitive" } } },
        ];
      }

      const [data, total] = await Promise.all([
        prisma.privateKey.findMany({
          where,
          include: {
            wallet: { select: { name: true } },
            addresses: { include: { chain: { select: { name: true } } } },
          },
          orderBy: { createdAt: "desc" },
          take: limit,
          skip: offset,
        }),
        prisma.privateKey.count({ where }),
      ]);

      return sendSuccess(reply, { data, total, limit, offset });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get("/private-keys/:id", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const pk = await prisma.privateKey.findFirst({
        where: { id, orgId: request.orgId },
        include: {
          wallet: { select: { name: true } },
          addresses: { include: { chain: { select: { name: true, chainId: true } } } },
        },
      });
      if (!pk) throw new NotFoundError("PrivateKey");
      return sendSuccess(reply, pk);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/private-keys/:id/export", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      const pk = await prisma.privateKey.findFirst({
        where: { id, orgId: request.orgId },
        include: { addresses: { include: { chain: true } } },
      });
      if (!pk) throw new NotFoundError("PrivateKey");

      const wallet = await prisma.wallet.findFirst({ where: { id: pk.walletId } });
      if (!wallet) throw new NotFoundError("Wallet");

      const mnemonic = decryptSeedFromStorage(wallet.encryptedSeed);
      const hdNode = deriveAccount(mnemonic, await prisma.privateKey.count({ where: { walletId: pk.walletId, createdAt: { lte: pk.createdAt } } }) - 1, pk.addresses[0]?.chain?.derivationPath || "m/44'/60'/0'/0");

      await prisma.privateKey.update({ where: { id }, data: { exported: true } });
      await createAuditLog(request.orgId, "PRIVATE_KEY_EXPORT", { privateKeyId: id }, request.userId, request);

      return sendSuccess(reply, {
        privateKeyId: id,
        privateKey: hdNode.privateKey,
        publicKey: hdNode.address,
      });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.patch("/private-keys/:id", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { name, tags } = request.body as { name?: string; tags?: string[] };

      const existing = await prisma.privateKey.findFirst({ where: { id, orgId: request.orgId } });
      if (!existing) throw new NotFoundError("PrivateKey");

      const data: any = {};
      if (name) data.name = name;
      if (tags) data.tags = tags;

      const updated = await prisma.privateKey.update({ where: { id }, data });
      return sendSuccess(reply, updated);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.delete("/private-keys/:id", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const pk = await prisma.privateKey.findFirst({ where: { id, orgId: request.orgId } });
      if (!pk) throw new NotFoundError("PrivateKey");

      await prisma.privateKeyAddress.deleteMany({ where: { privateKeyId: id } });
      await prisma.privateKey.delete({ where: { id } });

      await createAuditLog(request.orgId, "PRIVATE_KEY_DELETE", { privateKeyId: id }, request.userId, request);
      return sendSuccess(reply, { message: "Private key deleted" });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/private-keys/:id/addresses", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { chain: chainName } = request.body as { chain?: string };

      const pk = await prisma.privateKey.findFirst({ where: { id, orgId: request.orgId } });
      if (!pk) throw new NotFoundError("PrivateKey");

      const chainInfo = chainName ? (await getChainByName(chainName).catch(() => null)) || await getDefaultChain() : await getDefaultChain();
      if (!chainInfo) throw new ValidationError("Invalid chain");

      const wallet = await prisma.wallet.findFirst({ where: { id: pk.walletId } });
      if (!wallet) throw new NotFoundError("Wallet");

      const mnemonic = decryptSeedFromStorage(wallet.encryptedSeed);
      const count = await prisma.privateKeyAddress.count({ where: { privateKeyId: id } });
      const hdNode = deriveAccount(mnemonic, count, chainInfo.derivationPath);

      const address = await prisma.privateKeyAddress.create({
        data: {
          privateKeyId: id,
          chainId: chainInfo.id,
          address: hdNode.address,
        },
        include: { chain: { select: { name: true, chainId: true } } },
      });

      return sendSuccess(reply, address, 201);
    } catch (err) {
      return sendError(reply, err);
    }
  });
}
