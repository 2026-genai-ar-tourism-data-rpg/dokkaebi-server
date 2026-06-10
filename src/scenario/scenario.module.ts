// ============================================================
// [v1] 시나리오 모듈 — 맞춤 시나리오 생성(위시리스트)
// pipeline: 게임 백엔드 / 시나리오 (앵커+샛길, 규칙 11-3)
// 구현(요약): POST /scenarios/custom 스텁. 실제 생성은 AI(노드선택기+조립) 위임 예정
// 구현일: 2026-06-10 | 작성: kys (base-pipeline/kys/v1)
// ============================================================
import { Body, Controller, Injectable, Module, Post } from '@nestjs/common';
import { ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsArray, IsOptional } from 'class-validator';

/** 맞춤 시나리오 요청 */
export class CustomScenarioDto {
  @ApiProperty({ type: [String], required: false })
  @IsOptional()
  @IsArray()
  wishlist?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  constraints?: Record<string, string>;
}

/** 시나리오 생성. 담당: 흐름=김예슬 / 노드선택·조립=AI(박준형). */
@Injectable()
export class ScenarioService {
  /** 위시리스트 → 앵커+샛길 시나리오 생성(규칙 11-3) */
  async createCustom(dto: CustomScenarioDto) {
    // TODO: AI 백엔드 노드 선택기 + 조립 호출 (앵커=위시리스트, 샛길=비인기지)
    return {
      scenario_id: 's_demo',
      title: '맞춤 코스(데모)',
      node_sequence: [],
      anchor_node_id: dto.wishlist?.[0] ?? null,
      is_public: false,
    };
  }
}

@ApiTags('scenario')
@Controller('scenarios')
export class ScenarioController {
  constructor(private readonly scenario: ScenarioService) {}

  /** 맞춤 시나리오 생성 */
  @Post('custom')
  custom(@Body() dto: CustomScenarioDto) {
    return this.scenario.createCustom(dto);
  }
}

@Module({ controllers: [ScenarioController], providers: [ScenarioService] })
export class ScenarioModule {}
