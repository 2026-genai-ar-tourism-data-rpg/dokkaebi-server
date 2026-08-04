// ============================================================
// [v2] 파티 컨트롤러 — 파티 생성/입장/조회 REST
// pipeline: 게임 백엔드 / 파티
// 구현(요약): POST /parties · POST /parties/:code/join · GET /parties/:partyId
//            전부 인증 필요 — 누가 만들고 누가 들어왔는지가 파티의 핵심이라
//            익명 요청을 허용하면 멤버 목록이 의미를 잃는다.
// 구현일: 2026-06-10 (인증·조회 추가: 2026-08-04) | 작성: kys (base-pipeline/kys/v1)
// ============================================================
import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { TokenPayload } from '../auth/auth.module';
import { PartyMode } from '../database/entities';
import { PartyService } from './party.service';

/** 파티 생성 요청 — 전부 선택값(기본: 종로·협력). */
export class CreatePartyDto {
  @ApiProperty({ required: false, example: '종로' })
  @IsOptional() @IsString()
  region_id?: string;

  @ApiProperty({ required: false, enum: ['coop', 'versus'] })
  @IsOptional() @IsIn(['coop', 'versus'])
  mode?: PartyMode;

  @ApiProperty({ required: false, description: '같이 돌 시나리오' })
  @IsOptional() @IsString()
  scenario_id?: string;
}

@ApiTags('party')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('parties')
export class PartyController {
  constructor(private readonly party: PartyService) {}

  /** 파티 생성(초대 코드 발급) */
  @Post()
  create(@CurrentUser() user: TokenPayload, @Body() dto: CreatePartyDto) {
    return this.party.create(user.sub, dto);
  }

  /** 초대 코드로 파티 입장 */
  @Post(':code/join')
  join(@Param('code') code: string, @CurrentUser() user: TokenPayload) {
    return this.party.join(code, user.sub);
  }

  /** 파티 상태 조회(멤버 목록) */
  @Get(':partyId')
  get(@Param('partyId') partyId: string) {
    return this.party.get(partyId);
  }
}
