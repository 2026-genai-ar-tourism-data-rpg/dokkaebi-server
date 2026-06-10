// ============================================================
// [v1] NestJS 부트스트랩 엔트리
// pipeline: 게임 백엔드 / 서빙 (앱 부팅)
// 구현(요약): 글로벌 prefix(v1)·ValidationPipe·Swagger(/docs) + listen
// 구현일: 2026-06-10 | 작성: kys (base-pipeline/kys/v1)
// ============================================================
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';

/** 앱 생성 + 전역 설정 + 기동. */
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('v1'); // OpenAPI 계약과 동일 (/v1/...)
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.enableCors();

  // Swagger UI (계약 자동 노출) — /docs
  const doc = new DocumentBuilder()
    .setTitle('도깨비 게임 서버 API')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, doc));

  const port = process.env.PORT ?? 8000;
  await app.listen(port);
  new Logger('Bootstrap').log(`dokkaebi-server on :${port} (docs: /docs)`);
}
bootstrap();
