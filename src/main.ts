// ============================================================
// [v1] NestJS 부트스트랩 엔트리
// pipeline: 게임 백엔드 / 서빙 (앱 부팅)
// 구현(요약): 글로벌 prefix(v1)·ValidationPipe·업스트림 예외 필터·Swagger(/docs) + listen.
//            0.0.0.0 바인딩 — 실기기(같은 Wi-Fi)에서 접속하려면 필수.
// 구현일: 2026-06-10 (예외 필터·바인딩 명시: 2026-08-04) | 작성: kys (base-pipeline/kys/v1)
// ============================================================
import { Logger, ValidationPipe } from '@nestjs/common';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';
import { UpstreamExceptionFilter } from './common/upstream-exception.filter';

/** 앱 생성 + 전역 설정 + 기동. */
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('v1'); // OpenAPI 계약과 동일 (/v1/...)
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  // AI 백엔드 오류(422 등)를 500으로 뭉개지 않고 의미를 보존해 앱까지 전달.
  app.useGlobalFilters(new UpstreamExceptionFilter(app.get(HttpAdapterHost)));
  app.enableCors();

  // Swagger UI (계약 자동 노출) — /docs
  const doc = new DocumentBuilder()
    .setTitle('도깨비 게임 서버 API')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, doc));

  const port = process.env.PORT ?? 8000;
  // 0.0.0.0 명시 — 기본값에 기대지 않는다. 루프백에만 바인딩되면
  // 같은 Wi-Fi의 실기기에서 접속이 전부 실패한다.
  await app.listen(port, '0.0.0.0');
  new Logger('Bootstrap').log(`dokkaebi-server on 0.0.0.0:${port} (docs: /docs)`);
}
bootstrap();
