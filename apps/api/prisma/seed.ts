import { PrismaClient, AccountRole } from "@prisma/client";
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

const demoUsers = [
  {
    email: "customer@tendermarket.test",
    displayName: "ТОО КазПромЗакуп (Заказчик)",
    orgName: "ТОО КазПромЗакуп",
    orgSlug: "kazpromzakup",
    role: AccountRole.CUSTOMER,
  },
  {
    email: "supplier@tendermarket.test",
    displayName: "ТОО ВостокСнабСервис (Поставщик)",
    orgName: "ТОО ВостокСнабСервис",
    orgSlug: "vostoksnabservice",
    role: AccountRole.SUPPLIER,
    isSupplier: true,
  },
  {
    email: "arbiter@tendermarket.test",
    displayName: "Арбитр ТендерМаркет",
    orgName: "Арбитражная Коллегия",
    orgSlug: "arbitration-board",
    role: AccountRole.ARBITER,
  },
  {
    email: "admin@tendermarket.test",
    displayName: "Администратор Платформы",
    orgName: "TenderMarket Operations",
    orgSlug: "tendermarket-operations",
    role: AccountRole.ADMIN,
  },
];

async function main() {
  for (const category of categories) {
    await prisma.category.upsert({ where: { slug: category.slug }, update: category, create: category });
  }

  const defaultPasswordHash = await bcrypt.hash("LocalTestPass2026!", 12);

  for (const demo of demoUsers) {
    const org = await prisma.organization.upsert({
      where: { slug: demo.orgSlug },
      update: { name: demo.orgName },
      create: { slug: demo.orgSlug, name: demo.orgName },
    });

    if (demo.isSupplier) {
      await prisma.supplierProfile.upsert({
        where: { organizationId: org.id },
        update: { publicName: demo.orgName, isPublished: true },
        create: {
          organizationId: org.id,
          publicName: demo.orgName,
          about: "Надежный поставщик и субподрядчик в Республике Казахстан",
          isPublished: true,
          deliveryRegions: ["Алматы", "Астана", "Шымкент", "Усть-Каменогорск", "Актау"],
        },
      });
    }

    const user = await prisma.user.upsert({
      where: { email: demo.email },
      update: { passwordHash: defaultPasswordHash, displayName: demo.displayName, isActive: true },
      create: { email: demo.email, passwordHash: defaultPasswordHash, displayName: demo.displayName, isActive: true },
    });

    await prisma.organizationMember.upsert({
      where: { userId_organizationId_role: { userId: user.id, organizationId: org.id, role: demo.role } },
      update: {},
      create: { userId: user.id, organizationId: org.id, role: demo.role },
    });
  }

  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (email && password && password.length >= 14) {
    const organization = await prisma.organization.upsert({
      where: { slug: "tendermarket-operations" },
      update: {},
      create: { slug: "tendermarket-operations", name: "TenderMarket Operations" },
    });
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.upsert({
      where: { email },
      update: { passwordHash },
      create: { email, passwordHash, displayName: "TenderMarket Admin" },
    });
    await prisma.organizationMember.upsert({
      where: { userId_organizationId_role: { userId: user.id, organizationId: organization.id, role: AccountRole.ADMIN } },
      update: {},
      create: { userId: user.id, organizationId: organization.id, role: AccountRole.ADMIN },
    });
  }
}

main().finally(() => prisma.$disconnect());
