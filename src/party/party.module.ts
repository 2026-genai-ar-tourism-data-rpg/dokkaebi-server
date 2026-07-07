// ============================================================
// [v1] 파티 모듈
// pipeline: 게임 백엔드 / 파티 (REST + 실시간)
// 구현(요약): PartyController + PartyService + PartyGateway(Socket.io)
// 구현일: 2026-06-10 | 작성: kys (base-pipeline/kys/v1)
// ============================================================
import { Module } from '@nestjs/common';

import { PartyController } from './party.controller';
import { PartyGateway } from './party.gateway';
import { PartyService } from './party.service';

@Module({
  controllers: [PartyController],
  providers: [PartyService, PartyGateway],
})
export class PartyModule {}
