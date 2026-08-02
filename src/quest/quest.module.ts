// ============================================================
// [v2] 퀘스트 모듈
// pipeline: 게임 백엔드 / 퀘스트
// 구현(요약): QuestController + QuestService, AiModule(프록시)·AuthModule(가드)·
//            ScenarioModule(노드 조회)·엔티티 리포지토리 주입.
// 구현일: 2026-06-10 (영속·인증 배선: 2026-08-02) | 작성: kys (base-pipeline/kys/v1)
// ============================================================
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AiModule } from '../ai/ai.module';
import { AuthModule } from '../auth/auth.module';
import { FragmentCollect, NodeVisit, QuestRun } from '../database/entities';
import { ScenarioModule } from '../scenario/scenario.module';
import { QuestController } from './quest.controller';
import { QuestService } from './quest.service';

@Module({
  imports: [
    AiModule,
    AuthModule,
    ScenarioModule,
    TypeOrmModule.forFeature([QuestRun, NodeVisit, FragmentCollect]),
  ],
  controllers: [QuestController],
  providers: [QuestService],
})
export class QuestModule {}
