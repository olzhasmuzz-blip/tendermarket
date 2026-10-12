import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "helmet";
import { AppModule } from "./modules/app.module";

async function bootstrap() {
  if (process.env.NODE_ENV === "production" && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) throw new Error("JWT_SECRET must be set to at least 32 characters in production.");
  const app = await NestFactory.create(AppModule, { cors: false });
  app.use(helmet());
  app.enableCors({ origin: process.env.WEB_ORIGIN?.split(",") ?? ["http://localhost:5173"], credentials: true });
  app.setGlobalPrefix("api/v1");
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  const swagger = new DocumentBuilder().setTitle("TenderMarket API").setDescription("Единый API для веб-клиента и Flutter").setVersion("1.0.0").addBearerAuth().build();
  SwaggerModule.setup("api/docs", app, SwaggerModule.createDocument(app, swagger));
  await app.listen(Number(process.env.PORT ?? 3001), "0.0.0.0");
}

bootstrap();
