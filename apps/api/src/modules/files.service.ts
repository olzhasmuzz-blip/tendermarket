import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CreateBucketCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { PrismaService } from "./prisma.service";

const allowedTypes = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "video/mp4", "video/webm",
  "application/pdf", "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);
const maxBytes = 50 * 1024 * 1024;
const canonicalRegion = (region: string) => {
  const value = region.trim().toLocaleLowerCase("ru-KZ");
  return ["усть-каменогорск", "ust-kamenogorsk", "oskemen", "оскемен"].includes(value) ? "өскемен" : value;
};

@Injectable()
export class FilesService {
  private readonly bucket = process.env.S3_BUCKET;
  private readonly localRoot = join(__dirname, "../../uploads");
  private readonly s3 = process.env.S3_ENDPOINT && process.env.S3_ACCESS_KEY && process.env.S3_SECRET_KEY
    ? new S3Client({ endpoint: process.env.S3_ENDPOINT, region: process.env.S3_REGION || "us-east-1", forcePathStyle: true, credentials: { accessKeyId: process.env.S3_ACCESS_KEY, secretAccessKey: process.env.S3_SECRET_KEY } })
    : null;

  constructor(private readonly prisma: PrismaService) {}

  async upload(userId: string, file?: Express.Multer.File) {
    if (!file?.buffer?.length) throw new BadRequestException("Выберите файл для загрузки.");
    if (file.size > maxBytes) throw new BadRequestException("Размер файла не должен превышать 50 МБ.");
    if (!allowedTypes.has(file.mimetype)) throw new BadRequestException("Этот формат файла не поддерживается.");
    const originalName = file.originalname.replace(/[\\/\r\n\0]/g, "_").slice(0, 180) || "file";
    const key = randomUUID();
    const sha256 = createHash("sha256").update(file.buffer).digest("hex");
    let storageKey = `local:${key}`;
    if (this.s3 && this.bucket) {
      try {
        try { await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket })); }
        catch { await this.s3.send(new CreateBucketCommand({ Bucket: this.bucket })); }
        await this.s3.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: file.buffer, ContentType: file.mimetype, Metadata: { sha256 } }));
        storageKey = `s3:${key}`;
      } catch (error) {
        if (process.env.NODE_ENV === "production") throw new BadRequestException("Не удалось сохранить файл. Повторите попытку позже.");
        await mkdir(this.localRoot, { recursive: true });
        await writeFile(join(this.localRoot, key), file.buffer, { flag: "wx" });
      }
    } else {
      await mkdir(this.localRoot, { recursive: true });
      await writeFile(join(this.localRoot, key), file.buffer, { flag: "wx" });
    }
    return this.prisma.attachment.create({ data: { uploadedById: userId, storageKey, originalName, mimeType: file.mimetype, sizeBytes: file.size, sha256 }, select: { id: true, originalName: true, mimeType: true, sizeBytes: true, uploadedAt: true } });
  }

  async read(userId: string, attachmentId: string) {
    const file = await this.prisma.attachment.findUnique({
      where: { id: attachmentId },
      include: {
        request: { select: { id: true, customerId: true, region: true, items: { select: { categoryId: true } } } },
        offer: { select: { authoredById: true, supplierId: true, request: { select: { customerId: true } } } },
        message: { select: { deal: { select: { buyerOrganizationId: true, supplierOrganizationId: true, dispute: { select: { assignedArbiterId: true } } } } } },
      },
    });
    if (!file) throw new NotFoundException("Файл не найден.");
    let allowed = file.uploadedById === userId;
    if (file.request?.customerId === userId || file.offer?.authoredById === userId || file.offer?.request.customerId === userId) allowed = true;
    if (file.request && !allowed) {
      const memberships = await this.prisma.organizationMember.findMany({ where: { userId, role: "SUPPLIER" }, select: { organizationId: true } });
      if (memberships.length) {
        const profiles = await this.prisma.supplierProfile.findMany({
          where: { organizationId: { in: memberships.map(item => item.organizationId) }, isPublished: true },
          select: { categories: { select: { categoryId: true } }, deliveryRegions: true },
        });
        const requestCategories = new Set(file.request.items.flatMap(item => item.categoryId ? [item.categoryId] : []));
        const requestCity = canonicalRegion(file.request.region);
        const requestMatches = profiles.some(profile => {
          const categoryMatches = profile.categories.some(category => requestCategories.has(category.categoryId));
          const regionMatches = !profile.deliveryRegions.length || profile.deliveryRegions.includes("Весь Казахстан") || profile.deliveryRegions.some(region => canonicalRegion(region) === requestCity);
          return categoryMatches && regionMatches;
        });
        if (requestMatches) allowed = true;
      }
    }
    if (file.offer && await this.prisma.organizationMember.findFirst({ where: { userId, organizationId: file.offer.supplierId } })) allowed = true;
    if (file.message) {
      const deal = file.message.deal;
      const member = await this.prisma.organizationMember.findFirst({ where: { userId, organizationId: { in: [deal.buyerOrganizationId ?? "", deal.supplierOrganizationId] } } });
      if (member || deal.dispute?.assignedArbiterId === userId) allowed = true;
    }
    if (await this.prisma.organizationMember.findFirst({ where: { userId, role: "ADMIN" } })) allowed = true;
    if (!allowed) throw new ForbiddenException("У вас нет доступа к этому файлу.");
    const key = file.storageKey.slice(file.storageKey.indexOf(":") + 1);
    const body = file.storageKey.startsWith("s3:") && this.s3 && this.bucket
      ? (await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }))).Body
      : await readFile(join(this.localRoot, key));
    if (!body) throw new NotFoundException("Файл не найден в хранилище.");
    return { file, body };
  }
}
