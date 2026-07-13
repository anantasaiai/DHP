import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    // Disable NestJS built-in logger — nestjs-pino takes over via app.useLogger below
    { bufferLogs: true },
  );

  // Hand all NestJS internal logs to pino so every log line is structured JSON
  app.useLogger(app.get(Logger));

  // OpenAPI spec — authoritative contract (§6)
  const config = new DocumentBuilder()
    .setTitle('DHP Core API')
    .setDescription('Enterprise scheduling and meeting-automation platform')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  app.enableCors({
    origin: process.env['FRONTEND_URL'] ?? 'http://localhost:5173',
    credentials: true,
  });

  app.enableShutdownHooks();

  const port = process.env['PORT'] ?? 3000;
  await app.listen(port, '0.0.0.0');

  const logger = app.get(Logger);
  logger.log(`Core API listening on port ${port}`, 'Bootstrap');
  logger.log(`Swagger UI: http://localhost:${port}/api/docs`, 'Bootstrap');
}

void bootstrap();
