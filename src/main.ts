import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  app.setGlobalPrefix('api');

  // Enable CORS for frontend integration
  const allowedOrigins = [
    configService.get<string>('FRONTEND_URL') || 'http://localhost:3001',
    'http://localhost:5173', // Admin Frontend
    'http://localhost:3000', // Swagger/Backend itself
  ];

  // In development, we also allow 'null' for opening the playground as a local file
  if (configService.get<string>('NODE_ENV') !== 'production') {
    allowedOrigins.push('null');
  }

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl) or in allowed list
      if (
        !origin ||
        allowedOrigins.includes(origin) ||
        allowedOrigins.includes(String(origin))
      ) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  });

  // Global validation (DTOs)
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Swagger API docs (front client)
  const config = new DocumentBuilder()
    .setTitle('InsightSage API')
    .setDescription('MVP Back-end DAF - SaaS BI Platform')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('Auth', 'Authentication & Authorization')
    .addTag('Users', 'User management')
    .addTag('Roles', 'RBAC role management')
    .addTag('Admin', 'Platform administration')
    .addTag('Agents', 'On-premise agent management')
    .addTag('Dashboards', 'Dashboard management')
    .addTag('Widget Store', 'Catalogue des KPIs et templates de widgets')
    .addTag('Widget Management', 'Gestion des widgets au sein des dashboards (Ajout, Edition, Suppression)')
    .addTag('NLQ', 'Natural Language Query')
    .addTag('Onboarding', 'Client onboarding wizard')
    .addTag('Logs', 'Audit logs')
    .addTag('Health', 'Health checks')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  const port = configService.get<number>('PORT') || 3000;
  await app.listen(port);
  console.log(`🚀 InsightSage API: http://localhost:${port}/api`);
}
bootstrap();
