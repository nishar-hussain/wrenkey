import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const orgId = "seed-org-001";
  const adminId = "seed-admin-001";
  const devId = "seed-dev-001";
  const walletId = "seed-wallet-001";

  const org = await prisma.organization.upsert({
    where: { id: orgId },
    update: {},
    create: {
      id: orgId,
      name: "Acme Corp",
    },
  });

  const admin = await prisma.user.upsert({
    where: { id: adminId },
    update: {},
    create: {
      id: adminId,
      orgId: org.id,
      name: "Admin User",
      email: "admin@acme.com",
      role: "ADMIN",
    },
  });

  const dev = await prisma.user.upsert({
    where: { id: devId },
    update: {},
    create: {
      id: devId,
      orgId: org.id,
      name: "Dev User",
      email: "dev@acme.com",
      role: "DEVELOPER",
    },
  });

  const wallet = await prisma.wallet.upsert({
    where: { id: walletId },
    update: {},
    create: {
      id: walletId,
      orgId: org.id,
      ownerType: "USER",
      ownerId: dev.id,
      userId: dev.id,
      name: "Dev Wallet",
      encryptedSeed: "encrypted-seed-placeholder",
    },
  });

  await prisma.walletAccount.upsert({
    where: { id: "seed-account-001" },
    update: {},
    create: {
      id: "seed-account-001",
      walletId: wallet.id,
      chain: "arc",
      address: "0x1234567890abcdef1234567890abcdef12345678",
      derivationPath: "m/44'/60'/0'/0/0",
      index: 0,
    },
  });

  await prisma.walletAccount.upsert({
    where: { id: "seed-account-002" },
    update: {},
    create: {
      id: "seed-account-002",
      walletId: wallet.id,
      chain: "ethereum",
      address: "0xabcdef1234567890abcdef1234567890abcdef12",
      derivationPath: "m/44'/60'/0'/0/1",
      index: 1,
    },
  });

  await prisma.policy.upsert({
    where: { id: "seed-policy-001" },
    update: {},
    create: {
      id: "seed-policy-001",
      orgId: org.id,
      name: "Allow under 1000",
      effect: "EFFECT_ALLOW",
      conditions: { maxValue: "1000000000000000000" },
      priority: 10,
    },
  });

  await prisma.policy.upsert({
    where: { id: "seed-policy-002" },
    update: {},
    create: {
      id: "seed-policy-002",
      orgId: org.id,
      name: "Deny blacklist",
      effect: "EFFECT_DENY",
      conditions: {
        blacklist: ["0xblacklistedaddress00000000000000000000000001"],
      },
      priority: 5,
    },
  });

  await prisma.webhook.upsert({
    where: { id: "seed-webhook-001" },
    update: {},
    create: {
      id: "seed-webhook-001",
      orgId: org.id,
      userId: admin.id,
      url: "https://webhook.acme.com/wrankey-events",
      events: ["transaction.confirmed", "policy.evaluated"],
      hmacSecret: "seed-webhook-hmac-secret",
    },
  });

  await prisma.agent.upsert({
    where: { id: "seed-agent-001" },
    update: {},
    create: {
      id: "seed-agent-001",
      orgId: org.id,
      userId: dev.id,
      name: "Trading Bot",
    },
  });

  console.log("Database seeded successfully");
  console.log(`  Org:    ${org.name} (${org.id})`);
  console.log(`  Admin:  ${admin.name} (${admin.email})`);
  console.log(`  Dev:    ${dev.name} (${dev.email})`);
  console.log(`  Wallet: ${wallet.name} (2 accounts)`);
  console.log(`  Policies: 2 (ALLOW, DENY)`);
  console.log(`  Webhook: 1`);
  console.log(`  Agent:   1`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
