import type { PrismaClient } from "@prisma/client";

/**
 * Delete an organization and all of its dependents in the correct FK order.
 *
 * The test suites previously only deleted the org row, which silently failed
 * (caught + swallowed) because users/wallets/wvc-data still referenced it.
 * That left orphaned rows whose fixed `name`/`email` unique constraints then
 * caused the *next* run's `beforeAll` to fail. This helper performs an ordered
 * teardown so cleanup actually succeeds.
 */
export async function cleanupOrg(prisma: PrismaClient, orgId: string): Promise<void> {
  if (!orgId) return;

  // Recursively tear down sub-organizations first (they reference the parent via
  // parentOrgId, which would otherwise block deletion of the parent org).
  const children = await prisma.organization.findMany({ where: { parentOrgId: orgId }, select: { id: true } }).catch(() => []);
  for (const child of children) {
    await cleanupOrg(prisma, child.id);
  }

  await prisma.auditLog.deleteMany({ where: { orgId } }).catch(() => {});
  await prisma.webhookDelivery.deleteMany({ where: { orgId } }).catch(() => {});
  await prisma.webhook.deleteMany({ where: { orgId } }).catch(() => {});
  await prisma.apiKey.deleteMany({ where: { orgId } }).catch(() => {});
  await prisma.agent.deleteMany({ where: { orgId } }).catch(() => {});
  await prisma.policy.deleteMany({ where: { orgId } }).catch(() => {});
  await prisma.approvalRequest.deleteMany({ where: { orgId } }).catch(() => {});
  await prisma.spendingLimit.deleteMany({ where: { orgId } }).catch(() => {});
  await prisma.tag.deleteMany({ where: { orgId } }).catch(() => {});
  await prisma.orgConfig.deleteMany({ where: { orgId } }).catch(() => {});
  await prisma.invoice.deleteMany({ where: { orgId } }).catch(() => {});
  await prisma.contractInterface.deleteMany({ where: { orgId } }).catch(() => {});
  await prisma.privateKey.deleteMany({ where: { orgId } }).catch(() => {});
  await prisma.wallet.deleteMany({ where: { orgId } }).catch(() => {});

  // WVC tables (cross-referenced — delete leaf tables first)
  const apps = await prisma.wvcApp.findMany({ where: { orgId }, select: { id: true } }).catch(() => []);
  const appIds = apps.map((a) => a.id);
  if (appIds.length) {
    await prisma.wvcManifestApproval.deleteMany({ where: { operator: { orgId } } }).catch(() => {});
    await prisma.wvcKeyCeremony.deleteMany({ where: { appId: { in: appIds } } }).catch(() => {});
    await prisma.wvcBootProof.deleteMany({ where: { deployment: { appId: { in: appIds } } } }).catch(() => {});
    await prisma.wvcAppProof.deleteMany({ where: { deployment: { appId: { in: appIds } } } }).catch(() => {});
    await prisma.wvcDeployment.deleteMany({ where: { appId: { in: appIds } } }).catch(() => {});
    await prisma.wvcManifest.deleteMany({ where: { appId: { in: appIds } } }).catch(() => {});
    await prisma.wvcQuorumKey.deleteMany({ where: { appId: { in: appIds } } }).catch(() => {});
  }
  await prisma.wvcOperator.deleteMany({ where: { orgId } }).catch(() => {});
  await prisma.wvcApp.deleteMany({ where: { orgId } }).catch(() => {});

  // users cascade sessions + authenticators
  await prisma.user.deleteMany({ where: { orgId } }).catch(() => {});
  await prisma.organization.deleteMany({ where: { id: orgId } }).catch(() => {});
}

/** A per-run unique suffix so test org names/emails never collide across runs. */
export function runSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
