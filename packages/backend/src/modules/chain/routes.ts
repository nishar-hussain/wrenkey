import { FastifyInstance } from "fastify";
import prisma from "../../db.js";
import { authMiddleware, adminMiddleware } from "../../middleware/auth.js";
import { sendSuccess, sendError, ValidationError, NotFoundError } from "../../utils/errors.js";
import { createAuditLog } from "../../utils/audit.js";
import { getAllChains, seedChains, invalidateChainCache, CHAIN_FAMILY_EVM, CHAIN_FAMILY_STELLAR } from "../../services/chain.js";
import { parsePagination } from "../../utils/pagination.js";

export async function chainRoutes(app: FastifyInstance) {
  app.get("/chains", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { limit, offset } = parsePagination(request.query as { limit?: string; offset?: string });
      const all = await getAllChains();
      const paged = all.slice(offset, offset + limit);
      return sendSuccess(reply, { data: paged, total: all.length, limit, offset });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/chains", { preHandler: [authMiddleware, adminMiddleware] }, async (request, reply) => {
    try {
      const { name, chainId, rpcUrl, nativeCurrency, symbol, blockExplorerUrl, derivationPath, family, horizonUrl, networkPassphrase } = request.body as {
        name: string; chainId?: number | null; rpcUrl: string; nativeCurrency?: string; symbol?: string;
        blockExplorerUrl?: string; derivationPath?: string; family?: string; horizonUrl?: string; networkPassphrase?: string;
      };
      if (!name || !rpcUrl) throw new ValidationError("name and rpcUrl required");
      const resolvedFamily = family || CHAIN_FAMILY_EVM;
      // EVM chains require a numeric chain id; Stellar chains use a network passphrase instead.
      if (resolvedFamily === CHAIN_FAMILY_EVM && (chainId === undefined || chainId === null)) {
        throw new ValidationError("chainId is required for EVM chains");
      }
      if (resolvedFamily === CHAIN_FAMILY_STELLAR && !networkPassphrase) {
        throw new ValidationError("networkPassphrase is required for Stellar chains");
      }

      const chain = await prisma.chain.create({
        data: {
          name,
          chainId: chainId ?? null,
          rpcUrl,
          nativeCurrency: nativeCurrency || (resolvedFamily === CHAIN_FAMILY_STELLAR ? "XLM" : "ETH"),
          symbol: symbol || (resolvedFamily === CHAIN_FAMILY_STELLAR ? "XLM" : "ETH"),
          blockExplorerUrl,
          derivationPath: derivationPath || (resolvedFamily === CHAIN_FAMILY_STELLAR ? "m/44'/148'/0'" : "m/44'/60'/0'/0"),
          family: resolvedFamily,
          horizonUrl: horizonUrl || null,
          networkPassphrase: networkPassphrase || null,
        },
      });

      invalidateChainCache();
      await createAuditLog(request.orgId, "CHAIN_ADD", { chainId: chain.id, name, networkChainId: chainId }, request.userId, request);

      return sendSuccess(reply, chain, 201);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.delete("/chains/:id", { preHandler: [authMiddleware, adminMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const chain = await prisma.chain.findUnique({ where: { id } });
      if (!chain) throw new NotFoundError("Chain");

      const accountsCount = await prisma.walletAccount.count({ where: { chainId: id } });
      if (accountsCount > 0) throw new ValidationError(`Cannot delete chain with ${accountsCount} accounts attached. Archive it instead.`);

      await prisma.chain.update({ where: { id }, data: { active: false } });
      invalidateChainCache();
      await createAuditLog(request.orgId, "CHAIN_REMOVE", { chainId: id, name: chain.name }, request.userId, request);

      return sendSuccess(reply, { message: `Chain ${chain.name} deactivated` });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/chains/seed", { preHandler: [authMiddleware, adminMiddleware] }, async (request, reply) => {
    try {
      await seedChains();
      invalidateChainCache();
      const chains = await getAllChains();
      return sendSuccess(reply, { message: `Seeded ${chains.length} chains`, chains });
    } catch (err) {
      return sendError(reply, err);
    }
  });
}
