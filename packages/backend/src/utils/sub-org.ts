import prisma from "../db.js";

/**
 * Resolve the sub-org ID where a user's personal wallets live.
 * Each user in the main org has a sub-org (under parentOrgId) named
 * "{emailPrefix} - Wallet".
 */
export async function getUserSubOrgId(
  userId: string,
  parentOrgId: string,
): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });

  if (!user?.email) return null;

  const emailPrefix = user.email.split("@")[0];

  const subOrg = await prisma.organization.findFirst({
    where: {
      parentOrgId,
      name: emailPrefix,
    },
    select: { id: true },
  });

  return subOrg?.id ?? null;
}
