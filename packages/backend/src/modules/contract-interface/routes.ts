import { FastifyInstance } from "fastify";
import { ethers } from "ethers";
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

  app.get("/contract-interfaces/:id", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const iface = await prisma.contractInterface.findFirst({ where: { id, orgId: request.orgId } });
      if (!iface) throw new NotFoundError("Contract interface");
      return sendSuccess(reply, iface);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/contract-interfaces", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { name, notes, address, interfaceType, chainType, abi } = request.body as {
        name: string; notes?: string; address?: string; interfaceType?: string; chainType?: string; abi?: any;
      };
      if (!name || !name.trim()) throw new ValidationError("Interface name required");

      // Validate ABI if provided
      if (abi && typeof abi === "string" && abi.trim()) {
        try { JSON.parse(abi.trim()); } catch { throw new ValidationError("Invalid ABI JSON format"); }
      }

      const iface = await prisma.contractInterface.create({
        data: {
          orgId: request.orgId, name: name.trim(),
          notes: notes || "", address: address || "",
          interfaceType: interfaceType || "custom",
          chainType: chainType || "ethereum",
          abi: (abi && typeof abi === "string" && abi.trim()) ? JSON.parse(abi.trim()) : (abi || []),
        },
      });

      await createAuditLog(request.orgId, "INTERFACE_CREATE", { ifaceId: iface.id, name }, request.userId, request);
      return sendSuccess(reply, iface, 201);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.patch("/contract-interfaces/:id", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { name, notes, address, interfaceType, chainType, abi } = request.body as any;

      const existing = await prisma.contractInterface.findFirst({ where: { id, orgId: request.orgId } });
      if (!existing) throw new NotFoundError("Contract interface");

      const updateData: any = {};
      if (name !== undefined) updateData.name = name.trim();
      if (notes !== undefined) updateData.notes = notes;
      if (address !== undefined) updateData.address = address;
      if (interfaceType !== undefined) updateData.interfaceType = interfaceType;
      if (chainType !== undefined) updateData.chainType = chainType;
      if (abi !== undefined) {
        if (typeof abi === "string" && abi.trim()) {
          try { updateData.abi = JSON.parse(abi.trim()); } catch { throw new ValidationError("Invalid ABI JSON format"); }
        } else {
          updateData.abi = abi;
        }
      }

      const updated = await prisma.contractInterface.update({ where: { id }, data: updateData });
      return sendSuccess(reply, updated);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/contract-interfaces/:id/decode", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { data } = request.body as { data: string };
      if (!data) throw new ValidationError("Calldata required");

      const iface = await prisma.contractInterface.findFirst({ where: { id, orgId: request.orgId } });
      if (!iface) throw new NotFoundError("Contract interface");

      const abi = iface.abi as any;
      if (!abi || (Array.isArray(abi) && abi.length === 0)) {
        throw new ValidationError("No ABI defined for this interface");
      }

      try {
        const ethIface = new ethers.Interface(abi);
        const decoded = ethIface.parseTransaction({ data });
        if (!decoded) throw new Error("Could not decode calldata with this ABI");

        const args: Record<string, string> = {};
        const fragment = decoded.fragment;
        if (fragment && "inputs" in fragment) {
          for (let i = 0; i < fragment.inputs.length; i++) {
            args[fragment.inputs[i].name || `arg${i}`] = String(decoded.args[i]);
          }
        }

        await createAuditLog(request.orgId, "INTERFACE_DECODE", { ifaceId: id, functionName: decoded.name }, request.userId, request);

        return sendSuccess(reply, {
          functionName: decoded.name,
          signature: decoded.signature,
          selector: decoded.selector,
          args,
          rawArgs: decoded.args.map(a => String(a)),
        });
      } catch (err: any) {
        throw new ValidationError(`Decode failed: ${err.message}`);
      }
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
