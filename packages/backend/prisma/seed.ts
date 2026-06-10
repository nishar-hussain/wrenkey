import { PrismaClient } from "@prisma/client";
import { randomBytes } from "crypto";

const prisma = new PrismaClient();

async function main() {
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

  await prisma.authenticator.create({
    data: {
      userId: adminUser.id,
      type: "EMAIL",
      verified: true,
    },
  });

  await prisma.policy.create({
    data: {
      orgId: org.id,
      name: "Default Allow Policy",
      effect: "EFFECT_ALLOW",
      conditions: [
        { type: "LESS_THAN", field: "params.value", value: 1000000 },
      ],
      consensus: "ANY",
      priority: 0,
    },
  });

  console.log("Seed data created successfully");
  console.log("Org ID:", org.id);
  console.log("Admin User ID:", adminUser.id);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
