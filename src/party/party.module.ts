// ============================================================
// [v2] 파티 모듈
// pipeline: 게임 백엔드 / 파티 (REST + 실시간)
// 구현(요약): PartyController + PartyService + PartyGateway(Socket.io)
//            영속(Party·PartyMember)·인증(AuthGuard) 배선 추가.
// 구현일: 2026-06-10 (영속·인증: 2026-08-04) | 작성: kys (base-pipeline/kys/v1)
// ============================================================
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { Party, PartyMember, User } from '../database/entities';
import { PartyController } from './party.controller';
import { PartyGateway } from './party.gateway';
import { PartyService } from './party.service';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([Party, PartyMember, User])],
  controllers: [PartyController],
  providers: [PartyService, PartyGateway],
})
export class PartyModule {}
