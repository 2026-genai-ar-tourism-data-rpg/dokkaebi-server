// ============================================================
// [v1] AI 모듈 — dokkaebi-ai 프록시
// pipeline: 게임 백엔드 ↔ AI 백엔드
// 구현(요약): HttpModule + AiClient 제공/export (다른 모듈이 주입)
// 구현일: 2026-06-10 | 작성: kys (base-pipeline/kys/v1)
// ============================================================
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { AiClient } from './ai.client';

@Module({
  imports: [HttpModule],
  providers: [AiClient],
  exports: [AiClient],
})
export class AiModule {}
