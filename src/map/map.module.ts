// ============================================================
// [v2] 지도 모듈 — 관광지 노드 조회(지도 마커·상세)
// pipeline: 게임 백엔드 / 지도 (저장된 시나리오의 노드가 데이터 원천)
// 구현(요약): 지역의 노드 목록/상세를 저장된 시나리오에서 모아 준다.
//            v1은 빈 배열·{node_id}만 반환해서 지도에 마커가 하나도 안 찍혔다.
//            노드 원본은 AI 생성 결과에만 있으므로 scenarios.payload를 원천으로 쓴다
//            (별도 노드 마스터 테이블은 지역 확장 시 도입 — 지금은 중복 이득 없음).
// 구현일: 2026-06-10 (실구현: 2026-08-04) | 작성: kys (base-pipeline/kys/v1) · 이슈 #8
// ============================================================
import { Controller, Get, Injectable, Module, NotFoundException, Param, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Scenario } from '../database/entities';

/** 지도 마커 1개 — 앱이 핀을 찍는 데 필요한 최소 정보. */
export interface MapNode {
  node_id: string;
  name: string | null;
  kind: string;
  lat: number | null;
  lng: number | null;
  trigger_radius_m: number;
  stone_no: number | null;
  is_finale: boolean;
  region: string;
  scenario_ids: string[]; // 이 노드가 등장하는 시나리오들
}

/** 노드(관광지) 조회. */
@Injectable()
export class MapService {
  constructor(
    @InjectRepository(Scenario) private readonly scenarios: Repository<Scenario>,
  ) {}

  /** 시나리오 payload에서 노드 배열 꺼내기. */
  private nodesOf(scenario: Scenario): Record<string, unknown>[] {
    return (scenario.payload?.node_sequence as Record<string, unknown>[]) ?? [];
  }

  /** 원본 노드 dict → 지도 마커 형태. 좌표 키 이름이 다르므로(map_x/y) 여기서 변환. */
  private toMapNode(raw: Record<string, unknown>, region: string): MapNode {
    return {
      node_id: String(raw.node_id),
      name: (raw.name as string) ?? null,
      kind: String(raw.kind ?? 'spot'),
      lat: typeof raw.map_y === 'number' ? raw.map_y : null,
      lng: typeof raw.map_x === 'number' ? raw.map_x : null,
      trigger_radius_m: Number(raw.trigger_radius_m ?? 100),
      stone_no: (raw.stone_no as number) ?? null,
      is_finale: Boolean(raw.is_finale),
      region,
      scenario_ids: [],
    };
  }

  /**
   * 지역의 관광지 노드 목록(지도 마커).
   *
   * 같은 노드가 여러 시나리오에 나올 수 있으므로 node_id로 합치고,
   * 어느 시나리오들에 속하는지를 scenario_ids로 남긴다.
   */
  async nodesByRegion(regionId: string, limit = 200): Promise<MapNode[]> {
    const scenarios = await this.scenarios.find({ where: { region: regionId } });

    const merged = new Map<string, MapNode>();
    for (const scenario of scenarios) {
      for (const raw of this.nodesOf(scenario)) {
        const id = String(raw.node_id);
        const existing = merged.get(id);
        if (existing) {
          existing.scenario_ids.push(scenario.scenario_id);
          continue;
        }
        const node = this.toMapNode(raw, scenario.region);
        node.scenario_ids.push(scenario.scenario_id);
        merged.set(id, node);
      }
    }
    return [...merged.values()].slice(0, limit);
  }

  /** 관광지 상세 — 노드 원본 전문(미션·NPC·힌트 포함). */
  async nodeDetail(nodeId: string): Promise<Record<string, unknown>> {
    const scenarios = await this.scenarios.find();
    for (const scenario of scenarios) {
      const found = this.nodesOf(scenario).find((n) => String(n.node_id) === nodeId);
      if (found) {
        return { ...found, region: scenario.region, scenario_id: scenario.scenario_id };
      }
    }
    throw new NotFoundException(`노드 ${nodeId}를 찾을 수 없느니라.`);
  }
}

@ApiTags('map')
@Controller()
export class MapController {
  constructor(private readonly map: MapService) {}

  /** 지역 노드 목록 (지도 마커) */
  @Get('regions/:regionId/nodes')
  @ApiQuery({ name: 'limit', required: false })
  nodes(@Param('regionId') regionId: string, @Query('limit') limit?: string) {
    return this.map.nodesByRegion(regionId, limit ? parseInt(limit, 10) : undefined);
  }

  /** 관광지 상세 */
  @Get('nodes/:nodeId')
  detail(@Param('nodeId') nodeId: string) {
    return this.map.nodeDetail(nodeId);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([Scenario])],
  controllers: [MapController],
  providers: [MapService],
})
export class MapModule {}
