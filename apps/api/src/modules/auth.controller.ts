import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { IsEmail, IsIn, IsOptional, IsString, Matches, MinLength } from "class-validator";
import { AuthService } from "./auth.service";
import { AuthGuard } from "./auth.guard";
import { PrismaService } from "./prisma.service";
import { Throttle } from "@nestjs/throttler";

class RegisterDto {
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @Matches(/^\+[1-9]\d{7,14}$/) phone?: string;
  @IsString() @MinLength(10) password!: string;
  @IsString() @MinLength(2) displayName!: string;
  @IsOptional() @IsIn(["customer", "supplier"]) role?: "customer" | "supplier";
  @IsOptional() @IsString() @MinLength(2) organizationName?: string;
}
class LoginDto { @IsString() login!: string; @IsString() @MinLength(1) password!: string; }
class RefreshDto { @IsString() refreshToken!: string; }

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly prisma: PrismaService) {}
  @Post("register") @Throttle({ default: { limit: 8, ttl: 60_000 } }) @ApiOperation({ summary: "Регистрация покупателя или поставщика" }) register(@Body() body: RegisterDto) { return this.auth.register(body); }
  @Post("login") @Throttle({ default: { limit: 8, ttl: 60_000 } }) @ApiOperation({ summary: "Вход по email/телефону и паролю" }) login(@Body() body: LoginDto) { return this.auth.login(body); }
  @Post("refresh") @ApiOperation({ summary: "Ротация пары access/refresh токенов" }) refresh(@Body() body: RefreshDto) { return this.auth.refresh(body.refreshToken); }
  @Get("me") @UseGuards(AuthGuard) @ApiBearerAuth() async me(@Req() req: any) { return this.prisma.user.findUnique({ where: { id: req.user.sub }, select: { id: true, email: true, phone: true, displayName: true, locale: true, memberships: { select: { role: true, organization: { select: { id: true, name: true } } } } } }); }
}
