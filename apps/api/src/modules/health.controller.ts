import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { PrismaService } from "./prisma.service";

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}
  @Get()
  async health() {
    const database = await this.prisma.$queryRaw<Array<Record<string, unknown>>>`SELECT 1`;
    return { status: "ok", database: database.length ? "ok" : "error", timestamp: new Date().toISOString() };
  }
}
