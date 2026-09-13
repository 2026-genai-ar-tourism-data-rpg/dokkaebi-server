// ============================================================
// [v1] AI 백엔드(dokkaebi-ai) 프록시 클라이언트
// pipeline: 게임 백엔드 → AI 백엔드 내부 호출 (server ↔ ai)
// 구현(요약): POST {AI_BASE_URL}/v1/dialogue · /v1/scenarios 호출
// 구현일: 2026-06-10 (시나리오 추가: 2026-06-18) | 작성: kys
// ------------------------------------------------------------
// [v2] 장소 검색에서 후보 수(top_n=8)를 박아 보내지 않는다.
// 구현(요약): dokkaebi-ai가 검색 기본 후보 수를 8 → 30(scenario_search_top_n)으로 올렸는데,
//            여기서 매번 top_n=8을 명시해 보내 AI 기본값이 적용되지 않았다
//            (AI는 `top_n or 설정값`이라 값을 받으면 그 값을 쓴다). 관광공사 이름 검색은 위치를
//            모르기 때문에 "공원·카페"처럼 흔한 검색어는 전국에서 8건만 받아오고, 앱이 그중
//            반경 안만 남기므로 근처 장소가 후보 8건 밖으로 밀려 아예 안 보였다.
//            → top_n을 보내지 않아 AI 설정값을 따르게 한다(개수의 기준은 AI 한 곳에 둔다).
// 구현일: 2026-09-13 | 작성: ljs (search-top-n/ljs/v1)
// ============================================================
import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

/** dokkaebi-ai 호출 결과 (DialogueResponse) */
export interface DialogueResult {
  response: string;
  cache_hit: boolean;
}

/** 관광지 검색 후보 (SearchCandidate) */
export interface SearchCandidate {
  content_id: string;
  name?: string;
  addr?: string;
  lat?: number;
  lng?: number;
}

/** 내 주변 POI 1개 (NearbyPlace) — 좌표 기반, 코스 생성 전 단계 */
export interface NearbyPlace {
  node_id: string;
  name?: string;
  addr?: string;
  lat?: number;
  lng?: number;
  dist_m?: number;
  /** historic | museum | artwork | viewpoint | park | attraction | other */
  category?: string;
  /** 장소 설명 한 줄 요약 (TourAPI overview 앞부분). 없으면 undefined. */
  summary?: string;
}

/** 프롤로그 대본 한 줄 (PrologueLineSchema). speaker=beat면 text 없이 연출 트리거만. */
export interface PrologueLine {
  speaker: string;               // narration | npc | player | beat
  text: string;
  beat?: string | null;
}

/** dokkaebi-ai 시나리오 생성 결과 (ScenarioGenResponse와 1:1 대응) */
export interface ScenarioResult {
  scenario_id: string;
  title: string;
  region: string;
  type: string;
  node_sequence: Record<string, unknown>[];
  stone_total?: number | null;              // 기억석 조각 총수(식음 노드 제외)
  anchor_node_id: string | null;
  is_public: boolean;
  created_by?: string | null;
  budget?: number | null;
  transport?: string;                       // 반경 산출 근거(ai#40)
  wishlist_content_ids?: string[];          // 위시 앵커 content_id(ai#40)
  is_branching?: boolean;                   // 갈림길 포함 여부(ai#24)
  route_tree?: Record<string, unknown> | null;  // 분기 그래프. 선형이면 null
  /** 코스 오프닝 프롤로그 대본(화자 순서·연출 비트 고정, 대사만 region·첫 장소로 생성). */
  prologue?: PrologueLine[];
}

@Injectable()
export class AiClient {
  private readonly logger = new Logger(AiClient.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  /** NPC 대화 생성 요청을 AI 백엔드로 위임. */
  async dialogue(
    nodeId: string,
    stage: string,
    playerState: Record<string, unknown> = {},
    nodeName?: string,
  ): Promise<DialogueResult> {
    const url = `${this.config.get<string>('aiBaseUrl')}/v1/dialogue`;
    // node_name을 빼면 AI 프롬프트의 장소명·페르소나 이름이 node_id가 된다.
    const body = {
      node_id: nodeId,
      stage,
      player_state: playerState,
      ...(nodeName ? { node_name: nodeName } : {}),
    };
    const { data } = await firstValueFrom(this.http.post<DialogueResult>(url, body));
    return data;
  }

  /** 시나리오 생성 요청을 AI 백엔드로 위임(앱 입력 그대로 전달). */
  async generateScenario(body: Record<string, unknown>): Promise<ScenarioResult> {
    const url = `${this.config.get<string>('aiBaseUrl')}/v1/scenarios`;
    const { data } = await firstValueFrom(this.http.post<ScenarioResult>(url, body));
    return data;
  }

  /** 분기 대화 한 턴(선택지·연계 인벤토리)을 AI 백엔드로 위임. */
  async dialogueTurn(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const url = `${this.config.get<string>('aiBaseUrl')}/v1/dialogue/turn`;
    const { data } = await firstValueFrom(
      this.http.post<Record<string, unknown>>(url, body),
    );
    return data;
  }

  /**
   * 관광지 이름 검색(앵커 자동완성)을 AI 백엔드로 위임.
   * 후보 수(top_n)는 보내지 않는다 — AI 설정(scenario_search_top_n)이 기준이다.
   */
  async searchAttractions(keyword: string): Promise<SearchCandidate[]> {
    const url = `${this.config.get<string>('aiBaseUrl')}/v1/search`;
    const { data } = await firstValueFrom(
      this.http.get<{ candidates: SearchCandidate[] }>(url, {
        params: { keyword },
      }),
    );
    return data.candidates;
  }

  /** 내 주변 POI 목록(거리순)을 AI 백엔드로 위임 — "내 주변 탐험" 탭. */
  async nearbyPlaces(
    lat: number,
    lng: number,
    radiusM = 2000,
    topN = 20,
  ): Promise<NearbyPlace[]> {
    const url = `${this.config.get<string>('aiBaseUrl')}/v1/nearby`;
    const { data } = await firstValueFrom(
      this.http.get<{ places: NearbyPlace[] }>(url, {
        params: { lat, lng, radius_m: radiusM, top_n: topN },
      }),
    );
    return data.places;
  }
}
