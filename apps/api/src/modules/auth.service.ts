import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "./prisma.service";
import * as bcrypt from "bcryptjs";
import * as jwt from "jsonwebtoken";
import { randomBytes, createHash } from "node:crypto";
import { AccountRole } from "@prisma/client";

@Injectable()
export class AuthService {
  private readonly secret = process.env.JWT_SECRET ?? "local-development-secret-change-before-deploy";
  constructor(private readonly prisma: PrismaService) {}

  async register(input: { email?: string; phone?: string; password: string; displayName: string; role?: "customer" | "supplier"; organizationName?: string }) {
    if (!input.email && !input.phone) throw new UnauthorizedException("Укажите email или номер телефона.");
    const passwordHash = await bcrypt.hash(input.password, 12);
    try {
      const role = input.role === "supplier" ? AccountRole.SUPPLIER : AccountRole.CUSTOMER;
      const slug = `${(input.organizationName || input.displayName).toLowerCase().replace(/[^a-zа-я0-9]+/gi, "-").replace(/^-|-$/g, "")}-${randomBytes(3).toString("hex")}`;
      const user = await this.prisma.user.create({ data: {
        email: input.email?.toLowerCase(), phone: input.phone, passwordHash, displayName: input.displayName,
        memberships: { create: { role, organization: { create: {
          name: input.organizationName || input.displayName,
          slug,
          ...(role === AccountRole.SUPPLIER ? { supplierProfile: { create: { publicName: input.organizationName || input.displayName } } } : {}),
        } } } },
      } });
      return this.issueTokens(user.id, user.displayName, user.email ?? user.phone ?? "");
    } catch (error: any) {
      if (error.code === "P2002") throw new ConflictException("Этот email или телефон уже зарегистрирован.");
      throw error;
    }
  }

  async login(input: { login: string; password: string }) {
    const identifier = input.login.includes("@") ? { email: input.login.toLowerCase() } : { phone: input.login };
    const user = await this.prisma.user.findFirst({ where: identifier });
    if (!user || !user.isActive || !(await bcrypt.compare(input.password, user.passwordHash))) throw new UnauthorizedException("Неверные данные для входа.");
    return this.issueTokens(user.id, user.displayName, user.email ?? user.phone ?? "");
  }

  async refresh(token: string) {
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash }, include: { user: true } });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date() || !stored.user.isActive) throw new UnauthorizedException("Сессия истекла. Войдите снова.");
    const rotated = await this.prisma.refreshToken.updateMany({ where: { id: stored.id, revokedAt: null, expiresAt: { gt: new Date() } }, data: { revokedAt: new Date() } });
    if (!rotated.count) throw new UnauthorizedException("Сессия уже использована. Войдите снова.");
    return this.issueTokens(stored.user.id, stored.user.displayName, stored.user.email ?? stored.user.phone ?? "");
  }

  async verify(accessToken: string) {
    try { return jwt.verify(accessToken, this.secret) as { sub: string; name: string }; }
    catch { throw new UnauthorizedException("Требуется войти в аккаунт."); }
  }

  private async issueTokens(userId: string, name: string, login: string) {
    const membership = await this.prisma.organizationMember.findFirst({ where: { userId }, orderBy: { createdAt: "asc" } });
    const accessToken = jwt.sign({ sub: userId, name }, this.secret, { expiresIn: "15m", issuer: "tendermarket" });
    const refreshToken = randomBytes(48).toString("base64url");
    await this.prisma.refreshToken.create({ data: { userId, tokenHash: createHash("sha256").update(refreshToken).digest("hex"), expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) } });
    return { accessToken, refreshToken, tokenType: "Bearer", expiresIn: 900, user: { id: userId, name, login, role: membership?.role ?? "CUSTOMER" } };
  }
}
