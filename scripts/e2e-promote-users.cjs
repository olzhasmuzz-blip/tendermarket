const { PrismaClient } = require("../apps/api/node_modules/@prisma/client");

const prisma = new PrismaClient();

async function main() {
  for (const [userId, role] of [
    [process.env.TM_ADMIN_ID, "ADMIN"],
    [process.env.TM_ARBITER_ID, "ARBITER"],
  ]) {
    if (!userId) throw new Error("Missing local smoke test account id.");
    const member = await prisma.organizationMember.findFirst({ where: { userId, role: "CUSTOMER" } });
    if (!member) throw new Error(`Local smoke test membership is missing for role ${role}.`);
    await prisma.organizationMember.create({ data: { userId, organizationId: member.organizationId, role } });
  }
}

main().finally(() => prisma.$disconnect());
