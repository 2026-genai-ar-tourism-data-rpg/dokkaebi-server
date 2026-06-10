// ============================================================
// [v1] 헬스 모듈
// pipeline: 게임 백엔드 / 운영
// 구현(요약): HealthController 등록
// 구현일: 2026-06-10 | 작성: kys (base-pipeline/kys/v1)
// ============================================================
import { Module } from '@nestjs/common';

import { HealthController } from './health.controller';

@Module({ controllers: [HealthController] })
export class HealthModule {}
