import { PrismaClient } from "@prisma/client";
import { randomBytes } from "crypto";

const prisma = new PrismaClient();

async function main() {
  // Clean existing data
  await prisma.auditLog.deleteMany();
  await prisma.webhook.deleteMany();
  await prisma.agent.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.walletAccount.deleteMany();
  await prisma.wallet.deleteMany();
  await prisma.policy.deleteMany();
  await prisma.apiKey.deleteMany();
  await prisma.session.deleteMany();
  await prisma.authenticator.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();

  console.log("Cleared existing data");

  const org = await prisma.organization.create({
    data: { name: "Demo Org" },
  });

  const adminUser = await prisma.user.create({
    data: {
      orgId: org.id,
      name: "Admin User",
      email: "admin@wrankey.io",
      role: "ORG_ADMIN",
      tags: ["admin"],
    },
  });

  const devUser = await prisma.user.create({
    data: {
      orgId: org.id,
      name: "Developer User",
      email: "dev@wrankey.io",
      role: "DEVELOPER",
      tags: ["api", "frontend"],
    },
  });

  const auditorUser = await prisma.user.create({
    data: {
      orgId: org.id,
      name: "Auditor User",
      email: "auditor@wrankey.io",
      role: "AUDITOR",
      tags: ["compliance"],
    },
  });

  await prisma.authenticator.createMany({
    data: [
      { userId: adminUser.id, type: "EMAIL", verified: true },
      { userId: devUser.id, type: "EMAIL", verified: true },
      { userId: auditorUser.id, type: "EMAIL", verified: true },
    ],
  });

  await prisma.apiKey.create({
    data: {
      orgId: org.id,
      name: "Default API Key",
      keyHash: randomBytes(16).toString("hex"),
      keyPrefix: "wrankey_demo",
      permissions: ["*"],
      allowedIps: [],
    },
  });

  // Create demo policies
  await prisma.policy.createMany({
    data: [
      {
        orgId: org.id,
        name: "Allow Small Transactions",
        effect: "EFFECT_ALLOW",
        conditions: [
          { type: "LESS_THAN", field: "params.value", value: 100 },
          { type: "EQUAL", field: "params.chain", value: "arc" },
        ],
        consensus: "ALL",
        priority: 10,
      },
      {
        orgId: org.id,
        name: "Block Blacklisted Address",
        effect: "EFFECT_DENY",
        conditions: [
          { type: "INCLUDE", field: "params.to", values: ["0x000000000000000000000000000000000000dead", "0xblacklist"] },
        ],
        consensus: "ANY",
        priority: 100,
      },
      {
        orgId: org.id,
        name: "Allow During Business Hours",
        effect: "EFFECT_ALLOW",
        conditions: [
          { type: "WINDOW", field: "timestamp", values: ["2020-01-01T00:00:00Z", "2099-12-31T23:59:59Z"] },
        ],
        consensus: "ANY",
        priority: 5,
      },
    ],
  });

  // Create demo webhook
  await prisma.webhook.create({
    data: {
      orgId: org.id,
      userId: adminUser.id,
      url: "https://webhook.site/demo",
      events: ["transaction.submitted", "transaction.confirmed", "wallet.created"],
      hmacSecret: randomBytes(16).toString("hex"),
      active: true,
    },
  });

  // Create demo agent
  await prisma.agent.create({
    data: {
      orgId: org.id,
      userId: devUser.id,
      name: "Trading Bot",
      status: "ACTIVE",
    },
  });

  console.log("Seed data created successfully!");
  console.log("  Org:", org.id, `(${org.name})`);
  console.log("  Admin User:", adminUser.id, "(admin@wrankey.io)");
  console.log("  Dev User:", devUser.id, "(dev@wrankey.io)");
  console.log("  Auditor User:", auditorUser.id, "(auditor@wrankey.io)");
  console.log("  Policies: 3 (allow small, block blacklist, time window)");
  console.log("  Webhook: 1");
  console.log("  Agent: 1");
  console.log("");
  console.log("Run 'npm run dev' and visit http://localhost:3000 to get started!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
