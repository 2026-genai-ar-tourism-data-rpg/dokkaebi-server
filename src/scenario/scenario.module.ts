// ============================================================
// [v1] 시나리오 모듈 — 시나리오 생성(AI 프록시)
// pipeline: 게임 백엔드 / 시나리오 (앱 입력 → AI 노드선택·조립 위임)
// 구현(요약): POST /scenarios/custom — 입력 contract DTO 검증 후 dokkaebi-ai로 프록시.
//            (앵커+샛길·비인기 규칙은 AI 쪽 생성 로직, 추후) 아키텍처 5-6 입력 contract.
//            DTO는 AI ScenarioGenRequest와 1:1로 맞춘다 — whitelist:true라 누락 필드는 유실됨.
// 구현일: 2026-06-10 (AI 연결: 2026-06-18 · with_branching 추가: 2026-08-02) | 작성: kys
// ------------------------------------------------------------
// [v2] 앱 마법사 입력 통과 — headcount·duration·companion·difficulty·tags·use_fixed_script.
// 구현(요약): 앱 「나만의 코스 만들기」가 보내는 값 중 DTO에 없는 것은 whitelist:true가
//            조용히 잘라내서 AI까지 도달하지 못한다. 실제로 headcount(ai#v2에서 추가)가
//            그렇게 유실돼 4인 예산이 계속 1인 기준으로 계산되고 있었다.
//            AI ScenarioGenRequest와 1:1 유지 — 한쪽만 늘리면 그 필드는 없는 것과 같다.
// 구현일: 2026-08-18 | 작성: kys (explore-input-wiring/kys/v1)
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
  Min,
  ValidateNested,
} from 'class-validator';

import { AiClient, NearbyPlace, ScenarioResult, SearchCandidate } from '../ai/ai.client';
import { AiModule } from '../ai/ai.module';
import { Scenario } from '../database/entities';
import { ScenarioStore } from './scenario.store';

/** "내 주변 탐험" 기본 반경(m) — AI 도보 코스 반경(scenario_radius_walk_m)과 맞춘다. */
const DEFAULT_NEARBY_RADIUS_M = 2000;

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

  /** 인원수 — 1인 예산 = budget/headcount (AI 식음 예산 게이팅). */
  @ApiProperty({ required: false }) @IsOptional() @IsInt() @Min(1) headcount?: number;

  @ApiProperty({ required: false }) @IsOptional() @IsBoolean() no_meals?: boolean;

  /** 지역 라벨. 'auto'(기본)면 AI가 후보 주소에서 시군구를 유추한다. */
  @ApiProperty({ required: false }) @IsOptional() @IsString() region?: string;

  // --- 앱 「나만의 코스 만들기」 3단계 입력 (AI preference.py가 생성 파라미터로 번역) ---
  /** 탐험 시간 2h|half|full → 방문 장소 수·검색 반경. */
  @ApiProperty({ required: false }) @IsOptional() @IsString() duration?: string;
  /** 동행 solo|friend|couple|family → 인원수(headcount 미전송 시). */
  @ApiProperty({ required: false }) @IsOptional() @IsString() companion?: string;
  /** 난이도 easy|normal|hard → GPS 트리거 반경·힌트 노출 수. */
  @ApiProperty({ required: false }) @IsOptional() @IsString() difficulty?: string;
  /** 취향 태그(#고궁·#카페…) → 후보 선호 가중. */
  @ApiProperty({ type: [String], required: false })
  @IsOptional() @IsArray() @IsString({ each: true })
  tags?: string[];
  /** 종로 정답지 고정 재생(시연용). 기본 false = 입력을 반영한 동적 생성. */
  @ApiProperty({ required: false }) @IsOptional() @IsBoolean() use_fixed_script?: boolean;

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

  /** 내 주변 POI 목록(거리순) — 좌표만 있으면 되고 LLM을 안 타 즉시 응답. */
  async nearby(lat: number, lng: number, radiusM?: number): Promise<NearbyPlace[]> {
    return this.ai.nearbyPlaces(lat, lng, radiusM ?? DEFAULT_NEARBY_RADIUS_M);
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

  /** 내 주변 탐험 — 현재 좌표 반경 내 POI(거리순). 예: /v1/scenarios/nearby?lat=..&lng=.. */
  @Get('nearby')
  @ApiQuery({ name: 'lat', required: true })
  @ApiQuery({ name: 'lng', required: true })
  @ApiQuery({ name: 'radius_m', required: false })
  nearby(
    @Query('lat') lat: string,
    @Query('lng') lng: string,
    @Query('radius_m') radiusM?: string,
  ) {
    return this.scenario.nearby(
      Number(lat),
      Number(lng),
      radiusM ? Number(radiusM) : undefined,
    );
  }
}

@Module({
  imports: [AiModule, TypeOrmModule.forFeature([Scenario])],
  controllers: [ScenarioController],
  providers: [ScenarioService, ScenarioStore],
  exports: [ScenarioStore],   // 퀘스트가 노드 좌표·requires를 읽는다
})
export class ScenarioModule {}
