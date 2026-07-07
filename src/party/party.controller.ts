// ============================================================
// [v1] 파티 컨트롤러 — 파티 생성/입장 REST
// pipeline: 게임 백엔드 / 파티
// 구현(요약): POST /parties · POST /parties/:code/join
// 구현일: 2026-06-10 | 작성: kys (base-pipeline/kys/v1)
// ============================================================
import { Controller, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { PartyService } from './party.service';

@ApiTags('party')
@Controller('parties')
export class PartyController {
  constructor(private readonly party: PartyService) {}

  /** 파티 생성(초대 코드 발급) */
  @Post()
  create() {
    return this.party.create();
  }

  /** 초대 코드로 파티 입장 */
  @Post(':code/join')
  join(@Param('code') code: string) {
    return this.party.join(code);
  }
}
