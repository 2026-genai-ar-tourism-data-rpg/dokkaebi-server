// ============================================================
// [v1] 대화 모듈 — 분기 대화 프록시 (찐 RPG, 기획 8-D·7-C)
// pipeline: 게임 백엔드 / 대화 (앱 → 서버 → AI 분기 대화)
// 구현(요약): POST /dialogue/turn — 앱 입력(노드·history·inventory·선택)을 AI로 위임.
//            서버는 얇은 프록시(진행상태 영속·검증은 추후 quest/run 모듈).
// 구현일: 2026-06-19 | 작성: kys (rpg-dialogue/kys/v1)
// ============================================================
import { Body, Controller, Module, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AiClient } from '../ai/ai.client';
import { AiModule } from '../ai/ai.module';

@ApiTags('dialogue')
@Controller('dialogue')
export class DialogueController {
  constructor(private readonly ai: AiClient) {}

  /** 분기 대화 한 턴 (선택마다 호출) */
  @Post('turn')
  turn(@Body() body: Record<string, unknown>) {
    return this.ai.dialogueTurn(body);
  }
}

@Module({ imports: [AiModule], controllers: [DialogueController] })
export class DialogueModule {}
