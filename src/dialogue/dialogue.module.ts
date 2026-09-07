// ============================================================
// [v1] 대화 모듈 — 분기 대화 프록시 (찐 RPG, 기획 8-D·7-C)
// pipeline: 게임 백엔드 / 대화 (앱 → 서버 → AI 분기 대화)
// 구현(요약): POST /dialogue/turn — 앱 입력(노드·history·inventory·선택)을 AI로 위임.
//            서버는 얇은 프록시(진행상태 영속·검증은 추후 quest/run 모듈).
// 구현일: 2026-06-19 | 작성: kys (rpg-dialogue/kys/v1)
// ------------------------------------------------------------
// [v2] 대화 깊이를 서버가 센다 + 인증 요구.
// 구현(요약): turn이 앱 화면의 지역변수라 화면을 닫았다 열면 0으로 리셋됐고, 서버는
//            바디를 그대로 넘기는 프록시라 검증이 없었다 → 같은 노드에서 대화를 무한
//            반복해 LLM을 계속 호출할 수 있었다(실측). Redis 카운터로 노드별 턴을 세어
//            **서버 값으로 덮어쓴다**. Redis가 없으면 앱 값으로 폴백(게임은 안 막는다).
//            대화가 끝나면(done) 카운터를 지워 다음 방문이 처음부터 시작되게 한다.
//            유저 단위로 세야 하므로 AuthGuard를 건다 — 앱은 이미 토큰을 보내고 있다.
// 구현일: 2026-08-19 | 작성: kys (dialogue-rework/kys/v1)
// ============================================================
import { Body, Controller, Module, Post, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';

import { AiClient } from '../ai/ai.client';
import { AiModule } from '../ai/ai.module';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { AuthModule, TokenPayload } from '../auth/auth.module';
import { RedisModule } from '../redis/redis.module';
import { RedisService } from '../redis/redis.service';

/** config.dialogue — 턴 카운터 설정. */
interface DialogueRules {
  turnTtlSec: number;
  maxTurns: number;
}

@ApiTags('dialogue')
@Controller('dialogue')
@UseGuards(AuthGuard)
export class DialogueController {
  constructor(
    private readonly ai: AiClient,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  private get rules(): DialogueRules {
    return this.config.get<DialogueRules>('dialogue') as DialogueRules;
  }

  /**
   * 분기 대화 한 턴 (선택마다 호출).
   *
   * turn은 앱이 보낸 값을 믿지 않고 서버 카운터로 덮어쓴다. 대화가 끝나면 카운터를 비운다.
   * 그 외 필드(history·inventory·branch)는 그대로 AI에 넘긴다.
   */
  @Post('turn')
  async turn(
    @CurrentUser() user: TokenPayload,
    @Body() body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const nodeId = String(body.node_id ?? '');
    const key = `dlg:${user.sub}:${nodeId}`;
    const counted = await this.redis.incr(key, this.rules.turnTtlSec);

    // counted는 1-base(첫 호출=1) — AI의 turn은 0-base라 1을 뺀다.
    // Redis가 없으면(null) 앱이 보낸 값을 그대로 쓴다.
    const turn = counted === null ? Number(body.turn ?? 0) : counted - 1;

    const out = await this.ai.dialogueTurn({ ...body, turn });

    if (out?.done === true) {
      await this.redis.del(key); // 이 노드 대화 종료 → 다음 방문은 처음부터
    }
    return out;
  }
}

@Module({
  imports: [AiModule, AuthModule, RedisModule],
  controllers: [DialogueController],
})
export class DialogueModule {}
