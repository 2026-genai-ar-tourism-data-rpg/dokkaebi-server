// ============================================================
// [v1] 지도 모듈 — 관광지 노드 조회(지도 마커·상세)
// pipeline: 게임 백엔드 / 지도 (TourAPI 노드 데이터)
// 구현(요약): GET /regions/:id/nodes, GET /nodes/:id 스텁
// 구현일: 2026-06-10 | 작성: kys (base-pipeline/kys/v1)
// ============================================================
import { Controller, Get, Injectable, Module, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

/** 노드(관광지) 조회. 담당: 이지선(노드 DB/지역 데이터). */
@Injectable()
export class MapService {
  /** 지역의 관광지 노드 목록(지도 마커, 상태별) */
  async nodesByRegion(regionId: string) {
    // TODO(이지선): 노드 DB에서 region 노드 + 진행 상태 결합
    return [];
  }

  /** 관광지 상세 */
  async nodeDetail(nodeId: string) {
    // TODO(이지선): 노드 상세(overview·NPC·조각·trigger_radius 등)
    return { node_id: nodeId };
  }
}

@ApiTags('map')
@Controller()
export class MapController {
  constructor(private readonly map: MapService) {}

  /** 지역 노드 목록 */
  @Get('regions/:regionId/nodes')
  nodes(@Param('regionId') regionId: string) {
    return this.map.nodesByRegion(regionId);
  }

  /** 관광지 상세 */
  @Get('nodes/:nodeId')
  detail(@Param('nodeId') nodeId: string) {
    return this.map.nodeDetail(nodeId);
  }
}

@Module({ controllers: [MapController], providers: [MapService] })
export class MapModule {}
