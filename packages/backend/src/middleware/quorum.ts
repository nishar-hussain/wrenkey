import { FastifyRequest, FastifyReply } from "fastify";
import prisma from "../db.js";
import { ForbiddenError } from "../utils/errors.js";

declare module "fastify" {
  interface FastifyRequest {
    quorumAutoApprove?: boolean;
    quorumRequired?: boolean;
    quorumThreshold?: number;
    quorumMemberIds?: string[];
  }
}

export async function quorumMiddleware(request: FastifyRequest, _reply: FastifyReply) {
  const cfg = await prisma.orgConfig.findUnique({ where: { orgId: request.orgId } });
  const configData = (cfg?.config as any) || {};
  const memberIds: string[] = configData.rootQuorumMembers || [];
  const threshold: number = configData.rootQuorumThreshold || 1;

  request.quorumThreshold = threshold;
  request.quorumMemberIds = memberIds;

  if (memberIds.length === 0) {
    throw new ForbiddenError(
      "Root Quorum not configured. An org admin must set up Root Quorum in Team → Root Quorum before performing sensitive wallet operations."
    );
  }

  if (request.auth.role !== "ORG_ADMIN") {
    throw new ForbiddenError("Only org admins can perform this operation");
  }

  if (!memberIds.includes(request.userId!)) {
    throw new ForbiddenError("You are not a Root Quorum member. Only designated quorum members can perform this operation.");
  }

  if (threshold <= 1) {
    request.quorumAutoApprove = true;
  } else {
    request.quorumRequired = true;
  }
}
