// ============================================================
// [v1] 퀘스트 컨트롤러 — 게임 루프 엔드포인트
// pipeline: 게임 백엔드 / 퀘스트 (앱↔서버 계약)
// 구현(요약): verify-location · dialogue(AI 프록시) · fragments/collect · complete
// 구현일: 2026-06-10 | 작성: kys (base-pipeline/kys/v1)
// ============================================================
import { Body, Controller, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AiClient } from '../ai/ai.client';
import { DialogueDto, LocationVerifyDto } from './dto/quest.dto';
import { QuestService } from './quest.service';

@ApiTags('quest')
@Controller('quests')
export class QuestController {
  constructor(
    private readonly quest: QuestService,
    private readonly ai: AiClient,
  ) {}

  /** GPS 위치 인증 (ARRIVED → GPS_VERIFIED) */
  @Post(':questId/verify-location')
  verifyLocation(@Param('questId') questId: string, @Body() dto: LocationVerifyDto) {
    return this.quest.verifyLocation(questId, dto.lat, dto.lng, dto.accuracy_m);
  }

  /** NPC 대화 — AI 백엔드로 프록시 */
  @Post(':questId/dialogue')
  async dialogue(@Param('questId') questId: string, @Body() dto: DialogueDto) {
    return this.ai.dialogue(dto.node_id, dto.stage ?? '등장', {
      user_input: dto.user_input,
    });
  }

  /** AR 기억석 조각 획득 */
  @Post(':questId/fragments/:fragmentId/collect')
  collect(@Param('questId') questId: string, @Param('fragmentId') fragmentId: string) {
    return this.quest.collectFragment(questId, fragmentId);
  }

  /** 퀘스트 완료·보상 */
  @Post(':questId/complete')
  complete(@Param('questId') questId: string) {
    return this.quest.complete(questId);
  }
}
