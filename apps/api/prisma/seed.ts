import {
  PrismaClient,
  AccountRole,
  ItemType,
  CoverageMode,
  RequestStatus,
  OfferStatus,
  DealStage,
  SubcontractStatus,
  DocumentType,
  DocumentSignStatus,
} from "@prisma/client";
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
  console.log("==> Seeding categories...");
  const catMap = new Map<string, string>();
  for (const category of categories) {
    const c = await prisma.category.upsert({
      where: { slug: category.slug },
      update: category,
      create: category,
    });
    catMap.set(category.slug, c.id);
  }

  const defaultPasswordHash = await bcrypt.hash("LocalTestPass2026!", 12);

  console.log("==> Seeding organizations & users...");
  // 1. Customer
  const customerOrg = await prisma.organization.upsert({
    where: { slug: "kazpromzakup" },
    update: { name: "ТОО КазПромЗакуп" },
    create: { slug: "kazpromzakup", name: "ТОО КазПромЗакуп" },
  });
  const customerUser = await prisma.user.upsert({
    where: { email: "customer@tendermarket.test" },
    update: { passwordHash: defaultPasswordHash, displayName: "ТОО КазПромЗакуп (Заказчик)", isActive: true },
    create: { email: "customer@tendermarket.test", passwordHash: defaultPasswordHash, displayName: "ТОО КазПромЗакуп (Заказчик)", isActive: true },
  });
  await prisma.organizationMember.upsert({
    where: { userId_organizationId_role: { userId: customerUser.id, organizationId: customerOrg.id, role: AccountRole.CUSTOMER } },
    update: {},
    create: { userId: customerUser.id, organizationId: customerOrg.id, role: AccountRole.CUSTOMER },
  });

  // 2. Primary Supplier (ВостокСнабСервис)
  const supplierOrg = await prisma.organization.upsert({
    where: { slug: "vostoksnabservice" },
    update: { name: "ТОО ВостокСнабСервис" },
    create: { slug: "vostoksnabservice", name: "ТОО ВостокСнабСервис" },
  });
  const supplierUser = await prisma.user.upsert({
    where: { email: "supplier@tendermarket.test" },
    update: { passwordHash: defaultPasswordHash, displayName: "ТОО ВостокСнабСервис (Поставщик)", isActive: true },
    create: { email: "supplier@tendermarket.test", passwordHash: defaultPasswordHash, displayName: "ТОО ВостокСнабСервис (Поставщик)", isActive: true },
  });
  await prisma.organizationMember.upsert({
    where: { userId_organizationId_role: { userId: supplierUser.id, organizationId: supplierOrg.id, role: AccountRole.SUPPLIER } },
    update: {},
    create: { userId: supplierUser.id, organizationId: supplierOrg.id, role: AccountRole.SUPPLIER },
  });
  const supplierProfile1 = await prisma.supplierProfile.upsert({
    where: { organizationId: supplierOrg.id },
    update: {
      publicName: "ТОО ВостокСнабСервис",
      about: "Крупный сертифицированный поставщик компьютерной техники, мебели и подрядных услуг по Казахстану.",
      isPublished: true,
      deliveryRegions: ["Алматы", "Астана", "Шымкент", "Өскемен", "Усть-Каменогорск", "Актау", "Весь Казахстан"],
      averageRating: 4.9,
      reviewCount: 38,
    },
    create: {
      organizationId: supplierOrg.id,
      publicName: "ТОО ВостокСнабСервис",
      about: "Крупный сертифицированный поставщик компьютерной техники, мебели и подрядных услуг по Казахстану.",
      isPublished: true,
      deliveryRegions: ["Алматы", "Астана", "Шымкент", "Өскемен", "Усть-Каменогорск", "Актау", "Весь Казахстан"],
      averageRating: 4.9,
      reviewCount: 38,
    },
  });

  // 3. Arbiter
  const arbiterOrg = await prisma.organization.upsert({
    where: { slug: "arbitration-board" },
    update: { name: "Арбитражная Коллегия" },
    create: { slug: "arbitration-board", name: "Арбитражная Коллегия" },
  });
  const arbiterUser = await prisma.user.upsert({
    where: { email: "arbiter@tendermarket.test" },
    update: { passwordHash: defaultPasswordHash, displayName: "Арбитр ТендерМаркет", isActive: true },
    create: { email: "arbiter@tendermarket.test", passwordHash: defaultPasswordHash, displayName: "Арбитр ТендерМаркет", isActive: true },
  });
  await prisma.organizationMember.upsert({
    where: { userId_organizationId_role: { userId: arbiterUser.id, organizationId: arbiterOrg.id, role: AccountRole.ARBITER } },
    update: {},
    create: { userId: arbiterUser.id, organizationId: arbiterOrg.id, role: AccountRole.ARBITER },
  });

  // 4. Admin
  const adminOrg = await prisma.organization.upsert({
    where: { slug: "tendermarket-operations" },
    update: { name: "TenderMarket Operations" },
    create: { slug: "tendermarket-operations", name: "TenderMarket Operations" },
  });
  const adminUser = await prisma.user.upsert({
    where: { email: "admin@tendermarket.test" },
    update: { passwordHash: defaultPasswordHash, displayName: "Администратор Платформы", isActive: true },
    create: { email: "admin@tendermarket.test", passwordHash: defaultPasswordHash, displayName: "Администратор Платформы", isActive: true },
  });
  await prisma.organizationMember.upsert({
    where: { userId_organizationId_role: { userId: adminUser.id, organizationId: adminOrg.id, role: AccountRole.ADMIN } },
    update: {},
    create: { userId: adminUser.id, organizationId: adminOrg.id, role: AccountRole.ADMIN },
  });

  // Additional suppliers for realistic directory
  const extraSuppliers = [
    {
      slug: "kaztechnosnab",
      name: "ТОО КазТехноСнаб",
      email: "supplier2@tendermarket.test",
      about: "Прямые поставки серверного оборудования, рабочих станций и сетевых компонентов.",
      regions: ["Алматы", "Астана", "Шымкент", "Весь Казахстан"],
      cats: ["electronics", "equipment"],
      rating: 4.8,
      reviews: 24,
    },
    {
      slug: "officecomfort-kz",
      name: "ТОО ОфисКомфорт Казахстан",
      email: "supplier3@tendermarket.test",
      about: "Комплексное оснащение офисных пространств, эргономичная мебель и канцелярия оптом.",
      regions: ["Астана", "Караганда", "Алматы"],
      cats: ["furniture", "office"],
      rating: 4.7,
      reviews: 19,
    },
    {
      slug: "promstroymontazh",
      name: "ТОО ПромСтройМонтаж",
      email: "supplier4@tendermarket.test",
      about: "Профессиональные монтажные работы, СКС, электромонтаж, вентиляция и пусконаладка.",
      regions: ["Өскемен", "Усть-Каменогорск", "Актау", "Атырау", "Весь Казахстан"],
      cats: ["equipment", "home"],
      rating: 5.0,
      reviews: 31,
    },
    {
      slug: "foodsnab-service",
      name: "ТОО ФудСнаб Сервис",
      email: "supplier5@tendermarket.test",
      about: "Оптовое снабжение предприятий продуктами питания и бытовыми товарами.",
      regions: ["Алматы", "Астана", "Шымкент"],
      cats: ["food", "home"],
      rating: 4.6,
      reviews: 15,
    },
  ];

  const orgMap = new Map<string, string>();
  orgMap.set("vostoksnabservice", supplierOrg.id);

  for (const s of extraSuppliers) {
    const o = await prisma.organization.upsert({
      where: { slug: s.slug },
      update: { name: s.name },
      create: { slug: s.slug, name: s.name },
    });
    orgMap.set(s.slug, o.id);

    const u = await prisma.user.upsert({
      where: { email: s.email },
      update: { passwordHash: defaultPasswordHash, displayName: s.name, isActive: true },
      create: { email: s.email, passwordHash: defaultPasswordHash, displayName: s.name, isActive: true },
    });
    await prisma.organizationMember.upsert({
      where: { userId_organizationId_role: { userId: u.id, organizationId: o.id, role: AccountRole.SUPPLIER } },
      update: {},
      create: { userId: u.id, organizationId: o.id, role: AccountRole.SUPPLIER },
    });

    const prof = await prisma.supplierProfile.upsert({
      where: { organizationId: o.id },
      update: { publicName: s.name, about: s.about, deliveryRegions: s.regions, isPublished: true, averageRating: s.rating, reviewCount: s.reviews },
      create: { organizationId: o.id, publicName: s.name, about: s.about, deliveryRegions: s.regions, isPublished: true, averageRating: s.rating, reviewCount: s.reviews },
    });

    for (const catSlug of s.cats) {
      const catId = catMap.get(catSlug);
      if (catId) {
        await prisma.supplierCategory.upsert({
          where: { supplierId_categoryId: { supplierId: prof.id, categoryId: catId } },
          update: {},
          create: { supplierId: prof.id, categoryId: catId },
        });
      }
    }
  }

  // Link categories to primary supplier
  for (const catSlug of ["electronics", "furniture", "office", "equipment"]) {
    const catId = catMap.get(catSlug);
    if (catId) {
      await prisma.supplierCategory.upsert({
        where: { supplierId_categoryId: { supplierId: supplierProfile1.id, categoryId: catId } },
        update: {},
        create: { supplierId: supplierProfile1.id, categoryId: catId },
      });
    }
  }

  console.log("==> Seeding published products & services...");
  const catalogProducts = [
    {
      orgSlug: "vostoksnabservice",
      catSlug: "electronics",
      name: "Ноутбук 14″ Lenovo ThinkBook Pro (Core i5, 16GB, 512GB SSD)",
      slug: "lenovo-thinkbook-14-pro",
      type: ItemType.PRODUCT,
      price: 280000,
      unit: "шт.",
      region: "Весь Казахстан",
      description: "Надежный бизнес-ноутбук для офисной работы, лицензионная Windows 11 Pro, гарантия 12 мес.",
      media: { image: "/products/laptop.png" },
    },
    {
      orgSlug: "kaztechnosnab",
      catSlug: "electronics",
      name: "Серверная стойка 42U Telecom Pro с блоком распределения питания PDU",
      slug: "server-rack-42u-telecom",
      type: ItemType.PRODUCT,
      price: 450000,
      unit: "шт.",
      region: "Астана",
      description: "Напольный 19-дюймовый шкаф с перфорированными дверями, нагрузка до 800 кг.",
      media: { image: "/products/laptop.png" },
    },
    {
      orgSlug: "officecomfort-kz",
      catSlug: "furniture",
      name: "Кресло офисное эргономичное Expert (сетка, поясничная поддержка)",
      slug: "ergonomic-chair-expert",
      type: ItemType.PRODUCT,
      price: 48000,
      unit: "шт.",
      region: "Алматы",
      description: "Анатомическая спинка, газлифт 4 класса, регулируемые 3D-подлокотники, цвет графит.",
      media: { image: "/products/office-chair.png" },
    },
    {
      orgSlug: "officecomfort-kz",
      catSlug: "furniture",
      name: "Стол переговорный модульный 240х120 см (дуб сонома / металл)",
      slug: "meeting-table-modular-240",
      type: ItemType.PRODUCT,
      price: 160000,
      unit: "шт.",
      region: "Астана",
      description: "Усиленный металлический каркас, лючки для вывода кабелей, вместимость до 10 человек.",
      media: { image: "/products/office-chair.png" },
    },
    {
      orgSlug: "vostoksnabservice",
      catSlug: "office",
      name: "Бумага офисная A4 SvetoCopy Classic (80 г/м², 500 листов)",
      slug: "paper-a4-svetocopy-classic",
      type: ItemType.PRODUCT,
      price: 2400,
      unit: "пачка",
      region: "Весь Казахстан",
      description: "Универсальная бумага марки С, белизна 146% CIE, 5 пачек в коробке.",
      media: { image: "/products/office-chair.png" },
    },
    {
      orgSlug: "promstroymontazh",
      catSlug: "equipment",
      name: "Перфоратор профессиональный 1200W SDS-Max в кейсе",
      slug: "hammer-drill-pro-1200w",
      type: ItemType.PRODUCT,
      price: 65000,
      unit: "шт.",
      region: "Шымкент",
      description: "Энергия удара 9 Дж, виброзащита, металлический корпус редуктора.",
      media: { image: "/products/drill.png" },
    },
    {
      orgSlug: "promstroymontazh",
      catSlug: "equipment",
      name: "Сварочный аппарат инверторный ProCraft 250A (MMA/TIG)",
      slug: "welding-inverter-procraft-250",
      type: ItemType.PRODUCT,
      price: 52000,
      unit: "шт.",
      region: "Актау",
      description: "Работает от 160В, цифровой дисплей, кабельная оснастка в комплекте.",
      media: { image: "/products/drill.png" },
    },
    {
      orgSlug: "foodsnab-service",
      catSlug: "food",
      name: "Продуктовый набор для вахтовых городков «Стандарт» (30 дней)",
      slug: "grocery-pack-standard-vahta",
      type: ItemType.PRODUCT,
      price: 18500,
      unit: "набор",
      region: "Атырау",
      description: "Крупы, консервы, чай, сахар, масло в индивидуальной герметичной фасовке.",
      media: { image: "/products/grocery-set.png" },
    },
    // УСЛУГИ:
    {
      orgSlug: "promstroymontazh",
      catSlug: "equipment",
      name: "Монтаж и пусконаладка локальной сети СКС и Wi-Fi оборудования",
      slug: "service-lan-cabling-sks",
      type: ItemType.SERVICE,
      price: 15000,
      unit: "точка",
      region: "Өскемен",
      description: "Прокладка витой пары Cat.6, монтаж патч-панелей, маркировка, тестирование Fluke.",
      media: { image: "/products/drill.png" },
    },
    {
      orgSlug: "promstroymontazh",
      catSlug: "home",
      name: "Техническое обслуживание систем вентиляции и кондиционирования",
      slug: "service-hvac-maintenance",
      type: ItemType.SERVICE,
      price: 35000,
      unit: "объект",
      region: "Алматы",
      description: "Чистка теплообменников, антибактериальная обработка, дозаправка хладагентом.",
      media: { image: "/products/sofa.png" },
    },
    {
      orgSlug: "vostoksnabservice",
      catSlug: "office",
      name: "Комплексный клининг коммерческих помещений и офисов",
      slug: "service-commercial-cleaning",
      type: ItemType.SERVICE,
      price: 450,
      unit: "м²",
      region: "Астана",
      description: "Генеральная уборка, мытье витражей, химчистка ковролина профессиональной химией.",
      media: { image: "/products/office-chair.png" },
    },
    {
      orgSlug: "vostoksnabservice",
      catSlug: "equipment",
      name: "Грузоперевозки тентованными фурами по Казахстану (до 20 тонн)",
      slug: "service-freight-truck-20t",
      type: ItemType.SERVICE,
      price: 120000,
      unit: "рейс",
      region: "Весь Казахстан",
      description: "GPS-мониторинг, страхование грузов, оформление всех транспортных накладных.",
      media: { image: "/products/drill.png" },
    },
  ];

  for (const p of catalogProducts) {
    const orgId = orgMap.get(p.orgSlug) || supplierOrg.id;
    const catId = catMap.get(p.catSlug) || catMap.get("electronics")!;
    await prisma.product.upsert({
      where: { organizationId_slug: { organizationId: orgId, slug: p.slug } },
      update: {
        name: p.name,
        type: p.type,
        price: p.price,
        unit: p.unit,
        region: p.region,
        description: p.description,
        isPublished: true,
        media: p.media,
        categoryId: catId,
      },
      create: {
        organizationId: orgId,
        categoryId: catId,
        name: p.name,
        slug: p.slug,
        type: p.type,
        price: p.price,
        unit: p.unit,
        region: p.region,
        description: p.description,
        isPublished: true,
        media: p.media,
      },
    });
  }

  console.log("==> Seeding requests, deals, subcontracts and RK documents...");
  // 1. Open Purchase Request from customer
  await prisma.purchaseRequest.upsert({
    where: { number: 1001 },
    update: {},
    create: {
      number: 1001,
      customerId: customerUser.id,
      organizationId: customerOrg.id,
      title: "Поставка офисной техники и ноутбуков для нового офиса",
      description: "Требуется поставка 5 ноутбуков для сотрудников и 1 МФУ формата А4 в филиал в Алматы.",
      region: "Алматы",
      deliveryAddress: "пр. Достык, 120",
      type: ItemType.PRODUCT,
      status: RequestStatus.OPEN,
      budget: 1500000,
      coverageMode: CoverageMode.FULL,
      publishedAt: new Date(),
      items: {
        create: [
          { name: "Ноутбук 14-15″ Core i5 / 16GB", quantity: 5, unit: "шт.", type: ItemType.PRODUCT },
          { name: "МФУ лазерное сетевое", quantity: 1, unit: "шт.", type: ItemType.PRODUCT },
        ],
      },
    },
  });

  // 2. Completed deal with subcontracts & official Kazakhstani documents
  const dealReq = await prisma.purchaseRequest.upsert({
    where: { number: 1002 },
    update: {},
    create: {
      number: 1002,
      customerId: customerUser.id,
      organizationId: customerOrg.id,
      title: "Монтаж локальной вычислительной сети в Өскемен (Усть-Каменогорск)",
      description: "Монтаж СКС на объекте заказчика: 40 портов, кроссовый шкаф, тестирование линий.",
      region: "Өскемен",
      deliveryAddress: "ул. Кабанбай батыра, 45",
      type: ItemType.SERVICE,
      status: RequestStatus.AWARDED,
      budget: 600000,
      coverageMode: CoverageMode.FULL,
      publishedAt: new Date(Date.now() - 3 * 86400000),
      items: {
        create: [
          { name: "Монтаж кабельных трасс СКС", quantity: 40, unit: "порт", type: ItemType.SERVICE },
        ],
      },
    },
  });

  const offer = await prisma.offer.upsert({
    where: { requestId_supplierId_version: { requestId: dealReq.id, supplierId: supplierOrg.id, version: 1 } },
    update: {},
    create: {
      requestId: dealReq.id,
      supplierId: supplierOrg.id,
      authoredById: supplierUser.id,
      totalPrice: 580000,
      status: OfferStatus.ACCEPTED,
      deliveryDate: new Date(Date.now() + 7 * 86400000),
      note: "Готовы выполнить под ключ силами проверенной региональной бригады субподряда.",
    },
  });

  const deal = await prisma.deal.upsert({
    where: { offerId: offer.id },
    update: {},
    create: {
      number: 2001,
      offerId: offer.id,
      buyerOrganizationId: customerOrg.id,
      supplierOrganizationId: supplierOrg.id,
      agreedTotal: 580000,
      stage: DealStage.IN_PROGRESS,
    },
  });

  // Subcontract #1 (General supplier from Aktau / Almaty hiring local Ust-Kamenogorsk team)
  const subcontract1 = await prisma.subcontract.upsert({
    where: { number: 3001 },
    update: {},
    create: {
      number: 3001,
      dealId: deal.id,
      generalSupplierOrgId: supplierOrg.id,
      title: "Монтаж кабельных линий и кроссировка шкафа в Усть-Каменогорске",
      targetRegion: "Өскемен",
      description: "Выигран генподряд. Ищем локального сертифицированного субподрядчика в г. Усть-Каменогорск для физического монтажа 40 портов СКС.",
      agreedAmount: 420000,
      status: SubcontractStatus.SEARCHING,
      deadline: new Date(Date.now() + 5 * 86400000),
      contractTerms: "Оплата по факту подписания электронного АВР на портале в течение 3 рабочих дней.",
    },
  });

  // Subcontract Bid from local contractor
  const localContractorOrgId = orgMap.get("promstroymontazh")!;
  const existingBid = await prisma.subcontractBid.findFirst({
    where: { subcontractId: subcontract1.id, contractorOrgId: localContractorOrgId },
  });
  if (!existingBid) {
    await prisma.subcontractBid.create({
      data: {
        subcontractId: subcontract1.id,
        contractorOrgId: localContractorOrgId,
        price: 395000,
        note: "Имеем 2 готовые бригады в Усть-Каменогорске со всеми допусками и тестером Fluke DSX-5000.",
        status: "PENDING",
      },
    });
  }

  // Official Documents under RK Standards
  const docTypes = [
    { type: DocumentType.CONTRACT, num: "ДОГ-2001", title: "Типовой договор поставки и оказания услуг № ДОГ-2001" },
    { type: DocumentType.INVOICE, num: "СЧ-2001", title: "Счет на оплату № СЧ-2001" },
    { type: DocumentType.ACT_OF_COMPLETION, num: "АВР-2001", title: "Акт выполненных работ (оказанных услуг) Форма Р-1" },
    { type: DocumentType.WAYBILL, num: "Н-2001", title: "Накладная на отпуск запасов на сторону Форма З-2" },
    { type: DocumentType.PAYMENT_RECEIPT, num: "ЧЕК-2001", title: "Фискальный электронный чек оплаты сделки" },
  ];

  for (const d of docTypes) {
    await prisma.dealDocument.upsert({
      where: { dealId_type: { dealId: deal.id, type: d.type } },
      update: {},
      create: {
        dealId: deal.id,
        type: d.type,
        number: d.num,
        title: d.title,
        status: DocumentSignStatus.DRAFT,
        content: {
          number: d.num,
          title: d.title,
          date: new Date().toLocaleDateString("ru-KZ"),
          seller: { name: "ТОО ВостокСнабСервис", bin: "190540028912" },
          buyer: { name: "ТОО КазПромЗакуп", bin: "210440019231" },
          totalKzt: 580000,
          currency: "KZT",
        },
      },
    });
  }

  console.log("==> Database seed successfully completed!");
}

main()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
