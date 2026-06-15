import { FastifyInstance } from "fastify";
import prisma from "../../db.js";
import { authMiddleware, adminMiddleware } from "../../middleware/auth.js";
import { sendSuccess, sendError, ValidationError, NotFoundError } from "../../utils/errors.js";
import { createAuditLog } from "../../utils/audit.js";
import { getAllChains, seedChains, invalidateChainCache } from "../../services/chain.js";
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
      const { name, chainId, rpcUrl, nativeCurrency, symbol, blockExplorerUrl, derivationPath } = request.body as {
        name: string; chainId: number; rpcUrl: string; nativeCurrency?: string; symbol?: string; blockExplorerUrl?: string; derivationPath?: string;
      };
      if (!name || chainId === undefined || !rpcUrl) throw new ValidationError("name, chainId, and rpcUrl required");

      const chain = await prisma.chain.create({
        data: { name, chainId, rpcUrl, nativeCurrency: nativeCurrency || "ETH", symbol: symbol || "ETH", blockExplorerUrl, derivationPath: derivationPath || "m/44'/60'/0'/0" },
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
