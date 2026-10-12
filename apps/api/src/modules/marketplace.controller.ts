import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, Max, Min, MinLength, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { AuthGuard } from "./auth.guard";
import { MarketplaceService } from "./marketplace.service";
import { FilesService } from "./files.service";

class RequestItemDto {
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsIn(["PRODUCT", "SERVICE"]) type?: "PRODUCT" | "SERVICE";
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsString() details?: string;
  @Type(() => Number) @IsNumber() @Min(0.001) quantity!: number;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsString() preferredBrand?: string;
  @IsOptional() @IsBoolean() allowEquivalent?: boolean;
}
class CreateRequestDto {
  @IsString() @MinLength(2) title!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsIn(["PRODUCT", "SERVICE"]) type?: "PRODUCT" | "SERVICE";
  @IsString() @MinLength(2) region!: string;
  @IsOptional() @IsString() deliveryAddress?: string;
  @IsOptional() @IsDateString() deliveryDeadline?: string;
  @IsOptional() @IsDateString() responseDeadline?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) budget?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) attachments?: string[];
  @IsOptional() @IsString() coverageMode?: "full" | "partial";
  @IsArray() @ValidateNested({ each: true }) @Type(() => RequestItemDto) items!: RequestItemDto[];
}
class OfferItemDto {
  @IsString() requestItemId!: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) unitPrice?: number;
  @IsBoolean() available!: boolean;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) quantity?: number;
  @IsOptional() @IsString() mechanical?: boolean;
  @IsOptional() @IsString() equivalentDescription?: string;
  @IsOptional() @IsString() note?: string;
}
class CreateOfferDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => OfferItemDto) items!: OfferItemDto[];
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) deliveryPrice?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) otherCosts?: number;
  @IsOptional() @IsDateString() deliveryDate?: string;
  @IsOptional() @IsString() paymentTerms?: string;
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsDateString() expiresAt?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) attachments?: string[];
}
class SupplierProfileDto {
  @IsString() @MinLength(2) publicName!: string;
  @IsOptional() @IsString() about?: string;
  @IsArray() @IsString({ each: true }) regions!: string[];
  @IsArray() @IsString({ each: true }) categoryIds!: string[];
}
class MessageDto { @IsString() @MinLength(1) body!: string; @IsOptional() @IsArray() @IsString({ each: true }) attachments?: string[]; }
class StageDto { @IsIn(["CONFIRMED", "IN_PROGRESS", "SHIPPED", "RECEIVED", "COMPLETED", "CANCELLED", "DISPUTED"]) stage!: string; }
class DisputeDto { @IsString() @MinLength(2) reason!: string; @IsString() @MinLength(10) details!: string; @IsOptional() @IsArray() @IsString({ each: true }) attachments?: string[]; }
class DecisionDto { @IsString() @MinLength(10) decision!: string; @IsOptional() @IsIn(["RESOLVED", "REJECTED"]) status?: "RESOLVED" | "REJECTED"; }
class ReviewDto { @Type(() => Number) @IsInt() @Min(1) @Max(5) rating!: number; @IsOptional() @IsString() @MinLength(2) comment?: string; }
class ProductDto { @IsString() @MinLength(2) name!: string; @IsString() categoryId!: string; @IsOptional() @IsIn(["PRODUCT", "SERVICE"]) type?: "PRODUCT" | "SERVICE"; @IsOptional() @IsString() description?: string; @IsOptional() @Type(() => Number) @IsNumber() @Min(0) price?: number; @IsOptional() @IsString() unit?: string; @IsOptional() @IsString() region?: string; @IsOptional() @IsBoolean() isPublished?: boolean; }
class CategoryDto { @IsString() @MinLength(2) name!: string; @IsString() @MinLength(2) slug!: string; @IsOptional() @IsString() description?: string; @IsOptional() @IsString() icon?: string; @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number; @IsOptional() @IsBoolean() isActive?: boolean; }
class ActiveDto { @IsBoolean() isActive!: boolean; }
class PublishedDto { @IsBoolean() isPublished!: boolean; }
class AdminSettingDto { @IsIn(["arbitration", "advertising"]) key!: "arbitration" | "advertising"; @IsObject() value!: any; }
class AssignDto { @IsString() arbiterId!: string; }
class AdDto { @IsString() @MinLength(2) title!: string; @IsString() placement!: string; @IsOptional() @IsString() categoryId?: string; @IsOptional() @IsString() region?: string; @IsDateString() startsAt!: string; @IsDateString() endsAt!: string; @Type(() => Number) @IsNumber() @Min(0) budget!: number; }
class AdModerationDto { @IsIn(["approve", "reject", "paid"]) action!: "approve" | "reject" | "paid"; }
class SubcontractModerationDto { @IsIn(["cancel", "complete"]) action!: "cancel" | "complete"; }
class CreateSubcontractDto {
  @IsString() @MinLength(2) title!: string;
  @IsString() @MinLength(2) targetRegion!: string;
  @Type(() => Number) @IsNumber() @Min(0) agreedAmount!: number;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsDateString() deadline?: string;
  @IsOptional() @IsString() subcontractorOrgId?: string;
  @IsOptional() @IsString() contractTerms?: string;
}
class CreateSubcontractBidDto {
  @Type(() => Number) @IsNumber() @Min(0) price!: number;
  @IsOptional() @IsDateString() proposedDate?: string;
  @IsOptional() @IsString() note?: string;
}
class AcceptSubcontractBidDto { @IsString() bidId!: string; }
class SubcontractStatusDto {
  @IsIn(["IN_PROGRESS", "COMPLETED", "CANCELLED"]) status!: "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
}

@ApiTags("marketplace")
@Controller()
export class MarketplaceController {
  constructor(private readonly marketplace: MarketplaceService, private readonly files: FilesService) {}

  @Get("categories") @ApiOperation({ summary: "Активные категории товаров" }) categories() { return this.marketplace.categories(); }
  @Get("products") @ApiOperation({ summary: "Поиск товаров и услуг каталога" }) products(@Query("q") q?: string, @Query("category") category?: string, @Query("region") region?: string, @Query("type") type?: "PRODUCT" | "SERVICE", @Query("take") take?: string) { return this.marketplace.products({ q, category, region, type, take: Number(take) || 24 }); }
  @Get("suppliers") @ApiOperation({ summary: "Поиск опубликованных поставщиков" }) suppliers(@Query("q") q?: string, @Query("category") category?: string, @Query("region") region?: string, @Query("take") take?: string) { return this.marketplace.suppliers({ q, category, region, take: Number(take) || 48 }); }

  @Post("requests") @UseGuards(AuthGuard) @ApiBearerAuth() @ApiOperation({ summary: "Создать многопозиционную заявку" })
  createRequest(@Req() req: any, @Body() body: CreateRequestDto) { return this.marketplace.createRequest(req.user.sub, body); }
  @Get("requests/mine") @UseGuards(AuthGuard) @ApiBearerAuth() myRequests(@Req() req: any) { return this.marketplace.myRequests(req.user.sub); }
  @Get("deals/mine") @UseGuards(AuthGuard) @ApiBearerAuth() myDeals(@Req() req: any) { return this.marketplace.myDeals(req.user.sub); }
  @Get("supplier/requests") @UseGuards(AuthGuard) @ApiBearerAuth() supplierInbox(@Req() req: any) { return this.marketplace.supplierInbox(req.user.sub); }
  @Get("supplier/summary") @UseGuards(AuthGuard) @ApiBearerAuth() supplierSummary(@Req() req: any) { return this.marketplace.supplierSummary(req.user.sub); }
  @Get("supplier/products") @UseGuards(AuthGuard) @ApiBearerAuth() myProducts(@Req() req: any) { return this.marketplace.myProducts(req.user.sub); }
  @Post("supplier/products") @UseGuards(AuthGuard) @ApiBearerAuth() saveProduct(@Req() req: any, @Body() body: ProductDto) { return this.marketplace.saveProduct(req.user.sub, body); }
  @Patch("supplier/products/:productId") @UseGuards(AuthGuard) @ApiBearerAuth() updateProduct(@Req() req: any, @Param("productId") productId: string, @Body() body: ProductDto) { return this.marketplace.saveProduct(req.user.sub, body, productId); }
  @Delete("supplier/products/:productId") @UseGuards(AuthGuard) @ApiBearerAuth() deleteProduct(@Req() req: any, @Param("productId") productId: string) { return this.marketplace.deleteProduct(req.user.sub, productId); }
  @Get("supplier/advertisements") @UseGuards(AuthGuard) @ApiBearerAuth() myAds(@Req() req: any) { return this.marketplace.myAdvertisements(req.user.sub); }
  @Post("supplier/advertisements") @UseGuards(AuthGuard) @ApiBearerAuth() createAd(@Req() req: any, @Body() body: AdDto) { return this.marketplace.createAdvertisement(req.user.sub, body); }
  @Post("requests/:requestId/offers") @UseGuards(AuthGuard) @ApiBearerAuth() @ApiOperation({ summary: "Отправить построчное предложение" })
  createOffer(@Req() req: any, @Param("requestId") requestId: string, @Body() body: CreateOfferDto) { return this.marketplace.createOffer(req.user.sub, requestId, body); }
  @Get("requests/:requestId/offers") @UseGuards(AuthGuard) @ApiBearerAuth() offers(@Req() req: any, @Param("requestId") requestId: string) { return this.marketplace.offersForRequest(req.user.sub, requestId); }
  @Post("supplier/profile") @UseGuards(AuthGuard) @ApiBearerAuth() @ApiOperation({ summary: "Опубликовать витрину и категории поставщика" }) supplierProfile(@Req() req: any, @Body() body: SupplierProfileDto) { return this.marketplace.saveSupplierProfile(req.user.sub, body); }
  @Post("offers/:offerId/accept") @UseGuards(AuthGuard) @ApiBearerAuth() @ApiOperation({ summary: "Выбрать предложение и создать сделку" }) acceptOffer(@Req() req: any, @Param("offerId") offerId: string) { return this.marketplace.acceptOffer(req.user.sub, offerId); }
  @Get("deals/:dealId") @UseGuards(AuthGuard) @ApiBearerAuth() getDeal(@Req() req: any, @Param("dealId") dealId: string) { return this.marketplace.getDeal(req.user.sub, dealId); }
  @Get("deals/:dealId/messages") @UseGuards(AuthGuard) @ApiBearerAuth() messages(@Req() req: any, @Param("dealId") dealId: string) { return this.marketplace.dealMessages(req.user.sub, dealId); }
  @Post("deals/:dealId/messages") @UseGuards(AuthGuard) @ApiBearerAuth() sendMessage(@Req() req: any, @Param("dealId") dealId: string, @Body() body: MessageDto) { return this.marketplace.sendMessage(req.user.sub, dealId, body.body, body.attachments); }
  @Post("deals/:dealId/stage") @UseGuards(AuthGuard) @ApiBearerAuth() updateStage(@Req() req: any, @Param("dealId") dealId: string, @Body() body: StageDto) { return this.marketplace.updateDealStage(req.user.sub, dealId, body.stage); }
  @Post("deals/:dealId/disputes") @UseGuards(AuthGuard) @ApiBearerAuth() openDispute(@Req() req: any, @Param("dealId") dealId: string, @Body() body: DisputeDto) { return this.marketplace.openDispute(req.user.sub, dealId, body.reason, body.details, body.attachments); }
  @Post("admin/disputes/:disputeId/decision") @UseGuards(AuthGuard) @ApiBearerAuth() resolveDispute(@Req() req: any, @Param("disputeId") disputeId: string, @Body() body: DecisionDto) { return this.marketplace.resolveDispute(req.user.sub, disputeId, body.decision, body.status); }
  @Get("notifications") @UseGuards(AuthGuard) @ApiBearerAuth() notifications(@Req() req: any) { return this.marketplace.notifications(req.user.sub); }
  @Post("notifications/:notificationId/read") @UseGuards(AuthGuard) @ApiBearerAuth() markNotificationRead(@Req() req: any, @Param("notificationId") notificationId: string) { return this.marketplace.markNotificationRead(req.user.sub, notificationId); }
  @Get("admin/overview") @UseGuards(AuthGuard) @ApiBearerAuth() adminOverview(@Req() req: any) { return this.marketplace.adminOverview(req.user.sub); }
  @Get("arbiter/disputes") @UseGuards(AuthGuard) @ApiBearerAuth() assignedDisputes(@Req() req: any) { return this.marketplace.assignedDisputes(req.user.sub); }
  @Post("arbiter/disputes/:disputeId/decision") @UseGuards(AuthGuard) @ApiBearerAuth() arbiterDecision(@Req() req: any, @Param("disputeId") id: string, @Body() body: DecisionDto) { return this.marketplace.resolveDispute(req.user.sub, id, body.decision, body.status); }
  @Get("admin/:kind") @UseGuards(AuthGuard) @ApiBearerAuth() adminData(@Req() req: any, @Param("kind") kind: string) { return this.marketplace.adminData(req.user.sub, kind); }
  @Get("admin/settings/all") @UseGuards(AuthGuard) @ApiBearerAuth() adminSettings(@Req() req: any) { return this.marketplace.adminSettings(req.user.sub); }
  @Post("admin/settings") @UseGuards(AuthGuard) @ApiBearerAuth() saveAdminSettings(@Req() req: any, @Body() body: AdminSettingDto) { return this.marketplace.saveAdminSetting(req.user.sub, body.key, body.value); }
  @Patch("admin/users/:userId") @UseGuards(AuthGuard) @ApiBearerAuth() adminUser(@Req() req: any, @Param("userId") userId: string, @Body() body: ActiveDto) { return this.marketplace.adminToggleUser(req.user.sub, userId, body.isActive); }
  @Post("admin/categories") @UseGuards(AuthGuard) @ApiBearerAuth() createCategory(@Req() req: any, @Body() body: CategoryDto) { return this.marketplace.adminSetCategory(req.user.sub, body); }
  @Patch("admin/categories/:categoryId") @UseGuards(AuthGuard) @ApiBearerAuth() updateCategory(@Req() req: any, @Param("categoryId") id: string, @Body() body: CategoryDto) { return this.marketplace.adminSetCategory(req.user.sub, body, id); }
  @Patch("admin/disputes/:disputeId/assign") @UseGuards(AuthGuard) @ApiBearerAuth() assignDispute(@Req() req: any, @Param("disputeId") id: string, @Body() body: AssignDto) { return this.marketplace.adminAssignDispute(req.user.sub, id, body.arbiterId); }
  @Patch("admin/advertisements/:id") @UseGuards(AuthGuard) @ApiBearerAuth() moderateAd(@Req() req: any, @Param("id") id: string, @Body() body: AdModerationDto) { return this.marketplace.adminModerateAdvertisement(req.user.sub, id, body.action); }
  @Patch("admin/reviews/:id") @UseGuards(AuthGuard) @ApiBearerAuth() moderateReview(@Req() req: any, @Param("id") id: string, @Body() body: PublishedDto) { return this.marketplace.adminModerateReview(req.user.sub, id, body.isPublished); }
  @Patch("admin/products/:id") @UseGuards(AuthGuard) @ApiBearerAuth() moderateProduct(@Req() req: any, @Param("id") id: string, @Body() body: PublishedDto) { return this.marketplace.adminModerateProduct(req.user.sub, id, body.isPublished); }
  @Patch("admin/subcontracts/:id") @UseGuards(AuthGuard) @ApiBearerAuth() moderateSubcontract(@Req() req: any, @Param("id") id: string, @Body() body: SubcontractModerationDto) { return this.marketplace.adminModerateSubcontract(req.user.sub, id, body.action); }
  @Get("uploads/:id") @UseGuards(AuthGuard) @ApiBearerAuth() async download(@Req() req: any, @Param("id") id: string, @Res({ passthrough: true }) response: any) {
    const { file, body } = await this.files.read(req.user.sub, id);
    response.set({ "Content-Type": file.mimeType, "Content-Length": file.sizeBytes, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.originalName)}`, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" });
    return new StreamableFile(body as any);
  }
  @Post("uploads") @UseGuards(AuthGuard) @ApiBearerAuth() @UseInterceptors(FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } })) upload(@Req() req: any, @UploadedFile() file: Express.Multer.File) { return this.files.upload(req.user.sub, file); }
  @Post("deals/:dealId/reviews") @UseGuards(AuthGuard) @ApiBearerAuth() createReview(@Req() req: any, @Param("dealId") dealId: string, @Body() body: ReviewDto) { return this.marketplace.createReview(req.user.sub, dealId, body.rating, body.comment); }
  @Get("suppliers/:supplierId/reviews") supplierReviews(@Param("supplierId") supplierId: string) { return this.marketplace.supplierReviews(supplierId); }

  @Get("subcontracts") @ApiOperation({ summary: "Лента открытых субподрядов" })
  openSubcontracts(@Query("region") region?: string, @Query("q") q?: string, @Query("take") take?: string) {
    return this.marketplace.listOpenSubcontracts({ region, q, take: Number(take) || 40 });
  }

  @Get("subcontracts/contractors") @ApiOperation({ summary: "Поиск локальных субподрядчиков" })
  localContractors(@Query("region") region?: string, @Query("q") q?: string) {
    return this.marketplace.listLocalContractors({ region, q });
  }

  @Get("subcontracts/mine") @UseGuards(AuthGuard) @ApiBearerAuth()
  mySubcontracts(@Req() req: any) {
    return this.marketplace.mySubcontracts(req.user.sub);
  }

  @Get("deals/:dealId/subcontracts") @UseGuards(AuthGuard) @ApiBearerAuth()
  dealSubcontracts(@Req() req: any, @Param("dealId") dealId: string) {
    return this.marketplace.listDealSubcontracts(req.user.sub, dealId);
  }

  @Post("deals/:dealId/subcontracts") @UseGuards(AuthGuard) @ApiBearerAuth()
  createSubcontract(@Req() req: any, @Param("dealId") dealId: string, @Body() body: CreateSubcontractDto) {
    return this.marketplace.createSubcontract(req.user.sub, dealId, body);
  }

  @Post("subcontracts/:subcontractId/bids") @UseGuards(AuthGuard) @ApiBearerAuth()
  createSubcontractBid(@Req() req: any, @Param("subcontractId") subcontractId: string, @Body() body: CreateSubcontractBidDto) {
    return this.marketplace.createSubcontractBid(req.user.sub, subcontractId, body);
  }

  @Post("subcontracts/:subcontractId/accept-bid") @UseGuards(AuthGuard) @ApiBearerAuth()
  acceptSubcontractBid(@Req() req: any, @Param("subcontractId") subcontractId: string, @Body() body: AcceptSubcontractBidDto) {
    return this.marketplace.acceptSubcontractBid(req.user.sub, subcontractId, body.bidId);
  }

  @Post("subcontracts/:subcontractId/status") @UseGuards(AuthGuard) @ApiBearerAuth()
  updateSubcontractStatus(@Req() req: any, @Param("subcontractId") subcontractId: string, @Body() body: SubcontractStatusDto) {
    return this.marketplace.updateSubcontractStatus(req.user.sub, subcontractId, body.status);
  }

  @Get("deals/:dealId/documents") @UseGuards(AuthGuard) @ApiBearerAuth() @ApiOperation({ summary: "Список документов сделки по стандартам РК" })
  dealDocuments(@Req() req: any, @Param("dealId") dealId: string) {
    return this.marketplace.listDealDocuments(req.user.sub, dealId);
  }

  @Get("deals/:dealId/documents/:type") @UseGuards(AuthGuard) @ApiBearerAuth() @ApiOperation({ summary: "Получить документ сделки" })
  getDealDocument(@Req() req: any, @Param("dealId") dealId: string, @Param("type") type: any) {
    return this.marketplace.getDealDocument(req.user.sub, dealId, type);
  }

  @Post("deals/:dealId/documents/:type/sign") @UseGuards(AuthGuard) @ApiBearerAuth() @ApiOperation({ summary: "Подписать документ сделки онлайн (ПЭП РК)" })
  signDealDocument(@Req() req: any, @Param("dealId") dealId: string, @Param("type") type: any) {
    const ip = req.headers["x-forwarded-for"] || req.socket?.remoteAddress;
    return this.marketplace.signDealDocument(req.user.sub, dealId, type, String(ip || "127.0.0.1"));
  }
}
