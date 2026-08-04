// ============================================================
// [v3] NestJS 부트스트랩 엔트리
// pipeline: 게임 백엔드 / 서빙 (앱 부팅)
// 구현(요약): 글로벌 prefix(v1)·ValidationPipe·업스트림 예외 필터·Swagger + listen.
//            0.0.0.0 바인딩 — 실기기(같은 Wi-Fi)에서 접속하려면 필수.
//            운영에서는 배포 가드가 위험한 기본값을 검사하고, CORS를 좁히고,
//            Swagger를 닫는다(계약 문서를 공개 노출하지 않는다).
// 구현일: 2026-06-10 (예외 필터·바인딩: 2026-08-04 · 배포 가드: 2026-08-04) | 작성: kys
// ============================================================
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';
import { UpstreamExceptionFilter } from './common/upstream-exception.filter';
import { assertProductionSafe } from './config/production-guard';

/** 앱 생성 + 전역 설정 + 기동. */
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const isProduction = (process.env.NODE_ENV ?? 'development') === 'production';

  // 위험한 개발 기본값이 운영에 나가면 여기서 기동을 막는다.
  assertProductionSafe({
    isProduction,
    authSecret: config.get<string>('authSecret') ?? '',
    dbSync: config.get<boolean>('dbSync') ?? false,
    databaseUrl: config.get<string>('databaseUrl') ?? '',
  });

  app.setGlobalPrefix('v1'); // OpenAPI 계약과 동일 (/v1/...)
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  // AI 백엔드 오류(422 등)를 500으로 뭉개지 않고 의미를 보존해 앱까지 전달.
  app.useGlobalFilters(new UpstreamExceptionFilter(app.get(HttpAdapterHost)));

  // CORS — 개발은 전체 허용(에뮬레이터·웹 미리보기), 운영은 CORS_ORIGINS로 좁힌다.
  // 모바일 앱은 CORS 대상이 아니므로 운영에서 열어 둘 이유가 없다.
  const origins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors(isProduction ? { origin: origins.length > 0 ? origins : false } : {});

  // Swagger UI — 운영에서는 닫는다. 엔드포인트·스키마 전체를 공개할 이유가 없다.
  if (!isProduction) {
    const doc = new DocumentBuilder()
      .setTitle('도깨비 게임 서버 API')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, doc));
  }

  const port = process.env.PORT ?? 8000;
  // 0.0.0.0 명시 — 루프백에만 바인딩되면 같은 Wi-Fi의 실기기에서 접속이 전부 실패한다.
  await app.listen(port, '0.0.0.0');
  new Logger('Bootstrap').log(
    `dokkaebi-server on 0.0.0.0:${port}` +
      (isProduction ? ' [production]' : ' (docs: /docs)'),
  );
}
bootstrap();
