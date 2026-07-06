import { FastifyInstance } from "fastify";
import prisma from "../../db.js";
import { authMiddleware } from "../../middleware/auth.js";
import { sendSuccess, sendError, ValidationError, NotFoundError } from "../../utils/errors.js";
import { createAuditLog } from "../../utils/audit.js";
import { parsePagination } from "../../utils/pagination.js";

export async function tagRoutes(app: FastifyInstance) {
  app.get("/tags", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { limit, offset } = parsePagination(request.query as { limit?: string; offset?: string });
      const { type } = request.query as { type?: string };

      const where: any = { orgId: request.orgId };
      if (type) where.type = type;

      const [tags, total] = await Promise.all([
        prisma.tag.findMany({ where, orderBy: { name: "asc" }, take: limit, skip: offset }),
        prisma.tag.count({ where }),
      ]);

      const users = await prisma.user.findMany({
        where: { orgId: request.orgId },
        select: { tags: true },
      });
      const wallets = await prisma.wallet.findMany({
        where: { orgId: request.orgId },
        select: { tags: true },
      });

      const userTagCounts = new Map<string, number>();
      const walletTagCounts = new Map<string, number>();
      for (const u of users) for (const t of u.tags) userTagCounts.set(t, (userTagCounts.get(t) || 0) + 1);
      for (const w of wallets) for (const t of w.tags) walletTagCounts.set(t, (walletTagCounts.get(t) || 0) + 1);

      const data = tags.map(t => ({
        ...t,
        usageCount: t.type === "user" ? (userTagCounts.get(t.name) || 0) : (walletTagCounts.get(t.name) || 0),
      }));

      return sendSuccess(reply, { data, total, limit, offset });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/tags", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { name, type } = request.body as { name: string; type?: string };
      if (!name || !name.trim()) throw new ValidationError("Tag name required");

      const tag = await prisma.tag.create({
        data: { orgId: request.orgId, name: name.trim(), type: type || "user" },
      });

      await createAuditLog(request.orgId, "TAG_CREATE", { tagId: tag.id, name: tag.name, type: tag.type }, request.userId, request);
      return sendSuccess(reply, tag, 201);
    } catch (err: any) {
      if (err?.code === "P2002") throw new ValidationError(`Tag "${name}" already exists`);
      return sendError(reply, err);
    }
  });

  app.patch("/tags/:id", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { name } = request.body as { name?: string };

      const tag = await prisma.tag.findFirst({ where: { id, orgId: request.orgId } });
      if (!tag) throw new NotFoundError("Tag");
      if (!name || !name.trim()) throw new ValidationError("New name required");
      const oldName = tag.name;
      const newName = name.trim();

      await prisma.$transaction(async (tx) => {
        await tx.tag.update({ where: { id }, data: { name: newName } });
        if (tag.type === "user") {
          await tx.$executeRaw`UPDATE users SET tags = array_replace(tags, ${oldName}, ${newName}) WHERE org_id = ${request.orgId} AND ${oldName} = ANY(tags)`;
        } else {
          await tx.$executeRaw`UPDATE wallets SET tags = array_replace(tags, ${oldName}, ${newName}) WHERE org_id = ${request.orgId} AND ${oldName} = ANY(tags)`;
        }
      });

      await createAuditLog(request.orgId, "TAG_RENAME", { tagId: id, oldName, newName, type: tag.type }, request.userId, request);
      return sendSuccess(reply, { message: "Tag renamed", oldName, newName });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.delete("/tags/:id", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const tag = await prisma.tag.findFirst({ where: { id, orgId: request.orgId } });
      if (!tag) throw new NotFoundError("Tag");

      await prisma.$transaction(async (tx) => {
        if (tag.type === "user") {
          await tx.$executeRaw`UPDATE users SET tags = array_remove(tags, ${tag.name}) WHERE org_id = ${request.orgId} AND ${tag.name} = ANY(tags)`;
        } else {
          await tx.$executeRaw`UPDATE wallets SET tags = array_remove(tags, ${tag.name}) WHERE org_id = ${request.orgId} AND ${tag.name} = ANY(tags)`;
        }
        await tx.tag.delete({ where: { id } });
      });
      await createAuditLog(request.orgId, "TAG_DELETE", { tagId: id, name: tag.name, type: tag.type }, request.userId, request);
      return sendSuccess(reply, { message: "Tag deleted" });
    } catch (err) {
      return sendError(reply, err);
    }
  });
}
