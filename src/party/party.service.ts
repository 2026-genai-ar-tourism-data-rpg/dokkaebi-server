// ============================================================
// [v1] 파티 서비스 — 멀티 파티 로직 (골격)
// pipeline: 게임 백엔드 / 파티 (멀티 협력·경쟁)
// 구현(요약): 파티 생성/입장 시그니처 + 더미. 룸 상태·조각 동기화는 Redis(추후)
// 구현일: 2026-06-10 | 작성: kys (base-pipeline/kys/v1)
// ============================================================
import { Injectable } from '@nestjs/common';

@Injectable()
export class PartyService {
  /** 파티 생성(초대 코드 발급, 최대 4인).
   *  담당: 정찬희 / 룸 상태는 Redis. */
  async create() {
    // TODO(정찬희): party_id·code 생성, Redis 룸 초기화
    return { party_id: 'p_demo', code: 'ABCD', region_id: 'jongno', members: [], mode: 'coop' };
  }

  /** 초대 코드로 입장. */
  async join(code: string) {
    // TODO(정찬희): 코드 검증 + 멤버 추가(최대 4) + Redis 갱신
    return { party_id: 'p_demo', code, region_id: 'jongno', members: [], mode: 'coop' };
  }
}
