import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AccountRole, CoverageMode, DocumentSignStatus, DocumentType, ItemType, OfferStatus, RequestStatus, SubcontractStatus } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { PrismaService } from "./prisma.service";
import {
  generateActOfCompletionContent,
  generateContractContent,
  generateInvoiceContent,
  generateReceiptContent,
  generateWaybillContent,
} from "./document-templates";

const canonicalCity = (city: string) => {
  const value = city.trim().toLocaleLowerCase("ru-KZ");
  if (["усть-каменогорск", "ust-kamenogorsk", "oskemen", "өскемен", "оскемен"].includes(value)) return "Өскемен";
  return city.trim();
};

@Injectable()
export class MarketplaceService {
  constructor(private readonly prisma: PrismaService) {}

  categories() { return this.prisma.category.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { children: { where: { isActive: true }, orderBy: { sortOrder: "asc" } } } }); }

  private async requireAdmin(userId: string) {
    const admin = await this.prisma.organizationMember.findFirst({ where: { userId, role: AccountRole.ADMIN } });
    if (!admin) throw new NotFoundException("Раздел не найден.");
    return admin;
  }

  private async linkAttachments(userId: string, ids: string[] | undefined, field: "requestId" | "offerId" | "messageId", entityId: string) {
    const uniqueIds = [...new Set(ids ?? [])];
    if (!uniqueIds.length) return;
    const unlinked = await this.prisma.attachment.count({ where: { id: { in: uniqueIds }, uploadedById: userId, requestId: null, offerId: null, messageId: null } });
    if (unlinked !== uniqueIds.length) throw new BadRequestException("Один или несколько файлов не найдены либо уже прикреплены.");
    await this.prisma.attachment.updateMany({ where: { id: { in: uniqueIds }, uploadedById: userId }, data: { [field]: entityId } });
  }

  async products(query: { q?: string; category?: string; region?: string; type?: "PRODUCT" | "SERVICE"; take?: number }) {
    const city = query.region && query.region !== "Весь Казахстан" ? canonicalCity(query.region) : undefined;
    const cityAliases = city === "Өскемен" ? ["Өскемен", "Усть-Каменогорск", "Ust-Kamenogorsk", "Oskemen"] : city ? [city] : [];
    const rows = await this.prisma.product.findMany({
      where: {
        isPublished: true,
        organization: { supplierProfile: { isPublished: true } },
        ...(query.type ? { type: query.type } : {}),
        ...(query.category ? { category: { slug: query.category } } : {}),
        ...(query.region === "Весь Казахстан" ? {} : city ? { OR: [{ region: null }, { region: "Весь Казахстан" }, ...cityAliases.map(region => ({ region }))] } : {}),
        ...(query.q ? { AND: [{ OR: [
          { name: { contains: query.q, mode: "insensitive" } },
          { description: { contains: query.q, mode: "insensitive" } },
          { organization: { name: { contains: query.q, mode: "insensitive" } } },
          { organization: { supplierProfile: { publicName: { contains: query.q, mode: "insensitive" } } } },
        ] }] } : {}),
      },
      include: { category: true, organization: { select: { id: true, name: true, supplierProfile: { select: { averageRating: true, reviewCount: true, isPublished: true } } } } },
      orderBy: { updatedAt: "desc" }, take: Math.min(query.take ?? 24, 100),
    });
    return city ? [...rows].sort((a, b) => {
      const rank = (region: string | null) => region && cityAliases.includes(region) ? 0 : region === "Весь Казахстан" ? 1 : 2;
      return rank(a.region) - rank(b.region) || b.updatedAt.getTime() - a.updatedAt.getTime();
    }) : rows;
  }

  async myProducts(userId: string) {
    const memberships = await this.prisma.organizationMember.findMany({ where: { userId, role: AccountRole.SUPPLIER }, select: { organizationId: true } });
    return this.prisma.product.findMany({ where: { organizationId: { in: memberships.map(item => item.organizationId) } }, include: { category: true }, orderBy: { updatedAt: "desc" } });
  }

  async saveProduct(userId: string, input: any, productId?: string) {
    const membership = await this.prisma.organizationMember.findFirst({ where: { userId, role: AccountRole.SUPPLIER } });
    if (!membership) throw new ForbiddenException("Управление каталогом доступно поставщику.");
    const category = await this.prisma.category.findFirst({ where: { id: input.categoryId, isActive: true } });
    if (!category) throw new BadRequestException("Выберите активную категорию.");
    const slugBase = (input.name as string).toLowerCase().normalize("NFKD").replace(/[^a-zа-я0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 60) || "product";
    const data = { name: input.name.trim(), slug: `${slugBase}-${productId ?? randomBytes(5).toString("hex")}`, type: input.type === "SERVICE" ? ItemType.SERVICE : ItemType.PRODUCT, description: input.description?.trim() || null, categoryId: category.id, price: input.price ?? null, currency: "KZT", unit: input.unit || "шт.", region: input.region || null, isPublished: Boolean(input.isPublished) };
    if (productId) {
      const updated = await this.prisma.product.updateMany({ where: { id: productId, organizationId: membership.organizationId }, data });
      if (!updated.count) throw new NotFoundException("Товар не найден.");
      return this.prisma.product.findUnique({ where: { id: productId }, include: { category: true } });
    }
    return this.prisma.product.create({ data: { ...data, organizationId: membership.organizationId } , include: { category: true } });
  }

  async deleteProduct(userId: string, productId: string) {
    const membership = await this.prisma.organizationMember.findFirst({ where: { userId, role: AccountRole.SUPPLIER } });
    if (!membership) throw new NotFoundException("Товар не найден.");
    const result = await this.prisma.product.deleteMany({ where: { id: productId, organizationId: membership.organizationId } });
    if (!result.count) throw new NotFoundException("Товар не найден.");
    return { id: productId, deleted: true };
  }

  async supplierSummary(userId: string) {
    const memberships = await this.prisma.organizationMember.findMany({ where: { userId, role: AccountRole.SUPPLIER }, select: { organizationId: true } });
    const ids = memberships.map(item => item.organizationId);
    const [profile, products, offers, deals, ads] = await Promise.all([
      this.prisma.supplierProfile.findFirst({ where: { organizationId: { in: ids } }, include: { categories: { include: { category: true } } } }),
      this.prisma.product.count({ where: { organizationId: { in: ids }, isPublished: true } }),
      this.prisma.offer.count({ where: { supplierId: { in: ids }, status: { in: ["SUBMITTED", "UPDATED"] } } }),
      this.prisma.deal.count({ where: { supplierOrganizationId: { in: ids }, stage: { notIn: ["COMPLETED", "CANCELLED"] } } }),
      this.prisma.advertisement.count({ where: { organizationId: { in: ids }, status: { in: ["PENDING_REVIEW", "ACTIVE"] } } }),
    ]);
    return { profile, publishedProducts: products, openOffers: offers, activeDeals: deals, campaigns: ads };
  }

  async myDeals(userId: string) {
    const memberships = await this.prisma.organizationMember.findMany({ where: { userId }, select: { organizationId: true } });
    const organizationIds = memberships.map(item => item.organizationId);
    const buyerRequestIds = (await this.prisma.purchaseRequest.findMany({ where: { customerId: userId }, select: { id: true } })).map(item => item.id);
    return this.prisma.deal.findMany({ where: { OR: [{ buyerOrganizationId: { in: organizationIds } }, { supplierOrganizationId: { in: organizationIds } }, { offer: { requestId: { in: buyerRequestIds } } }] }, include: { offer: { include: { request: { select: { id: true, title: true, number: true, region: true } }, supplier: { select: { name: true } } } } }, orderBy: { updatedAt: "desc" }, take: 100 });
  }

  async suppliers(query: { q?: string; category?: string; region?: string; take?: number }) {
    const search = query.q?.trim();
    const city = query.region ? canonicalCity(query.region) : undefined;
    const cityAliases = city === "Өскемен" ? ["Өскемен", "Усть-Каменогорск", "Ust-Kamenogorsk", "Oskemen"] : city ? [city] : [];
    const profiles = await this.prisma.supplierProfile.findMany({
      where: {
        isPublished: true,
        ...(query.category ? { categories: { some: { category: { slug: query.category } } } } : {}),
        ...((query.region || search) ? { AND: [
          ...(query.region ? [{ OR: [
            { deliveryRegions: { isEmpty: true } },
            ...cityAliases.map(alias => ({ deliveryRegions: { has: alias } })),
            { deliveryRegions: { has: "Весь Казахстан" } },
          ] }] : []),
          ...(search ? [{ OR: [
            { publicName: { contains: search, mode: "insensitive" as const } },
            { about: { contains: search, mode: "insensitive" as const } },
            { organization: { name: { contains: search, mode: "insensitive" as const } } },
            { categories: { some: { category: { name: { contains: search, mode: "insensitive" as const } } } } },
          ] }] : []),
        ] } : {}),
      },
      include: {
        categories: { include: { category: { select: { id: true, slug: true, name: true } } } },
        organization: { select: { id: true, name: true, verifiedAt: true, _count: { select: { products: true } } } },
      },
      orderBy: [{ averageRating: "desc" }, { reviewCount: "desc" }, { publicName: "asc" }],
      take: Math.min(Math.max(query.take ?? 48, 1), 100),
    });
    const ordered = city ? [...profiles].sort((a, b) => {
      const localRank = (regions: string[]) => regions.some(item => cityAliases.some(alias => item.toLocaleLowerCase("ru-KZ") === alias.toLocaleLowerCase("ru-KZ"))) ? 0 : regions.includes("Весь Казахстан") ? 1 : 2;
      return localRank(a.deliveryRegions) - localRank(b.deliveryRegions);
    }) : profiles;
    return ordered.map(profile => ({
      id: profile.id,
      name: profile.publicName || profile.organization.name,
      organizationName: profile.organization.name,
      about: profile.about,
      categories: profile.categories.map(item => item.category),
      regions: profile.deliveryRegions,
      rating: profile.averageRating,
      reviewCount: profile.reviewCount,
      productCount: profile.organization._count.products,
      verified: Boolean(profile.organization.verifiedAt),
    }));
  }

  async createRequest(userId: string, input: any) {
    if (!input.items?.length) throw new BadRequestException("В заявке нужна хотя бы одна позиция.");
    const categorySlugs = [...new Set(input.items.map((item: any) => item.category).filter(Boolean))] as string[];
    const categoryRows = categorySlugs.length ? await this.prisma.category.findMany({ where: { slug: { in: categorySlugs }, isActive: true }, select: { id: true, slug: true } }) : [];
    const categoryIdBySlug = new Map(categoryRows.map(category => [category.slug, category.id]));
    if (categorySlugs.some(slug => !categoryIdBySlug.has(slug))) throw new BadRequestException("Выбрана неизвестная категория товара.");
    const created = await this.prisma.purchaseRequest.create({ data: {
      title: input.title,
      description: input.description,
      type: input.type === "SERVICE" ? ItemType.SERVICE : ItemType.PRODUCT,
      customerId: userId,
      region: input.region,
      deliveryAddress: input.deliveryAddress,
      deliveryDeadline: input.deliveryDeadline ? new Date(input.deliveryDeadline) : undefined,
      responseDeadline: input.responseDeadline ? new Date(input.responseDeadline) : undefined,
      budget: input.budget,
      coverageMode: input.coverageMode === "partial" ? CoverageMode.PARTIAL : CoverageMode.FULL,
      status: RequestStatus.OPEN,
      publishedAt: new Date(),
      items: { create: input.items.map((item: any, index: number) => ({ name: item.name, details: item.details, type: (item.type === "SERVICE" || input.type === "SERVICE") ? ItemType.SERVICE : ItemType.PRODUCT, quantity: item.quantity, unit: item.unit ?? "шт.", categoryId: item.category ? categoryIdBySlug.get(item.category) : undefined, preferredBrand: item.preferredBrand, allowEquivalent: item.allowEquivalent ?? true, sortOrder: index })) },
    }, include: { items: true } });
    await this.linkAttachments(userId, input.attachments, "requestId", created.id);

    const categoryIds = [...new Set(created.items.map(item => item.categoryId).filter(Boolean))] as string[];
    if (categoryIds.length) {
      const createdCity = canonicalCity(created.region);
      const cityAliases = createdCity === "Өскемен" ? ["Өскемен", "Усть-Каменогорск", "Ust-Kamenogorsk", "Oskemen"] : [createdCity];
      const profiles = await this.prisma.supplierProfile.findMany({ where: { isPublished: true, categories: { some: { categoryId: { in: categoryIds } } }, ...(createdCity === "Весь Казахстан" ? {} : { OR: [{ deliveryRegions: { isEmpty: true } }, ...cityAliases.map(alias => ({ deliveryRegions: { has: alias } })), { deliveryRegions: { has: "Весь Казахстан" } }] }) }, select: { organizationId: true } });
      const members = await this.prisma.organizationMember.findMany({ where: { organizationId: { in: profiles.map(profile => profile.organizationId) }, role: "SUPPLIER" }, select: { userId: true } });
      const notifications = members.map(member => ({ userId: member.userId, type: "request.match", title: "Новая подходящая заявка", body: `${created.title} · ${created.region}`, payload: { requestId: created.id } }));
      if (notifications.length) await this.prisma.notification.createMany({ data: notifications });
    }
    return created;
  }

  myRequests(userId: string) {
    return this.prisma.purchaseRequest.findMany({ where: { customerId: userId }, include: { items: { orderBy: { sortOrder: "asc" } }, _count: { select: { offers: true } } }, orderBy: { updatedAt: "desc" } });
  }

  async supplierInbox(userId: string) {
    const memberships = await this.prisma.organizationMember.findMany({ where: { userId, role: "SUPPLIER" }, select: { organizationId: true } });
    if (!memberships.length) return [];
    const profiles = await this.prisma.supplierProfile.findMany({ where: { organizationId: { in: memberships.map(member => member.organizationId) }, isPublished: true }, select: { categories: { select: { categoryId: true } }, deliveryRegions: true } });
    const categoryIds = [...new Set(profiles.flatMap(profile => profile.categories.map(item => item.categoryId)))];
    const hasNationwideOrUnspecified = profiles.some(profile => !profile.deliveryRegions.length || profile.deliveryRegions.includes("Весь Казахстан"));
    const regions = [...new Set(profiles.flatMap(profile => profile.deliveryRegions.filter(region => region !== "Весь Казахстан").map(canonicalCity)))];
    if (!categoryIds.length) return [];
    const requestRegions = [...regions, "Весь Казахстан", ...(regions.includes("Өскемен") ? ["Усть-Каменогорск", "Ust-Kamenogorsk", "Oskemen"] : [])];
    const requests = await this.prisma.purchaseRequest.findMany({ where: { status: RequestStatus.OPEN, ...(!hasNationwideOrUnspecified ? { region: { in: requestRegions } } : {}), items: { some: { categoryId: { in: categoryIds } } } }, include: { items: { include: { category: true }, orderBy: { sortOrder: "asc" } }, attachments: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true } }, _count: { select: { offers: true } } }, orderBy: { publishedAt: "desc" }, take: 300 });
    const matched = requests.filter(request => hasNationwideOrUnspecified || regions.includes(canonicalCity(request.region)) || canonicalCity(request.region) === "Весь Казахстан");
    return matched.sort((a, b) => {
      const rank = (region: string) => canonicalCity(region) === "Весь Казахстан" ? 2 : regions.includes(canonicalCity(region)) ? 0 : 1;
      return rank(a.region) - rank(b.region) || (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0);
    }).slice(0, 100);
  }

  async createOffer(userId: string, requestId: string, input: any) {
    const request = await this.prisma.purchaseRequest.findUnique({ where: { id: requestId }, include: { items: true } });
    if (!request || request.status !== RequestStatus.OPEN) throw new NotFoundException("Открытая заявка не найдена.");
    const membership = await this.prisma.organizationMember.findFirst({ where: { userId, role: "SUPPLIER" } });
    if (!membership) throw new BadRequestException("Для отклика нужен профиль поставщика.");
    const profile = await this.prisma.supplierProfile.findUnique({ where: { organizationId: membership.organizationId }, include: { categories: true } });
    if (!profile?.isPublished) throw new BadRequestException("Сначала заполните и опубликуйте витрину поставщика.");
    const supplierCategoryIds = new Set(profile.categories.map(category => category.categoryId));
    if (profile.deliveryRegions.length && !profile.deliveryRegions.map(canonicalCity).includes(canonicalCity(request.region)) && !profile.deliveryRegions.includes("Весь Казахстан")) throw new BadRequestException("Заявка указана за пределами выбранных городов доставки.");
    const eligibleItems = request.items.filter(item => !item.categoryId || supplierCategoryIds.has(item.categoryId));
    if (request.coverageMode === CoverageMode.FULL && eligibleItems.length !== request.items.length) throw new BadRequestException("Ваш профиль не покрывает категории всех позиций этой заявки.");
    const offered = new Map<string, any>((input.items ?? []).map((item: any) => [item.requestItemId, item]));
    const invalid = [...offered.keys()].some(id => !request.items.some(item => item.id === id));
    if (invalid) throw new BadRequestException("Строка предложения не принадлежит этой заявке.");
    if ([...offered.keys()].some(id => !eligibleItems.some(item => item.id === id))) throw new BadRequestException("В предложении есть категория, которой нет в вашем профиле.");
    const fullCoverage = request.items.every(item => offered.has(item.id) && offered.get(item.id).available && Number(offered.get(item.id).unitPrice) >= 0);
    if (request.coverageMode === CoverageMode.FULL && !fullCoverage) throw new BadRequestException("Заявка требует цены и наличия по каждой позиции.");
    if (!offered.size) throw new BadRequestException("Добавьте хотя бы одну позицию в предложение.");
    const merchandise = request.items.reduce((sum, item) => {
      const quote = offered.get(item.id);
      return sum + (quote?.available ? Number(item.quantity) * Number(quote.unitPrice ?? 0) : 0);
    }, 0);
    const total = merchandise + Number(input.deliveryPrice ?? 0) + Number(input.otherCosts ?? 0);
    const existing = await this.prisma.offer.findFirst({ where: { requestId, supplierId: membership.organizationId }, orderBy: { version: "desc" } });
    const offer = await this.prisma.offer.create({ data: {
      requestId, supplierId: membership.organizationId, authoredById: userId, version: (existing?.version ?? 0) + 1,
      status: OfferStatus.SUBMITTED, deliveryPrice: input.deliveryPrice ?? 0, otherCosts: input.otherCosts ?? 0,
      totalPrice: total, deliveryDate: input.deliveryDate ? new Date(input.deliveryDate) : undefined,
      paymentTerms: input.paymentTerms, note: input.note, expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
      fullCoverage, submittedAt: new Date(), items: { create: request.items.filter(item => offered.has(item.id)).map(item => { const row = offered.get(item.id); return { requestItemId: item.id, unitPrice: row.unitPrice ?? null, available: row.available ?? false, quantity: row.quantity ?? item.quantity, equivalentDescription: row.equivalentDescription, note: row.note }; }) },
    }, include: { items: true } });
    await this.linkAttachments(userId, input.attachments, "offerId", offer.id);
    await this.prisma.notification.create({ data: { userId: request.customerId, type: "offer.submitted", title: "Новое предложение", body: `Поставщик отправил предложение на заявку «${request.title}».`, payload: { requestId, offerId: offer.id } } });
    return offer;
  }

  async offersForRequest(userId: string, requestId: string) {
    const request = await this.prisma.purchaseRequest.findUnique({ where: { id: requestId }, include: { items: { include: { category: true }, orderBy: { sortOrder: "asc" } } } });
    if (!request) throw new NotFoundException("Заявка не найдена.");
    if (request.customerId !== userId) throw new NotFoundException("Заявка не найдена.");
    const offers = await this.prisma.offer.findMany({ where: { requestId, status: { in: [OfferStatus.SUBMITTED, OfferStatus.UPDATED] } }, include: { attachments: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true } }, items: { include: { requestItem: true } }, supplier: { select: { id: true, name: true, verifiedAt: true, supplierProfile: { select: { averageRating: true, reviewCount: true } } } } }, orderBy: [{ fullCoverage: "desc" }, { totalPrice: "asc" }] });
    return { request: { id: request.id, title: request.title, number: request.number, region: request.region, items: request.items }, offers };
  }

  async saveSupplierProfile(userId: string, input: { publicName: string; about?: string; regions: string[]; categoryIds: string[] }) {
    const membership = await this.prisma.organizationMember.findFirst({ where: { userId, role: "SUPPLIER" } });
    if (!membership) throw new NotFoundException("Профиль поставщика не найден.");
    const categories = await this.prisma.category.findMany({ where: { id: { in: input.categoryIds }, isActive: true }, select: { id: true } });
    if (categories.length !== new Set(input.categoryIds).size) throw new BadRequestException("Выбраны неизвестные категории.");
    const regions = [...new Set(input.regions.map(canonicalCity))];
    return this.prisma.$transaction(async tx => {
      const profile = await tx.supplierProfile.upsert({ where: { organizationId: membership.organizationId }, update: { publicName: input.publicName, about: input.about, deliveryRegions: regions, isPublished: true }, create: { organizationId: membership.organizationId, publicName: input.publicName, about: input.about, deliveryRegions: regions, isPublished: true } });
      await tx.supplierCategory.deleteMany({ where: { supplierId: profile.id } });
      if (categories.length) await tx.supplierCategory.createMany({ data: categories.map(category => ({ supplierId: profile.id, categoryId: category.id })) });
      return tx.supplierProfile.findUnique({ where: { id: profile.id }, include: { categories: { include: { category: true } } } });
    });
  }

  async acceptOffer(userId: string, offerId: string) {
    const offer = await this.prisma.offer.findUnique({ where: { id: offerId }, include: { request: true } });
    if (!offer || offer.request.customerId !== userId || offer.status !== OfferStatus.SUBMITTED) throw new NotFoundException("Предложение недоступно.");
    const buyerMembership = await this.prisma.organizationMember.findFirst({ where: { userId, role: "CUSTOMER" } });
    const deal = await this.prisma.$transaction(async tx => {
      const claimed = await tx.purchaseRequest.updateMany({ where: { id: offer.requestId, status: RequestStatus.OPEN }, data: { status: RequestStatus.AWARDED } });
      if (!claimed.count) throw new BadRequestException("Другой участник уже выбрал предложение.");
      const accepted = await tx.offer.updateMany({ where: { id: offer.id, status: OfferStatus.SUBMITTED }, data: { status: OfferStatus.ACCEPTED } });
      if (!accepted.count) throw new BadRequestException("Предложение уже недоступно.");
      await tx.offer.updateMany({ where: { requestId: offer.requestId, id: { not: offer.id }, status: { in: [OfferStatus.SUBMITTED, OfferStatus.UPDATED] } }, data: { status: OfferStatus.REJECTED } });
      const created = await tx.deal.create({ data: { offerId: offer.id, buyerOrganizationId: buyerMembership?.organizationId, supplierOrganizationId: offer.supplierId, agreedTotal: offer.totalPrice, currency: offer.currency, events: { create: { actorId: userId, type: "offer.accepted", toStage: "NEGOTIATION", payload: { offerId: offer.id, total: String(offer.totalPrice) } } }, messages: { create: { authorId: userId, body: "Предложение выбрано. Можно обсудить детали поставки здесь.", systemEvent: true } } } });
      const supplierUsers = await tx.organizationMember.findMany({ where: { organizationId: offer.supplierId, role: "SUPPLIER" }, select: { userId: true } });
      if (supplierUsers.length) await tx.notification.createMany({ data: supplierUsers.map(row => ({ userId: row.userId, type: "offer.accepted", title: "Ваше предложение выбрано", body: `Заказчик выбрал ваше предложение на заявку «${offer.request.title}».`, payload: { dealId: created.id } })) });
      return created;
    });
    await this.ensureDealDocuments(deal.id);
    return deal;
  }

  private async assertDealMember(userId: string, dealId: string) {
    const deal = await this.prisma.deal.findUnique({
      where: { id: dealId },
      include: { subcontracts: { select: { subcontractorOrgId: true } } },
    });
    if (!deal) throw new NotFoundException("Сделка не найдена.");
    const subcontractOrgs = deal.subcontracts.map(s => s.subcontractorOrgId).filter((id): id is string => Boolean(id));
    const member = await this.prisma.organizationMember.findFirst({
      where: { userId, organizationId: { in: [deal.buyerOrganizationId ?? "", deal.supplierOrganizationId, ...subcontractOrgs] } },
    });
    if (!member) throw new NotFoundException("Сделка не найдена.");
    return deal;
  }

  async dealMessages(userId: string, dealId: string) {
    await this.assertDealMember(userId, dealId);
    return this.prisma.chatMessage.findMany({ where: { dealId }, include: { author: { select: { id: true, displayName: true } }, attachments: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true } } }, orderBy: { createdAt: "asc" }, take: 500 });
  }

  async getDeal(userId: string, dealId: string) {
    const deal = await this.assertDealMember(userId, dealId);
    const viewer = await this.prisma.organizationMember.findFirst({
      where: { userId, organizationId: { in: [deal.buyerOrganizationId ?? "", deal.supplierOrganizationId] } },
      select: { role: true, organizationId: true },
    });
    const subcontracts = await this.prisma.subcontract.findMany({
      where: { dealId },
      include: {
        generalSupplier: { select: { id: true, name: true, region: true } },
        subcontractor: {
          select: {
            id: true,
            name: true,
            region: true,
            supplierProfile: { select: { publicName: true, averageRating: true, reviewCount: true } },
          },
        },
        bids: {
          include: {
            contractor: {
              select: {
                id: true,
                name: true,
                region: true,
                supplierProfile: { select: { publicName: true, averageRating: true, reviewCount: true } },
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    const fullDeal = await this.prisma.deal.findUnique({
      where: { id: dealId },
      include: {
        offer: {
          include: {
            request: { select: { id: true, title: true, number: true, region: true } },
            supplier: { select: { id: true, name: true, region: true } },
          },
        },
        events: { orderBy: { createdAt: "asc" } },
      },
    });
    const isSubcontractor = subcontracts.some(s => s.subcontractorOrgId && viewer?.organizationId === s.subcontractorOrgId);
    const documents = await this.ensureDealDocuments(dealId);
    return {
      ...fullDeal,
      subcontracts,
      documents,
      viewerRole: viewer?.role ?? (isSubcontractor ? "SUBCONTRACTOR" : null),
    };
  }

  async sendMessage(userId: string, dealId: string, body: string, attachmentIds: string[] = []) {
    const deal = await this.assertDealMember(userId, dealId);
    const message = await this.prisma.chatMessage.create({ data: { dealId, authorId: userId, body }, include: { author: { select: { id: true, displayName: true } } } });
    await this.linkAttachments(userId, attachmentIds, "messageId", message.id);
    const otherOrganizationId = (await this.prisma.organizationMember.findFirst({ where: { userId, organizationId: deal.buyerOrganizationId ?? "" } })) ? deal.supplierOrganizationId : deal.buyerOrganizationId;
    if (otherOrganizationId) {
      const users = await this.prisma.organizationMember.findMany({ where: { organizationId: otherOrganizationId }, select: { userId: true } });
      if (users.length) await this.prisma.notification.createMany({ data: users.filter(user => user.userId !== userId).map(user => ({ userId: user.userId, type: "chat.message", title: "Новое сообщение по сделке", body: body.slice(0, 180), payload: { dealId, messageId: message.id } })) });
    }
    return this.prisma.chatMessage.findUniqueOrThrow({ where: { id: message.id }, include: { author: { select: { id: true, displayName: true } }, attachments: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true } } } });
  }

  async updateDealStage(userId: string, dealId: string, nextStage: string) {
    const current = await this.assertDealMember(userId, dealId);
    const allowed: Record<string, Record<string, AccountRole[]>> = {
      NEGOTIATION: { CONFIRMED: [AccountRole.SUPPLIER], CANCELLED: [AccountRole.CUSTOMER, AccountRole.SUPPLIER], DISPUTED: [AccountRole.CUSTOMER, AccountRole.SUPPLIER] },
      CONFIRMED: { IN_PROGRESS: [AccountRole.SUPPLIER], CANCELLED: [AccountRole.CUSTOMER, AccountRole.SUPPLIER], DISPUTED: [AccountRole.CUSTOMER, AccountRole.SUPPLIER] },
      IN_PROGRESS: { SHIPPED: [AccountRole.SUPPLIER], CANCELLED: [AccountRole.CUSTOMER, AccountRole.SUPPLIER], DISPUTED: [AccountRole.CUSTOMER, AccountRole.SUPPLIER] },
      SHIPPED: { RECEIVED: [AccountRole.CUSTOMER], DISPUTED: [AccountRole.CUSTOMER, AccountRole.SUPPLIER] },
      RECEIVED: { COMPLETED: [AccountRole.CUSTOMER], DISPUTED: [AccountRole.CUSTOMER, AccountRole.SUPPLIER] },
    };
    const permittedRoles = allowed[current.stage]?.[nextStage];
    if (!permittedRoles) throw new BadRequestException(`Переход ${current.stage} → ${nextStage} сейчас недоступен.`);
    const membership = await this.prisma.organizationMember.findFirst({
      where: { userId, organizationId: { in: [current.buyerOrganizationId ?? "", current.supplierOrganizationId] } },
      select: { role: true },
    });
    if (!membership || !permittedRoles.includes(membership.role)) {
      throw new ForbiddenException(nextStage === "CONFIRMED" || nextStage === "IN_PROGRESS" || nextStage === "SHIPPED"
        ? "Следующий этап отмечает поставщик."
        : "Следующий этап отмечает заказчик.");
    }
    const result = await this.prisma.$transaction(async tx => {
      const changed = await tx.deal.updateMany({ where: { id: dealId, stage: current.stage }, data: { stage: nextStage as any, ...(nextStage === "COMPLETED" ? { completedAt: new Date() } : {}) } });
      if (!changed.count) throw new ConflictException("Этап уже изменился. Обновите страницу и проверьте текущее состояние сделки.");
      const deal = await tx.deal.findUniqueOrThrow({ where: { id: dealId } });
      await tx.dealEvent.create({ data: { dealId, actorId: userId, type: "stage.changed", fromStage: current.stage, toStage: nextStage as any } });
      await tx.chatMessage.create({ data: { dealId, authorId: userId, body: `Этап сделки изменён: ${nextStage}.`, systemEvent: true } });
      const members = await tx.organizationMember.findMany({ where: { organizationId: { in: [current.buyerOrganizationId ?? "", current.supplierOrganizationId] }, userId: { not: userId } }, select: { userId: true } });
      if (members.length) await tx.notification.createMany({ data: members.map(member => ({ userId: member.userId, type: "deal.stage", title: "Обновился этап сделки", body: `Новый этап: ${nextStage}.`, payload: { dealId } })) });
      return deal;
    });
    void this.ensureDealDocuments(dealId);
    return result;
  }

  notifications(userId: string) {
    return this.prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 100 });
  }

  async markNotificationRead(userId: string, notificationId: string) {
    const result = await this.prisma.notification.updateMany({ where: { id: notificationId, userId }, data: { status: "READ", readAt: new Date() } });
    if (!result.count) throw new NotFoundException("Уведомление не найдено.");
    return { id: notificationId, read: true };
  }

  async openDispute(userId: string, dealId: string, reason: string, details: string, attachmentIds: string[] = []) {
    const deal = await this.assertDealMember(userId, dealId);
    if (["COMPLETED", "CANCELLED"].includes(deal.stage)) throw new BadRequestException("По закрытой сделке нельзя открыть спор.");
    const feeSetting = await this.prisma.platformSetting.findUnique({ where: { key: "arbitration" } });
    const arbitration = feeSetting?.value as { enabled?: boolean; feeKzt?: number; freeUntil?: string } | null;
    const isFree = !arbitration?.enabled || !arbitration.feeKzt || (arbitration.freeUntil ? new Date(arbitration.freeUntil).getTime() > Date.now() : false);
    return this.prisma.$transaction(async tx => {
      const dispute = await tx.dispute.create({ data: { dealId, openedById: userId, reason, details, arbitrationFee: isFree ? 0 : arbitration?.feeKzt ?? 0, feeStatus: isFree ? "NOT_REQUIRED" : "PENDING" } });
      await tx.deal.update({ where: { id: dealId }, data: { stage: "DISPUTED" } });
      await tx.dealEvent.create({ data: { dealId, actorId: userId, type: "dispute.opened", fromStage: deal.stage, toStage: "DISPUTED", payload: { reason } } });
      const evidence = await tx.chatMessage.create({ data: { dealId, authorId: userId, body: `Открыт спор: ${reason}. ${details}`, systemEvent: true } });
      if (attachmentIds.length) {
        const unique = [...new Set(attachmentIds)];
        const count = await tx.attachment.count({ where: { id: { in: unique }, uploadedById: userId, requestId: null, offerId: null, messageId: null } });
        if (count !== unique.length) throw new BadRequestException("Один или несколько файлов не найдены либо уже прикреплены.");
        await tx.attachment.updateMany({ where: { id: { in: unique }, uploadedById: userId }, data: { messageId: evidence.id } });
      }
      const participants = await tx.organizationMember.findMany({ where: { organizationId: { in: [deal.buyerOrganizationId ?? "", deal.supplierOrganizationId] }, userId: { not: userId } }, select: { userId: true } });
      if (participants.length) await tx.notification.createMany({ data: participants.map(member => ({ userId: member.userId, type: "dispute.opened", title: "По сделке открыт спор", body: reason, payload: { dealId, disputeId: dispute.id } })) });
      return dispute;
    });
  }

  async resolveDispute(userId: string, disputeId: string, decision: string, status: "RESOLVED" | "REJECTED" = "RESOLVED") {
    const staff = await this.prisma.organizationMember.findFirst({ where: { userId, role: { in: ["ARBITER", "ADMIN"] } } });
    if (!staff) throw new NotFoundException("Спор не найден.");
    const dispute = await this.prisma.dispute.findUnique({ where: { id: disputeId }, include: { deal: true } });
    if (!dispute || ["RESOLVED", "REJECTED"].includes(dispute.status)) throw new NotFoundException("Спор не найден.");
    if (staff.role === AccountRole.ARBITER && dispute.assignedArbiterId && dispute.assignedArbiterId !== userId) throw new NotFoundException("Спор не найден.");
    return this.prisma.$transaction(async tx => {
      const resolved = await tx.dispute.update({ where: { id: disputeId }, data: { status, assignedArbiterId: userId, decision, resolvedAt: new Date() } });
      await tx.dealEvent.create({ data: { dealId: dispute.dealId, actorId: userId, type: `dispute.${status.toLowerCase()}`, payload: { decision } } });
      await tx.auditLog.create({ data: { actorId: userId, action: `dispute.${status.toLowerCase()}`, entityType: "Dispute", entityId: disputeId, before: { status: dispute.status }, after: { status, decision } } });
      const participants = await tx.organizationMember.findMany({ where: { organizationId: { in: [dispute.deal.buyerOrganizationId ?? "", dispute.deal.supplierOrganizationId] } }, select: { userId: true } });
      if (participants.length) await tx.notification.createMany({ data: participants.map(member => ({ userId: member.userId, type: "dispute.resolved", title: "Решение по спору готово", body: decision.slice(0, 180), payload: { dealId: dispute.dealId, disputeId } })) });
      return resolved;
    });
  }

  async createReview(userId: string, dealId: string, rating: number, comment?: string) {
    const deal = await this.assertDealMember(userId, dealId);
    if (deal.stage !== "COMPLETED" || !deal.buyerOrganizationId) throw new BadRequestException("Отзыв можно оставить после завершения сделки со стороны заказчика.");
    const isBuyer = await this.prisma.organizationMember.findFirst({ where: { userId, organizationId: deal.buyerOrganizationId, role: "CUSTOMER" } });
    if (!isBuyer) throw new BadRequestException("Оценку поставщику может оставить заказчик по сделке.");
    const profile = await this.prisma.supplierProfile.findUnique({ where: { organizationId: deal.supplierOrganizationId } });
    if (!profile) throw new NotFoundException("Витрина поставщика не найдена.");
    if (await this.prisma.review.findUnique({ where: { dealId_authorId: { dealId, authorId: userId } } })) throw new ConflictException("Вы уже оставили отзыв по этой сделке.");
    return this.prisma.$transaction(async tx => {
      const review = await tx.review.create({ data: { dealId, authorId: userId, supplierId: profile.id, rating, comment, publishedAt: new Date() } });
      const aggregate = await tx.review.aggregate({ where: { supplierId: profile.id, publishedAt: { not: null } }, _avg: { rating: true }, _count: { _all: true } });
      await tx.supplierProfile.update({ where: { id: profile.id }, data: { averageRating: aggregate._avg.rating ?? 0, reviewCount: aggregate._count._all } });
      return review;
    });
  }

  supplierReviews(supplierId: string) {
    return this.prisma.review.findMany({ where: { supplierId, publishedAt: { not: null } }, include: { author: { select: { displayName: true } } }, orderBy: { createdAt: "desc" }, take: 100 });
  }

  async adminOverview(userId: string) {
    await this.requireAdmin(userId);
    const [users, requests, deals, disputes, pendingSuppliers, subcontracts] = await Promise.all([
      this.prisma.user.count(), this.prisma.purchaseRequest.count({ where: { status: "OPEN" } }),
      this.prisma.deal.count({ where: { stage: { in: ["NEGOTIATION", "CONFIRMED", "IN_PROGRESS", "SHIPPED", "RECEIVED"] } } }),
      this.prisma.dispute.count({ where: { status: { in: ["OPEN", "UNDER_REVIEW", "NEEDS_INFO"] } } }),
      this.prisma.supplierProfile.count({ where: { isPublished: false } }),
      this.prisma.subcontract.count(),
    ]);
    return { users, openRequests: requests, activeDeals: deals, activeDisputes: disputes, pendingSuppliers, activeSubcontracts: subcontracts };
  }

  async adminData(userId: string, kind: string) {
    await this.requireAdmin(userId);
    const take = 100;
    if (kind === "users") return this.prisma.user.findMany({ take, orderBy: { createdAt: "desc" }, select: { id: true, email: true, phone: true, displayName: true, isActive: true, createdAt: true, memberships: { select: { role: true, organization: { select: { name: true } } } } } });
    if (kind === "categories") return this.prisma.category.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
    if (kind === "requests") return this.prisma.purchaseRequest.findMany({ take, orderBy: { createdAt: "desc" }, include: { customer: { select: { displayName: true } }, _count: { select: { offers: true } } } });
    if (kind === "deals") return this.prisma.deal.findMany({ take, orderBy: { updatedAt: "desc" }, include: { offer: { include: { request: { select: { title: true, number: true } }, supplier: { select: { name: true } } } } } });
    if (kind === "disputes") return this.prisma.dispute.findMany({
      take, orderBy: { createdAt: "desc" },
      include: {
        deal: {
          include: {
            offer: { include: { request: { select: { title: true, number: true } }, supplier: { select: { name: true } } } },
            messages: { include: { attachments: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true } } }, orderBy: { createdAt: "asc" } },
          },
        },
      },
    });
    if (kind === "advertisements") return this.prisma.advertisement.findMany({ take, orderBy: { createdAt: "desc" }, include: { organization: { select: { name: true } }, category: { select: { name: true } } } });
    if (kind === "reviews") return this.prisma.review.findMany({ take, orderBy: { createdAt: "desc" }, include: { author: { select: { displayName: true } }, supplier: { select: { publicName: true } } } });
    if (kind === "products") return this.prisma.product.findMany({ take, orderBy: { updatedAt: "desc" }, include: { category: { select: { name: true } }, organization: { select: { name: true } } } });
    if (kind === "subcontracts") return this.prisma.subcontract.findMany({
      take,
      orderBy: { createdAt: "desc" },
      include: {
        generalSupplier: { select: { id: true, name: true, region: true } },
        subcontractor: { select: { id: true, name: true, region: true } },
        deal: { select: { id: true, number: true, offer: { select: { request: { select: { title: true, region: true } } } } } },
        bids: {
          include: { contractor: { select: { id: true, name: true, region: true } } },
          orderBy: { createdAt: "desc" },
        },
        _count: { select: { bids: true } },
      },
    });
    if (kind === "audit") return this.prisma.auditLog.findMany({ take, orderBy: { createdAt: "desc" }, include: { actor: { select: { displayName: true, email: true } } } });
    throw new NotFoundException("Раздел не найден.");
  }

  async adminToggleUser(userId: string, targetId: string, isActive: boolean) {
    await this.requireAdmin(userId);
    if (userId === targetId && !isActive) throw new BadRequestException("Нельзя отключить собственную учётную запись.");
    const target = await this.prisma.user.update({ where: { id: targetId }, data: { isActive }, select: { id: true, isActive: true } });
    await this.prisma.auditLog.create({ data: { actorId: userId, action: isActive ? "user.activated" : "user.suspended", entityType: "User", entityId: targetId, after: target } });
    return target;
  }

  async adminSetCategory(userId: string, input: any, categoryId?: string) {
    await this.requireAdmin(userId);
    const data = { name: input.name.trim(), description: input.description?.trim() || null, icon: input.icon || null, sortOrder: Number(input.sortOrder) || 0, isActive: input.isActive !== false };
    const category = categoryId
      ? await this.prisma.category.update({ where: { id: categoryId }, data })
      : await this.prisma.category.create({ data: { ...data, slug: input.slug.toLowerCase().replace(/[^a-z0-9-]/g, "-") } });
    await this.prisma.auditLog.create({ data: { actorId: userId, action: categoryId ? "category.updated" : "category.created", entityType: "Category", entityId: category.id, after: category } });
    return category;
  }

  async adminSettings(userId: string) {
    await this.requireAdmin(userId);
    const rows = await this.prisma.platformSetting.findMany();
    return Object.fromEntries(rows.map(row => [row.key, row.value]));
  }

  async saveAdminSetting(userId: string, key: "arbitration" | "advertising", value: any) {
    await this.requireAdmin(userId);
    const safeValue = key === "arbitration"
      ? { enabled: Boolean(value.enabled), feeKzt: Math.max(0, Number(value.feeKzt) || 0), freeUntil: value.freeUntil || null }
      : { minimumBudgetKzt: Math.max(0, Number(value.minimumBudgetKzt) || 0), defaultDurationDays: Math.min(365, Math.max(1, Number(value.defaultDurationDays) || 30)) };
    const saved = await this.prisma.platformSetting.upsert({ where: { key }, update: { value: safeValue, updatedBy: userId }, create: { key, value: safeValue, updatedBy: userId } });
    await this.prisma.auditLog.create({ data: { actorId: userId, action: "setting.updated", entityType: "PlatformSetting", entityId: key, after: safeValue } });
    return saved;
  }

  async adminAssignDispute(userId: string, disputeId: string, arbiterId: string) {
    await this.requireAdmin(userId);
    const arbiter = await this.prisma.organizationMember.findFirst({ where: { userId: arbiterId, role: AccountRole.ARBITER } });
    if (!arbiter) throw new BadRequestException("Пользователь не имеет роли арбитра.");
    const dispute = await this.prisma.dispute.update({ where: { id: disputeId }, data: { assignedArbiterId: arbiterId, status: "UNDER_REVIEW" } });
    await this.prisma.auditLog.create({ data: { actorId: userId, action: "dispute.assigned", entityType: "Dispute", entityId: disputeId, after: { assignedArbiterId: arbiterId } } });
    await this.prisma.notification.create({ data: { userId: arbiterId, type: "dispute.assigned", title: "Вам назначен спор", body: "Новый спор ожидает рассмотрения.", payload: { disputeId } } });
    return dispute;
  }

  async assignedDisputes(userId: string) {
    const arbiter = await this.prisma.organizationMember.findFirst({ where: { userId, role: AccountRole.ARBITER } });
    if (!arbiter) throw new NotFoundException("Раздел не найден.");
    return this.prisma.dispute.findMany({
      where: { assignedArbiterId: userId, status: { in: ["OPEN", "UNDER_REVIEW", "NEEDS_INFO"] } },
      orderBy: { createdAt: "asc" },
      include: {
        deal: {
          include: {
            offer: { include: { request: { select: { title: true, number: true } }, supplier: { select: { name: true } } } },
            messages: { include: { attachments: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true } } }, orderBy: { createdAt: "asc" } },
          },
        },
      },
    });
  }

  async adminModerateAdvertisement(userId: string, id: string, action: "approve" | "reject" | "paid") {
    await this.requireAdmin(userId);
    const current = await this.prisma.advertisement.findUnique({ where: { id } });
    if (!current) throw new NotFoundException("Рекламная кампания не найдена.");
    const data = action === "approve"
      ? { status: current.paymentStatus === "PAID" ? "ACTIVE" : "APPROVED", isActive: current.paymentStatus === "PAID" }
      : action === "reject" ? { status: "REJECTED", isActive: false }
      : { paymentStatus: "PAID", ...(current.status === "APPROVED" ? { status: "ACTIVE", isActive: true } : {}) };
    const updated = await this.prisma.advertisement.update({ where: { id }, data });
    await this.prisma.auditLog.create({ data: { actorId: userId, action: `advertisement.${action}`, entityType: "Advertisement", entityId: id, before: current, after: updated } });
    return updated;
  }

  async adminModerateReview(userId: string, reviewId: string, isPublished: boolean) {
    await this.requireAdmin(userId);
    const current = await this.prisma.review.findUnique({ where: { id: reviewId } });
    if (!current) throw new NotFoundException("Отзыв не найден.");
    const updated = await this.prisma.review.update({ where: { id: reviewId }, data: { publishedAt: isPublished ? new Date() : null } });
    const aggregate = await this.prisma.review.aggregate({ where: { supplierId: current.supplierId, publishedAt: { not: null } }, _avg: { rating: true }, _count: { _all: true } });
    await this.prisma.supplierProfile.update({ where: { id: current.supplierId }, data: { averageRating: aggregate._avg.rating ?? 0, reviewCount: aggregate._count._all } });
    await this.prisma.auditLog.create({ data: { actorId: userId, action: isPublished ? "review.published" : "review.hidden", entityType: "Review", entityId: reviewId, before: { publishedAt: current.publishedAt }, after: { publishedAt: updated.publishedAt } } });
    return updated;
  }

  async adminModerateProduct(userId: string, productId: string, isPublished: boolean) {
    await this.requireAdmin(userId);
    const result = await this.prisma.product.updateMany({ where: { id: productId }, data: { isPublished } });
    if (!result.count) throw new NotFoundException("Товар не найден.");
    await this.prisma.auditLog.create({ data: { actorId: userId, action: isPublished ? "product.published" : "product.hidden", entityType: "Product", entityId: productId, after: { isPublished } } });
    return this.prisma.product.findUniqueOrThrow({ where: { id: productId } });
  }

  async adminModerateSubcontract(userId: string, subcontractId: string, action: "cancel" | "complete") {
    await this.requireAdmin(userId);
    const subcontract = await this.prisma.subcontract.findUnique({ where: { id: subcontractId } });
    if (!subcontract) throw new NotFoundException("Субподряд не найден.");
    const status = action === "cancel" ? SubcontractStatus.CANCELLED : SubcontractStatus.COMPLETED;
    const updated = await this.prisma.subcontract.update({
      where: { id: subcontractId },
      data: {
        status,
        completedAt: action === "complete" ? new Date() : null,
      },
      include: {
        generalSupplier: { select: { id: true, name: true } },
        subcontractor: { select: { id: true, name: true } },
      },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: userId,
        action: `subcontract.${action}`,
        entityType: "Subcontract",
        entityId: subcontractId,
        before: { status: subcontract.status },
        after: { status: updated.status },
      },
    });
    return updated;
  }

  async createAdvertisement(userId: string, input: any) {
    const member = await this.prisma.organizationMember.findFirst({ where: { userId, role: AccountRole.SUPPLIER } });
    if (!member) throw new ForbiddenException("Рекламную кампанию может создать поставщик.");
    const settings = await this.prisma.platformSetting.findUnique({ where: { key: "advertising" } });
    const minimum = Number((settings?.value as any)?.minimumBudgetKzt ?? 0);
    if (Number(input.budget) < minimum) throw new BadRequestException(`Минимальный бюджет кампании — ${minimum} ₸.`);
    if (new Date(input.endsAt) <= new Date(input.startsAt)) throw new BadRequestException("Дата окончания должна быть позже начала кампании.");
    return this.prisma.advertisement.create({ data: { organizationId: member.organizationId, categoryId: input.categoryId || null, title: input.title, placement: input.placement, region: input.region || null, startsAt: new Date(input.startsAt), endsAt: new Date(input.endsAt), budget: input.budget } });
  }

  async myAdvertisements(userId: string) {
    const memberships = await this.prisma.organizationMember.findMany({ where: { userId, role: AccountRole.SUPPLIER }, select: { organizationId: true } });
    return this.prisma.advertisement.findMany({ where: { organizationId: { in: memberships.map(item => item.organizationId) } }, orderBy: { createdAt: "desc" }, include: { category: { select: { name: true } } } });
  }

  async listLocalContractors(query: { region?: string; q?: string }) {
    const city = query.region && query.region !== "Весь Казахстан" ? canonicalCity(query.region) : undefined;
    const cityAliases = city === "Өскемен" ? ["Өскемен", "Усть-Каменогорск", "Ust-Kamenogorsk", "Oskemen"] : city ? [city] : [];
    return this.prisma.organization.findMany({
      where: {
        supplierProfile: { isPublished: true },
        ...(city ? {
          OR: [
            { region: { in: cityAliases } },
            { supplierProfile: { deliveryRegions: { hasSome: [...cityAliases, "Весь Казахстан"] } } },
          ],
        } : {}),
        ...(query.q ? {
          OR: [
            { name: { contains: query.q, mode: "insensitive" } },
            { supplierProfile: { publicName: { contains: query.q, mode: "insensitive" } } },
          ],
        } : {}),
      },
      select: {
        id: true,
        name: true,
        region: true,
        supplierProfile: {
          select: {
            publicName: true,
            about: true,
            averageRating: true,
            reviewCount: true,
            deliveryRegions: true,
            categories: { include: { category: { select: { id: true, name: true, slug: true } } } },
          },
        },
      },
      take: 30,
    });
  }

  async createSubcontract(userId: string, dealId: string, data: {
    title: string;
    targetRegion: string;
    agreedAmount: number;
    description?: string;
    deadline?: string;
    subcontractorOrgId?: string;
    contractTerms?: string;
  }) {
    const deal = await this.prisma.deal.findUnique({
      where: { id: dealId },
      include: {
        offer: { include: { supplier: true, request: true } },
      },
    });
    if (!deal) throw new NotFoundException("Сделка не найдена.");

    const supplierMember = await this.prisma.organizationMember.findFirst({
      where: { userId, organizationId: deal.supplierOrganizationId },
    });
    if (!supplierMember) throw new ForbiddenException("Только генеральный подрядчик сделки может создавать субподряд.");

    let subcontractorOrg: { id: string; name: string } | null = null;
    if (data.subcontractorOrgId) {
      subcontractorOrg = await this.prisma.organization.findUnique({
        where: { id: data.subcontractorOrgId },
        select: { id: true, name: true },
      });
      if (!subcontractorOrg) throw new NotFoundException("Выбранная организация субподрядчика не найдена.");
      if (subcontractorOrg.id === deal.supplierOrganizationId) {
        throw new BadRequestException("Нельзя назначить собственную компанию субподрядчиком.");
      }
    }

    const subcontract = await this.prisma.subcontract.create({
      data: {
        dealId,
        generalSupplierOrgId: deal.supplierOrganizationId,
        subcontractorOrgId: subcontractorOrg?.id ?? null,
        title: data.title,
        targetRegion: data.targetRegion,
        description: data.description,
        agreedAmount: data.agreedAmount,
        deadline: data.deadline ? new Date(data.deadline) : null,
        status: subcontractorOrg ? "AGREED" : "SEARCHING",
        contractTerms: data.contractTerms,
      },
      include: {
        generalSupplier: { select: { id: true, name: true, region: true } },
        subcontractor: { select: { id: true, name: true, region: true, supplierProfile: true } },
        bids: true,
      },
    });

    const formattedAmount = new Intl.NumberFormat("ru-KZ", { maximumFractionDigits: 0 }).format(Number(data.agreedAmount));
    const msgText = subcontractorOrg
      ? `🤝 Заключен договор субподряда: локальное исполнение в г. ${data.targetRegion}. Субподрядчик: ${subcontractorOrg.name}, сумма: ${formattedAmount} ₸.`
      : `📢 Открыт поиск локального субподрядчика в регионе ${data.targetRegion}: «${data.title}» с бюджетом ${formattedAmount} ₸.`;

    await this.prisma.chatMessage.create({
      data: {
        dealId,
        body: msgText,
        systemEvent: true,
      },
    });

    await this.prisma.dealEvent.create({
      data: {
        dealId,
        actorId: userId,
        type: subcontractorOrg ? "SUBCONTRACT_AGREED" : "SUBCONTRACT_SEARCH_OPENED",
        payload: {
          subcontractId: subcontract.id,
          targetRegion: data.targetRegion,
          amount: data.agreedAmount,
          subcontractor: subcontractorOrg?.name,
        },
      },
    });

    return subcontract;
  }

  async listDealSubcontracts(userId: string, dealId: string) {
    await this.assertDealMember(userId, dealId);
    return this.prisma.subcontract.findMany({
      where: { dealId },
      include: {
        generalSupplier: { select: { id: true, name: true, region: true } },
        subcontractor: {
          select: {
            id: true,
            name: true,
            region: true,
            supplierProfile: { select: { publicName: true, averageRating: true, reviewCount: true } },
          },
        },
        bids: {
          include: {
            contractor: {
              select: {
                id: true,
                name: true,
                region: true,
                supplierProfile: { select: { publicName: true, averageRating: true, reviewCount: true } },
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async listOpenSubcontracts(query: { region?: string; q?: string; take?: number }) {
    const city = query.region && query.region !== "Весь Казахстан" ? canonicalCity(query.region) : undefined;
    const cityAliases = city === "Өскемен" ? ["Өскемен", "Усть-Каменогорск", "Ust-Kamenogorsk", "Oskemen"] : city ? [city] : [];
    return this.prisma.subcontract.findMany({
      where: {
        status: "SEARCHING",
        ...(city ? { OR: cityAliases.map(r => ({ targetRegion: { contains: r, mode: "insensitive" } })) } : {}),
        ...(query.q ? {
          OR: [
            { title: { contains: query.q, mode: "insensitive" } },
            { description: { contains: query.q, mode: "insensitive" } },
            { generalSupplier: { name: { contains: query.q, mode: "insensitive" } } },
          ],
        } : {}),
      },
      include: {
        generalSupplier: {
          select: { id: true, name: true, region: true, supplierProfile: { select: { publicName: true, averageRating: true } } },
        },
        deal: {
          select: {
            id: true,
            number: true,
            offer: { select: { request: { select: { title: true, region: true } } } },
          },
        },
        _count: { select: { bids: true } },
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(query.take ?? 50, 100),
    });
  }

  async mySubcontracts(userId: string) {
    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId },
      select: { organizationId: true },
    });
    const orgIds = memberships.map(m => m.organizationId);

    const asGeneral = await this.prisma.subcontract.findMany({
      where: { generalSupplierOrgId: { in: orgIds } },
      include: {
        deal: { select: { id: true, number: true, offer: { select: { request: { select: { title: true, region: true } } } } } },
        subcontractor: { select: { id: true, name: true, region: true, supplierProfile: true } },
        bids: {
          include: { contractor: { select: { id: true, name: true, region: true, supplierProfile: true } } },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const asSubcontractor = await this.prisma.subcontract.findMany({
      where: {
        OR: [
          { subcontractorOrgId: { in: orgIds } },
          { bids: { some: { contractorOrgId: { in: orgIds } } } },
        ],
      },
      include: {
        generalSupplier: { select: { id: true, name: true, region: true, supplierProfile: true } },
        deal: { select: { id: true, number: true, offer: { select: { request: { select: { title: true, region: true } } } } } },
        bids: {
          where: { contractorOrgId: { in: orgIds } },
          include: { contractor: { select: { id: true, name: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return { asGeneral, asSubcontractor };
  }

  async createSubcontractBid(userId: string, subcontractId: string, data: { price: number; proposedDate?: string; note?: string }) {
    const supplierMember = await this.prisma.organizationMember.findFirst({
      where: { userId, role: AccountRole.SUPPLIER },
    });
    if (!supplierMember) throw new ForbiddenException("Только зарегистрированный поставщик может откликаться на субподряд.");

    const subcontract = await this.prisma.subcontract.findUnique({
      where: { id: subcontractId },
      include: { generalSupplier: true },
    });
    if (!subcontract) throw new NotFoundException("Субподряд не найден.");
    if (subcontract.status !== "SEARCHING") throw new BadRequestException("Прием заявок на этот субподряд закрыт.");
    if (subcontract.generalSupplierOrgId === supplierMember.organizationId) {
      throw new BadRequestException("Нельзя подавать отклик на собственный субподряд.");
    }

    const bid = await this.prisma.subcontractBid.create({
      data: {
        subcontractId,
        contractorOrgId: supplierMember.organizationId,
        price: data.price,
        proposedDate: data.proposedDate ? new Date(data.proposedDate) : null,
        note: data.note,
      },
      include: {
        contractor: { select: { id: true, name: true, region: true, supplierProfile: true } },
      },
    });

    const genMembers = await this.prisma.organizationMember.findMany({
      where: { organizationId: subcontract.generalSupplierOrgId },
      select: { userId: true },
    });
    for (const gm of genMembers) {
      await this.prisma.notification.create({
        data: {
          userId: gm.userId,
          type: "subcontract.bid",
          title: `Новый отклик на субподряд (${subcontract.targetRegion})`,
          body: `Получено предложение на сумму ${data.price} ₸ по субподряду «${subcontract.title}».`,
          payload: { dealId: subcontract.dealId, subcontractId: subcontract.id },
        },
      });
    }

    return bid;
  }

  async acceptSubcontractBid(userId: string, subcontractId: string, bidId: string) {
    const subcontract = await this.prisma.subcontract.findUnique({
      where: { id: subcontractId },
      include: { bids: { include: { contractor: true } }, generalSupplier: true },
    });
    if (!subcontract) throw new NotFoundException("Субподряд не найден.");

    const isGen = await this.prisma.organizationMember.findFirst({
      where: { userId, organizationId: subcontract.generalSupplierOrgId },
    });
    if (!isGen) throw new ForbiddenException("Только генподрядчик может принять отклик на субподряд.");

    const chosenBid = subcontract.bids.find(b => b.id === bidId);
    if (!chosenBid) throw new NotFoundException("Отклик не найден.");

    await this.prisma.$transaction([
      this.prisma.subcontractBid.updateMany({
        where: { subcontractId, id: { not: bidId } },
        data: { status: "REJECTED" },
      }),
      this.prisma.subcontractBid.update({
        where: { id: bidId },
        data: { status: "ACCEPTED" },
      }),
      this.prisma.subcontract.update({
        where: { id: subcontractId },
        data: {
          subcontractorOrgId: chosenBid.contractorOrgId,
          agreedAmount: chosenBid.price,
          status: "AGREED",
        },
      }),
    ]);

    const formattedAmount = new Intl.NumberFormat("ru-KZ", { maximumFractionDigits: 0 }).format(Number(chosenBid.price));
    await this.prisma.chatMessage.create({
      data: {
        dealId: subcontract.dealId,
        body: `🤝 Заключен договор субподряда: выбран субподрядчик ${chosenBid.contractor.name} для исполнения в г. ${subcontract.targetRegion} на сумму ${formattedAmount} ₸.`,
        systemEvent: true,
      },
    });

    return this.prisma.subcontract.findUnique({
      where: { id: subcontractId },
      include: {
        generalSupplier: { select: { id: true, name: true } },
        subcontractor: { select: { id: true, name: true, region: true, supplierProfile: true } },
        bids: true,
      },
    });
  }

  async updateSubcontractStatus(userId: string, subcontractId: string, nextStatus: "IN_PROGRESS" | "COMPLETED" | "CANCELLED") {
    const subcontract = await this.prisma.subcontract.findUnique({
      where: { id: subcontractId },
      include: { subcontractor: true, generalSupplier: true },
    });
    if (!subcontract) throw new NotFoundException("Субподряд не найден.");

    const isMember = await this.prisma.organizationMember.findFirst({
      where: {
        userId,
        organizationId: { in: [subcontract.generalSupplierOrgId, subcontract.subcontractorOrgId ?? ""] },
      },
    });
    if (!isMember) throw new ForbiddenException("Нет прав на изменение статуса субподряда.");

    const updated = await this.prisma.subcontract.update({
      where: { id: subcontractId },
      data: {
        status: nextStatus,
        completedAt: nextStatus === "COMPLETED" ? new Date() : null,
      },
      include: {
        generalSupplier: { select: { id: true, name: true } },
        subcontractor: { select: { id: true, name: true, region: true, supplierProfile: true } },
      },
    });

    const statusRu = {
      IN_PROGRESS: "переведен в исполнение",
      COMPLETED: "успешно выполнен субподрядчиком",
      CANCELLED: "отменен",
    }[nextStatus];

    await this.prisma.chatMessage.create({
      data: {
        dealId: subcontract.dealId,
        body: `📋 Статус субподряда «${subcontract.title}» в г. ${subcontract.targetRegion}: ${statusRu}.`,
        systemEvent: true,
      },
    });

    return updated;
  }

  async ensureDealDocuments(dealId: string) {
    const deal = await this.prisma.deal.findUnique({
      where: { id: dealId },
      include: {
        offer: {
          include: {
            request: {
              include: { items: true },
            },
            items: {
              include: { requestItem: true },
            },
          },
        },
        buyer: true,
        supplier: true,
        documents: true,
      },
    });
    if (!deal) return [];

    const isService =
      deal.offer?.request?.type === ItemType.SERVICE ||
      deal.offer?.items?.some(i =>
        ["усл.", "час", "проект", "смена", "месяц"].includes(i.requestItem?.unit ?? "")
      );

    const existingTypes = new Set(deal.documents.map(d => d.type));
    const toCreate: Array<{
      type: DocumentType;
      number: string;
      title: string;
      content: any;
      status?: DocumentSignStatus;
    }> = [];

    // 1. Договор поставки / оказания услуг
    if (!existingTypes.has(DocumentType.CONTRACT)) {
      toCreate.push({
        type: DocumentType.CONTRACT,
        number: `TM-Д-${deal.number}`,
        title: isService
          ? "Договор возмездного оказания услуг / выполнения работ (ГК РК ст. 683-687, 393-397)"
          : "Типовой договор поставки товаров (ГК РК ст. 406-444, 393-397)",
        content: generateContractContent(deal),
      });
    }

    // 2. Счёт на оплату
    if (!existingTypes.has(DocumentType.INVOICE)) {
      toCreate.push({
        type: DocumentType.INVOICE,
        number: `TM-СЧЕТ-${deal.number}`,
        title: "Счёт на оплату (КБе 17, стандарт РК)",
        content: generateInvoiceContent(deal),
      });
    }

    // 3. Первичные документы закрытия / отгрузки
    // Накладная З-2 (товары)
    if (
      ["SHIPPED", "RECEIVED", "COMPLETED"].includes(deal.stage) &&
      !existingTypes.has(DocumentType.WAYBILL)
    ) {
      toCreate.push({
        type: DocumentType.WAYBILL,
        number: `TM-З2-${deal.number}`,
        title: "Накладная на отпуск запасов на сторону (Форма З-2, Приказ МФ РК № 562)",
        content: generateWaybillContent(deal),
      });
    }

    // АВР Р-1 (услуги / работы)
    if (
      ["SHIPPED", "RECEIVED", "COMPLETED"].includes(deal.stage) &&
      !existingTypes.has(DocumentType.ACT_OF_COMPLETION) &&
      (isService || deal.stage === "COMPLETED")
    ) {
      toCreate.push({
        type: DocumentType.ACT_OF_COMPLETION,
        number: `TM-АВР-${deal.number}`,
        title: "Акт выполненных работ / оказанных услуг (Форма Р-1, Приказ МФ РК № 562)",
        content: generateActOfCompletionContent(deal),
      });
    }

    // 4. Фискальный чек (при завершении сделки)
    if (
      deal.stage === "COMPLETED" &&
      !existingTypes.has(DocumentType.PAYMENT_RECEIPT)
    ) {
      toCreate.push({
        type: DocumentType.PAYMENT_RECEIPT,
        number: `TM-ЧЕК-${deal.number}`,
        title: "Фискальный чек / Квитанция об оплате (РНМ/ЗНМ ОФД РК)",
        content: generateReceiptContent(deal),
        status: DocumentSignStatus.SIGNED_BY_BOTH,
      });
    }

    for (const item of toCreate) {
      try {
        await this.prisma.dealDocument.upsert({
          where: { dealId_type: { dealId, type: item.type } },
          update: {},
          create: {
            dealId,
            type: item.type,
            number: item.number,
            title: item.title,
            content: item.content,
            status: item.status ?? DocumentSignStatus.DRAFT,
          },
        });
      } catch (err: any) {
        if (err?.code !== "P2002") throw err;
      }
    }

    return this.prisma.dealDocument.findMany({
      where: { dealId },
      orderBy: { createdAt: "asc" },
    });
  }

  async listDealDocuments(userId: string, dealId: string) {
    await this.assertDealMember(userId, dealId);
    return this.ensureDealDocuments(dealId);
  }

  async getDealDocument(userId: string, dealId: string, docType: DocumentType) {
    await this.assertDealMember(userId, dealId);
    await this.ensureDealDocuments(dealId);
    const doc = await this.prisma.dealDocument.findUnique({
      where: { dealId_type: { dealId, type: docType } },
    });
    if (!doc) throw new NotFoundException("Документ не найден.");
    return doc;
  }

  async signDealDocument(userId: string, dealId: string, docType: DocumentType, clientIp?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("Пользователь не найден.");
    const deal = await this.assertDealMember(userId, dealId);
    await this.ensureDealDocuments(dealId);
    const doc = await this.prisma.dealDocument.findUnique({
      where: { dealId_type: { dealId, type: docType } },
    });
    if (!doc) throw new NotFoundException("Документ не найден.");

    const isSupplier = Boolean(await this.prisma.organizationMember.findFirst({
      where: { userId, organizationId: deal.supplierOrganizationId, role: AccountRole.SUPPLIER },
    }));
    const isBuyer = Boolean(await this.prisma.organizationMember.findFirst({
      where: { userId, organizationId: deal.buyerOrganizationId ?? "", role: AccountRole.CUSTOMER },
    }));

    if (!isSupplier && !isBuyer) {
      throw new ForbiddenException("Только заказчик или поставщик по сделке могут подписывать документы.");
    }

    const now = new Date();
    const ip = clientIp || "127.0.0.1";
    const signerName = user.displayName || user.email;

    let nextStatus = doc.status;
    const updateData: any = {};

    if (isSupplier) {
      if (doc.supplierSignedAt) throw new BadRequestException("Документ уже подписан поставщиком.");
      updateData.supplierSignedAt = now;
      updateData.supplierSignIp = ip;
      updateData.supplierSignerName = signerName;
      nextStatus = (doc.status === DocumentSignStatus.SIGNED_BY_BUYER)
        ? DocumentSignStatus.SIGNED_BY_BOTH
        : DocumentSignStatus.SIGNED_BY_SUPPLIER;
    } else if (isBuyer) {
      if (doc.buyerSignedAt) throw new BadRequestException("Документ уже подписан заказчиком.");
      updateData.buyerSignedAt = now;
      updateData.buyerSignIp = ip;
      updateData.buyerSignerName = signerName;
      nextStatus = (doc.status === DocumentSignStatus.SIGNED_BY_SUPPLIER)
        ? DocumentSignStatus.SIGNED_BY_BOTH
        : DocumentSignStatus.SIGNED_BY_BUYER;
    }
    updateData.status = nextStatus;

    const updatedDoc = await this.prisma.dealDocument.update({
      where: { id: doc.id },
      data: updateData,
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: userId,
        action: `document.signed.${docType.toLowerCase()}`,
        entityType: "DealDocument",
        entityId: doc.id,
        after: { status: nextStatus, signer: signerName, ip },
      },
    });

    const docTitleRu = {
      CONTRACT: "Договор",
      INVOICE: "Счёт на оплату",
      ACT_OF_COMPLETION: "Акт выполненных работ (АВР Р-1)",
      WAYBILL: "Накладная на отпуск (З-2)",
      PAYMENT_RECEIPT: "Фискальный чек",
    }[docType] || docType;

    await this.prisma.chatMessage.create({
      data: {
        dealId,
        body: `✍️ ${signerName} подписал(а) ${docTitleRu} (${doc.number}) простой электронной подписью (ПЭП РК, ст. 152 ГК РК). Статус: ${nextStatus === DocumentSignStatus.SIGNED_BY_BOTH ? "ПОДПИСАН ОБЕИМИ СТОРОНАМИ" : "Ожидает подписи второй стороны"}.`,
        systemEvent: true,
      },
    });

    return updatedDoc;
  }
}

