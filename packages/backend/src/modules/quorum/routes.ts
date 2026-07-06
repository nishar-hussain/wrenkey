import { FastifyInstance } from "fastify";
import prisma from "../../db.js";
import { authMiddleware, adminMiddleware } from "../../middleware/auth.js";
import { sendSuccess, sendError, ValidationError } from "../../utils/errors.js";
import { createAuditLog } from "../../utils/audit.js";

export async function quorumRoutes(app: FastifyInstance) {
  // GET /quorum — returns quorum config + members + health analysis
  app.get("/quorum", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const cfg = await prisma.orgConfig.findUnique({ where: { orgId: request.orgId } });
      const configData = (cfg?.config as any) || {};
      const memberIds: string[] = configData.rootQuorumMembers || [];
      const threshold: number = configData.rootQuorumThreshold || 1;

      // fetch all users in org
      const allUsers = await prisma.user.findMany({
        where: { orgId: request.orgId },
        select: { id: true, name: true, email: true, role: true, tags: true },
      });

      // fetch agents to identify service users
      const agents = await prisma.agent.findMany({
        where: { orgId: request.orgId },
        select: { userId: true },
      });
      const agentUserIds = new Set(agents.map((a) => a.userId));

      const members = allUsers.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        tags: u.tags,
        isRoot: u.role === "ORG_ADMIN",
        isService: agentUserIds.has(u.id),
        isQuorumMember: memberIds.includes(u.id),
      }));

      const quorumCount = memberIds.length;
      const health = getQuorumHealth(quorumCount, threshold, allUsers.length);

      return sendSuccess(reply, {
        members,
        threshold,
        memberIds,
        health,
      });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // PUT /quorum — update quorum members and threshold
  app.put("/quorum", { preHandler: [authMiddleware, adminMiddleware] }, async (request, reply) => {
    try {
      const body = request.body as Record<string, any> || {};
      const memberIds: string[] = body.memberIds || [];
      const threshold: number = body.threshold || 1;

      if (!Array.isArray(memberIds)) {
        throw new ValidationError("memberIds must be an array");
      }
      if (typeof threshold !== "number" || threshold < 1) {
        throw new ValidationError("threshold must be a positive number");
      }

      // validate that all memberIds are ORG_ADMIN users in this org
      if (memberIds.length > 0) {
        const validAdmins = await prisma.user.findMany({
          where: { orgId: request.orgId, role: "ORG_ADMIN", id: { in: memberIds } },
          select: { id: true },
        });
        const validIds = new Set(validAdmins.map((u) => u.id));
        const invalid = memberIds.filter((id) => !validIds.has(id));
        if (invalid.length > 0) {
          throw new ValidationError(`Invalid quorum members: only ORG_ADMIN users can be quorum members`);
        }
      }

      if (threshold > memberIds.length) {
        throw new ValidationError("Threshold cannot exceed the number of quorum members");
      }

      const cfg = await prisma.orgConfig.findUnique({ where: { orgId: request.orgId } });
      const current = cfg ? (cfg.config as any) : {};
      const updated = { ...current, rootQuorumMembers: memberIds, rootQuorumThreshold: threshold };

      await prisma.orgConfig.upsert({
        where: { orgId: request.orgId },
        update: { config: updated },
        create: { orgId: request.orgId, config: updated },
      });

      await createAuditLog(
        request.orgId,
        "CONFIG_UPDATE",
        { rootQuorumMembers: memberIds, rootQuorumThreshold: threshold },
        request.userId,
        request
      );

      const allUsers = await prisma.user.findMany({
        where: { orgId: request.orgId },
        select: { id: true },
      });

      const health = getQuorumHealth(memberIds.length, threshold, allUsers.length);

      return sendSuccess(reply, {
        memberIds,
        threshold,
        health,
      });
    } catch (err) {
      return sendError(reply, err);
    }
  });
}

function getQuorumHealth(memberCount: number, threshold: number, totalUsers: number) {
  if (memberCount === 0) {
    return {
      status: "no_quorum",
      label: "No quorum configured",
      message:
        "No root users are assigned to the quorum. Any single root user can perform critical operations without approval.",
      severity: "critical",
    };
  }

  if (memberCount === 1) {
    return {
      status: "single_point_of_failure",
      label: "Single point of failure",
      message:
        "One compromised key gives full root access. Add root users to enable a quorum. Recommended minimum setup: 2/3.",
      severity: "warning",
    };
  }

  if (threshold < 2) {
    return {
      status: "weak_quorum",
      label: "Weak quorum",
      message: `You have ${memberCount} quorum members but the threshold is only ${threshold}. A single approval is enough. Increase the threshold to require multiple approvals.`,
      severity: "warning",
    };
  }

  if (threshold < Math.ceil(memberCount / 2) + 1) {
    return {
      status: "adequate",
      label: "Quorum configured",
      message:
        `${threshold}/${memberCount} threshold provides basic protection. For stronger security consider requiring a supermajority.`,
      severity: "info",
    };
  }

  return {
    status: "healthy",
    label: "Strong quorum",
    message: `Your ${threshold}/${memberCount} quorum provides robust protection against single-point compromise.`,
    severity: "success",
  };
}
