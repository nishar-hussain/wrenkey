import prisma from "../db.js";

/**
 * Resolve the sub-org ID where a user's personal wallets live.
 * Each user in the main org has a sub-org (under parentOrgId) where
 * they are ORG_ADMIN. This sub-org is the container for their USER wallets.
 */
export async function getUserSubOrgId(
  userId: string,
  parentOrgId: string,
): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { orgId: true, email: true },
  });

  if (!user) return null;

  // If the user is already in a sub-org (their own), return that orgId
  const theirOrg = await prisma.organization.findUnique({
    where: { id: user.orgId },
    select: { id: true, parentOrgId: true },
  });

  if (theirOrg && theirOrg.parentOrgId === parentOrgId) {
    return theirOrg.id;
  }

  // Look for a sub-org under parentOrgId where this user is ORG_ADMIN
  const subOrgUser = await prisma.user.findFirst({
    where: {
      email: user.email,
      org: { parentOrgId },
      role: "ORG_ADMIN",
    },
    select: { orgId: true },
  });

  return subOrgUser?.orgId ?? null;
}

/**
 * Check if a user is a sub-org admin (i.e., they own a sub-org under the parent).
 * This is different from being ORG_ADMIN of the main org.
 */
export async function isUserSubOrgAdmin(
  userId: string,
  parentOrgId: string,
): Promise<boolean> {
  const subOrgId = await getUserSubOrgId(userId, parentOrgId);
  return subOrgId !== null;
}

/**
 * Ensure the user has a sub-org under the parent org. Creates one if missing.
 * Returns the sub-org ID (existing or newly created).
 */
export async function ensureUserSubOrg(
  userId: string,
  parentOrgId: string,
): Promise<string | null> {
  const existing = await getUserSubOrgId(userId, parentOrgId);
  if (existing) return existing;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, tags: true },
  });

  if (!user) return null;

  const emailPrefix = user.email?.split("@")[0] || user.id.slice(0, 8);
  const subOrg = await prisma.organization.create({
    data: {
      name: `${emailPrefix} - Wallet`,
      parentOrgId,
    },
  });

  await prisma.user.create({
    data: {
      orgId: subOrg.id,
      email: user.email,
      name: user.name,
      role: "ORG_ADMIN",
      tags: user.tags || [],
    },
  });

  return subOrg.id;
}
