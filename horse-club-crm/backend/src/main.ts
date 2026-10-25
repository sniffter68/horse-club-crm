import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';
import { requestLimits } from './common/request-limits';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { serveUploads } from './upload/upload.storage';
import { validateVkConfig, vkGroupToken } from './vk-bot/vk-bot.config';

async function bootstrap(): Promise<void> {
  validateVkConfig();
  if (process.env.NODE_ENV === 'production' && vkGroupToken() && !process.env.PUBLIC_LANDING_URL?.trim()) {
    throw new Error('PUBLIC_LANDING_URL is required when VK bot is enabled');
  }
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Backend is reachable only via Caddy on the private production network.
  app.getHttpAdapter().getInstance().set('trust proxy', process.env.NODE_ENV === 'production' ? 1 : false);
  app.use(requestLimits());
  serveUploads(app);

  app.get(PrismaService).enableShutdownHooks(app);

  try {
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );

    if (process.env.NODE_ENV !== 'production') {
      const swaggerConfig = new DocumentBuilder()
        .setTitle('Horse Club OS API')
        .setVersion('1.0.0')
        .addBearerAuth()
        .build();
      const document = SwaggerModule.createDocument(app, swaggerConfig);
      SwaggerModule.setup('api/docs', app, document);
    }

    await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
  } catch (error: unknown) {
    await app.close();
    throw error;
  }
}

void bootstrap().catch((error: unknown) => {
  const logger = new Logger('Bootstrap');
  if (error instanceof Error) {
    logger.error(error.message, error.stack);
  } else {
    logger.error(String(error));
  }
  process.exitCode = 1;
});
