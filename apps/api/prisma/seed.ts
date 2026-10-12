import { PrismaClient } from "@prisma/client";
import { AccountRole } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const categories = [
  { slug: "electronics", name: "Электроника", icon: "monitor", sortOrder: 1 },
  { slug: "furniture", name: "Мебель", icon: "armchair", sortOrder: 2 },
  { slug: "office", name: "Офисные товары", icon: "briefcase", sortOrder: 3 },
  { slug: "food", name: "Продукты", icon: "apple", sortOrder: 4 },
  { slug: "beauty", name: "Красота и уход", icon: "sparkles", sortOrder: 5 },
  { slug: "apparel", name: "Одежда и обувь", icon: "shirt", sortOrder: 6 },
  { slug: "sport", name: "Спорт и отдых", icon: "dumbbell", sortOrder: 7 },
  { slug: "equipment", name: "Техника и оборудование", icon: "package", sortOrder: 8 },
  { slug: "health", name: "Здоровье", icon: "heart-pulse", sortOrder: 9 },
  { slug: "home", name: "Дом и быт", icon: "house", sortOrder: 10 },
];

async function main() {
  for (const category of categories) await prisma.category.upsert({ where: { slug: category.slug }, update: category, create: category });
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (email || password) {
    if (!email || !password || password.length < 14) throw new Error("Set both BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD (14+ characters).");
    const organization = await prisma.organization.upsert({ where: { slug: "tendermarket-operations" }, update: {}, create: { slug: "tendermarket-operations", name: "TenderMarket Operations" } });
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.upsert({ where: { email }, update: { passwordHash }, create: { email, passwordHash, displayName: "TenderMarket Admin" } });
    await prisma.organizationMember.upsert({ where: { userId_organizationId_role: { userId: user.id, organizationId: organization.id, role: AccountRole.ADMIN } }, update: {}, create: { userId: user.id, organizationId: organization.id, role: AccountRole.ADMIN } });
  }
}

main().finally(() => prisma.$disconnect());
