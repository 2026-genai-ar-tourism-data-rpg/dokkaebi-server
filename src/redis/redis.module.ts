// ============================================================
// [v1] Redis 모듈 — 전역 제공(조각 선점·위치 fix)
// pipeline: 게임 백엔드 / 공통 인프라
// 구현(요약): RedisService를 전역 등록해 quest 등 도메인 모듈이 주입받게 한다.
// 구현일: 2026-08-02 | 작성: kys (quest-api/kys/v1) · 이슈 #8
// ============================================================
import { Global, Module } from '@nestjs/common';

import { RedisService } from './redis.service';

@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
