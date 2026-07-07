// ============================================================
// [v1] 시나리오 모듈 — 시나리오 생성(AI 프록시)
// pipeline: 게임 백엔드 / 시나리오 (앱 입력 → AI 노드선택·조립 위임)
// 구현(요약): POST /scenarios/custom — 입력 contract DTO 검증 후 dokkaebi-ai로 프록시.
//            (앵커+샛길·비인기 규칙은 AI 쪽 생성 로직, 추후) 아키텍처 5-6 입력 contract.
// 구현일: 2026-06-10 (AI 연결: 2026-06-18) | 작성: kys
// ============================================================
import { Body, Controller, Get, Injectable, Module, Post, Query } from '@nestjs/common';
import { ApiProperty, ApiQuery, ApiTags } from '@nestjs/swagger';
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
}

/** 시나리오 생성. 입력 검증 → AI 백엔드 위임(노드선택·조립·대사). */
@Injectable()
export class ScenarioService {
  constructor(private readonly ai: AiClient) {}

  /** 앱 입력을 그대로 AI에 전달해 시나리오 생성(서버는 얇은 프록시). */
  async generate(dto: GenerateScenarioDto): Promise<ScenarioResult> {
    return this.ai.generateScenario(dto as unknown as Record<string, unknown>);
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
  imports: [AiModule],
  controllers: [ScenarioController],
  providers: [ScenarioService],
})
export class ScenarioModule {}
