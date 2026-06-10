// ============================================================
// [v1] 헬스체크 컨트롤러
// pipeline: 게임 백엔드 / 서빙 (운영)
// 구현(요약): GET /v1/health
// 구현일: 2026-06-10 | 작성: kys (base-pipeline/kys/v1)
// ============================================================
import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('health')
@Controller('health')
export class HealthController {
  /** 헬스체크 */
  @Get()
  health() {
    return { status: 'ok' };
  }
}
