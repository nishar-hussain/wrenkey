import { FastifyInstance } from "fastify";
import prisma from "../../db.js";
import { authMiddleware } from "../../middleware/auth.js";
import { sendSuccess, sendError, ValidationError, NotFoundError } from "../../utils/errors.js";
import { createAuditLog } from "../../utils/audit.js";
import { parsePagination } from "../../utils/pagination.js";

export async function contractInterfaceRoutes(app: FastifyInstance) {
  app.get("/contract-interfaces", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { limit, offset } = parsePagination(request.query as { limit?: string; offset?: string });
      const [data, total] = await Promise.all([
        prisma.contractInterface.findMany({ where: { orgId: request.orgId }, orderBy: { createdAt: "desc" }, take: limit, skip: offset }),
        prisma.contractInterface.count({ where: { orgId: request.orgId } }),
      ]);
      return sendSuccess(reply, { data, total, limit, offset });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/contract-interfaces", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { name, notes, address, interfaceType, abi } = request.body as {
        name: string; notes?: string; address?: string; interfaceType?: string; abi?: any;
      };
      if (!name || !name.trim()) throw new ValidationError("Interface name required");

      const iface = await prisma.contractInterface.create({
        data: {
          orgId: request.orgId, name: name.trim(),
          notes: notes || "", address: address || "",
          interfaceType: interfaceType || "custom", abi: abi || {},
        },
      });

      await createAuditLog(request.orgId, "INTERFACE_CREATE", { ifaceId: iface.id, name }, request.userId, request);
      return sendSuccess(reply, iface, 201);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.delete("/contract-interfaces/:id", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const iface = await prisma.contractInterface.findFirst({ where: { id, orgId: request.orgId } });
      if (!iface) throw new NotFoundError("Contract interface");

      await prisma.contractInterface.delete({ where: { id } });
      await createAuditLog(request.orgId, "INTERFACE_DELETE", { ifaceId: id }, request.userId, request);
      return sendSuccess(reply, { message: "Interface deleted" });
    } catch (err) {
      return sendError(reply, err);
    }
  });
}
