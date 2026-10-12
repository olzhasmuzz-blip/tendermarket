import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule } from "@nestjs/throttler";
import { ThrottlerGuard } from "@nestjs/throttler";
import { APP_GUARD } from "@nestjs/core";
import { PrismaService } from "./prisma.service";
import { HealthController } from "./health.controller";
import { AuthController } from "./auth.controller";
import { MarketplaceController } from "./marketplace.controller";
import { AuthService } from "./auth.service";
import { MarketplaceService } from "./marketplace.service";
import { AuthGuard } from "./auth.guard";
import { FilesService } from "./files.service";

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }])],
  controllers: [HealthController, AuthController, MarketplaceController],
  providers: [PrismaService, AuthService, MarketplaceService, FilesService, AuthGuard, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
