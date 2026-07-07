// ============================================================
// [v1] 퀘스트 서비스 — 게임 루프 로직 (골격)
// pipeline: 게임 백엔드 / 퀘스트 (상태머신 ARRIVED→REWARDED)
// 구현(요약): GPS인증·조각획득·완료 시그니처 + 더미 반환. 실제 로직 TODO
// 구현일: 2026-06-10 | 작성: kys (base-pipeline/kys/v1)
// ============================================================
import { Injectable } from '@nestjs/common';

@Injectable()
export class QuestService {
  /** GPS 반경 인증 (도심50/개방100/자연150) → [GPS_VERIFIED] 판정.
   *  담당: 거리계산·스푸핑 = 정찬희 / 노드 좌표 조회 = 이지선. */
  async verifyLocation(questId: string, lat: number, lng: number, accuracyM?: number) {
    // TODO(이지선): 노드 좌표·trigger_radius 조회 (DB)
    // TODO(정찬희): 거리 계산 + 스푸핑(이동속도/정확도) 검증, 방문 기록
    return {
      verified: true,
      distance_m: 0,
      state: 'GPS_VERIFIED',
      npc_spawned: true,
      reason: null,
    };
  }

  /** AR 기억석 조각 획득 [QUEST_ACTIVE].
   *  담당: 정찬희(게임 로직) / 멀티 동시성(중복방지)은 Redis 원자처리(추후). */
  async collectFragment(questId: string, fragmentId: string) {
    // TODO(정찬희): Redis 원자 선점(중복 방지) + 진행도 갱신
    return {
      fragment_id: fragmentId,
      collected: true,
      already_collected: false,
      progress: 1,
      required: 5,
    };
  }

  /** 퀘스트 완료·보상 [QUEST_COMPLETE → REWARDED].
   *  담당: 정찬희(완료검증·보상) — 보상 지급은 DB 트랜잭션. */
  async complete(questId: string) {
    // TODO(정찬희): success_condition 검증 → 보상 트랜잭션 → 복원도 갱신
    return {
      state: 'REWARDED',
      exp_gained: 100,
      memory_stone_fragment_id: 'jongno_stone_1of5',
      rare_relic_id: null,
      dex_entry: null,
      titles: [],
      region_restored: false,
      next_node_id: null,
    };
  }
}
