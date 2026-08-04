// ============================================================
// [v1] 시나리오 모듈 — 시나리오 생성(AI 프록시)
// pipeline: 게임 백엔드 / 시나리오 (앱 입력 → AI 노드선택·조립 위임)
// 구현(요약): POST /scenarios/custom — 입력 contract DTO 검증 후 dokkaebi-ai로 프록시.
//            (앵커+샛길·비인기 규칙은 AI 쪽 생성 로직, 추후) 아키텍처 5-6 입력 contract.
//            DTO는 AI ScenarioGenRequest와 1:1로 맞춘다 — whitelist:true라 누락 필드는 유실됨.
// 구현일: 2026-06-10 (AI 연결: 2026-06-18 · with_branching 추가: 2026-08-02) | 작성: kys
// ============================================================
import { Body, Controller, Get, Injectable, Logger, Module, Post, Query } from '@nestjs/common';
import { ApiProperty, ApiQuery, ApiTags } from '@nestjs/swagger';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

import { AiClient, ScenarioResult, SearchCandidate } from '../ai/ai.client';
import { AiModule } from '../ai/ai.module';
import { Scenario } from '../database/entities';
import { ScenarioStore } from './scenario.store';

/** 좌표 (앱이 GPS/카카오로 해석해 넘김) */
export class LatLngDto {
  @ApiProperty() @IsNumber() lat: number;
  @ApiProperty() @IsNumber() lng: number;
}

/** 위시리스트 항목 — searchKeyword2 자동완성에서 확정한 content_id */
export class WishItemDto {
  @ApiProperty() @IsString() content_id: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() name?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() lat?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() lng?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() kind?: string;
}

/** 시나리오 생성 입력 contract (아키텍처 5-6). 필수=user_id·start. */
export class GenerateScenarioDto {
  @ApiProperty() @IsString() user_id: string;

  @ApiProperty({ type: LatLngDto })
  @ValidateNested() @Type(() => LatLngDto)
  start: LatLngDto;

  @ApiProperty({ type: LatLngDto, required: false })
  @IsOptional() @ValidateNested() @Type(() => LatLngDto)
  end?: LatLngDto;

  @ApiProperty({ required: false }) @IsOptional() @IsInt() radius_m?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() transport?: string;

  @ApiProperty({ type: [WishItemDto], required: false })
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => WishItemDto)
  wishlist?: WishItemDto[];

  @ApiProperty({ required: false }) @IsOptional() @IsInt() budget?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsBoolean() no_meals?: boolean;
  @ApiProperty({ required: false }) @IsOptional() @IsString() region?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsBoolean() with_dialogue?: boolean;
  @ApiProperty({ required: false }) @IsOptional() @IsBoolean() with_content?: boolean;

  // 갈림길(route 분기) 생성 여부. 전역 ValidationPipe가 whitelist:true라
  // 여기 없는 필드는 AI로 프록시되기 전에 조용히 잘려나간다 → 반드시 선언할 것(#6).
  @ApiProperty({ required: false }) @IsOptional() @IsBoolean() with_branching?: boolean;
}

/** 시나리오 생성. 입력 검증 → AI 백엔드 위임(노드선택·조립·대사) → 영속. */
@Injectable()
export class ScenarioService {
  private readonly logger = new Logger(ScenarioService.name);

  constructor(
    private readonly ai: AiClient,
    private readonly store: ScenarioStore,
  ) {}

  /**
   * 앱 입력을 그대로 AI에 전달해 시나리오 생성 후 저장.
   * 저장은 필수다 — 퀘스트 GPS 판정이 여기 담긴 노드 좌표·반경을 읽는다(#8).
   * 저장 실패가 생성 자체를 막지는 않되(플레이는 가능해야 함) 경고를 남긴다.
   */
  async generate(dto: GenerateScenarioDto): Promise<ScenarioResult> {
    const result = await this.ai.generateScenario(dto as unknown as Record<string, unknown>);
    try {
      await this.store.save(result as unknown as Record<string, unknown>);
    } catch (e) {
      this.logger.error(`시나리오 저장 실패(플레이 불가 상태): ${String(e)}`);
    }
    return result;
  }

  /** 관광지 이름 검색(앵커 자동완성). */
  async search(keyword: string): Promise<SearchCandidate[]> {
    if (!keyword?.trim()) return [];
    return this.ai.searchAttractions(keyword.trim());
  }
}

@ApiTags('scenario')
@Controller('scenarios')
export class ScenarioController {
  constructor(private readonly scenario: ScenarioService) {}

  /** 관광지 이름 검색 — 앵커 자동완성 (예: /v1/scenarios/search?keyword=경복궁) */
  @Get('search')
  @ApiQuery({ name: 'keyword', required: true })
  search(@Query('keyword') keyword: string) {
    return this.scenario.search(keyword);
  }

  /** 맞춤 시나리오 생성 (현재위치·끝점·위시리스트 등 → 코스) */
  @Post('custom')
  custom(@Body() dto: GenerateScenarioDto) {
    return this.scenario.generate(dto);
  }
}

@Module({
  imports: [AiModule, TypeOrmModule.forFeature([Scenario])],
  controllers: [ScenarioController],
  providers: [ScenarioService, ScenarioStore],
  exports: [ScenarioStore],   // 퀘스트가 노드 좌표·requires를 읽는다
})
export class ScenarioModule {}
