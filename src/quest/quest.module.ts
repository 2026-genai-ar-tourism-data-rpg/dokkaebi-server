// ============================================================
// [v1] 퀘스트 모듈
// pipeline: 게임 백엔드 / 퀘스트
// 구현(요약): QuestController + QuestService, AiModule(프록시) 주입
// 구현일: 2026-06-10 | 작성: kys (base-pipeline/kys/v1)
// ============================================================
import { Module } from '@nestjs/common';

import { AiModule } from '../ai/ai.module';
import { QuestController } from './quest.controller';
import { QuestService } from './quest.service';

@Module({
  imports: [AiModule],
  controllers: [QuestController],
  providers: [QuestService],
})
export class QuestModule {}
