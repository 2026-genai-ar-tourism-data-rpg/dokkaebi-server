// ============================================================
// [v2] 퀘스트 컨트롤러 — 게임 루프 엔드포인트
// pipeline: 게임 백엔드 / 퀘스트 (앱↔서버 계약)
// 구현(요약): run 시작·조회 → 노드 GPS인증 → 조각획득 → 노드완료. 전부 인증 필요(AuthGuard).
//            v1의 /quests/:questId/* 더미 3종을 /runs/:runId/nodes/:nodeId/* 로 교체.
//            questId 하나로는 '어느 플레이의 어느 노드'인지 알 수 없어 판정이 불가능했다(#8).
//            대화 프록시는 노드 단위라 그대로 유지.
// 구현일: 2026-06-10 (run 기반 재설계: 2026-08-02) | 작성: kys (base-pipeline/kys/v1)
// ============================================================
import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { AiClient } from '../ai/ai.client';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { TokenPayload } from '../auth/auth.module';
import { CompleteNodeDto, DialogueDto, LocationVerifyDto, StartRunDto } from './dto/quest.dto';
import { QuestService } from './quest.service';

@ApiTags('quest')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller()
export class QuestController {
  constructor(
    private readonly quest: QuestService,
    private readonly ai: AiClient,
  ) {}

  /** 플레이 시작 — 시나리오 1회 플레이(run) 생성 */
  @Post('runs')
  startRun(@CurrentUser() user: TokenPayload, @Body() dto: StartRunDto) {
    return this.quest.startRun(user.sub, dto.scenario_id);
  }

  /** 플레이 상태 조회 — 앱 복귀 시 진행도 복원 */
  @Get('runs/:runId')
  getRun(@CurrentUser() user: TokenPayload, @Param('runId') runId: string) {
    return this.quest.getRun(user.sub, runId);
  }

  /** GPS 위치 인증 (ARRIVED → GPS_VERIFIED) */
  @Post('runs/:runId/nodes/:nodeId/verify-location')
  verifyLocation(
    @CurrentUser() user: TokenPayload,
    @Param('runId') runId: string,
    @Param('nodeId') nodeId: string,
    @Body() dto: LocationVerifyDto,
  ) {
    return this.quest.verifyLocation(user.sub, runId, nodeId, dto.lat, dto.lng, dto.accuracy_m);
  }

  /** AR 기억석 조각 획득 (GPS 인증·requires 통과 필요) */
  @Post('runs/:runId/nodes/:nodeId/collect')
  collect(
    @CurrentUser() user: TokenPayload,
    @Param('runId') runId: string,
    @Param('nodeId') nodeId: string,
  ) {
    return this.quest.collectFragment(user.sub, runId, nodeId);
  }

  /** 노드 완료·보상 (QUEST_COMPLETE → REWARDED) */
  @Post('runs/:runId/nodes/:nodeId/complete')
  complete(
    @CurrentUser() user: TokenPayload,
    @Param('runId') runId: string,
    @Param('nodeId') nodeId: string,
    @Body() dto: CompleteNodeDto,
  ) {
    return this.quest.complete(user.sub, runId, nodeId, dto.choice_id);
  }

  /** NPC 대화 — AI 백엔드로 프록시 (노드 단위) */
  @Post('quests/:questId/dialogue')
  dialogue(@Param('questId') questId: string, @Body() dto: DialogueDto) {
    return this.ai.dialogue(dto.node_id, dto.stage ?? '등장', { user_input: dto.user_input });
  }
}
