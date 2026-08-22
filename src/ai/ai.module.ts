// ============================================================
// [v1] AI 모듈 — dokkaebi-ai 프록시
// pipeline: 게임 백엔드 ↔ AI 백엔드
// 구현(요약): HttpModule + AiClient 제공/export (다른 모듈이 주입)
// 구현일: 2026-06-10 | 작성: kys (base-pipeline/kys/v1)
// ============================================================
import { HttpModule } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Module } from '@nestjs/common';

import { AiClient } from './ai.client';

@Module({
  imports: [
    // 타임아웃이 없으면(axios 기본) AI가 멈췄을 때 앱이 무한히 스피너를 돈다.
    // 시나리오 생성은 LLM을 수십 번 부르므로 넉넉히, 그러나 무한은 아니게.
    HttpModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        timeout: config.get<number>('aiTimeoutMs') ?? 120_000,
        maxRedirects: 0,
      }),
    }),
  ],
  providers: [AiClient],
  exports: [AiClient],
})
export class AiModule {}
