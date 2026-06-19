// ============================================================
// [v1] AI 백엔드(dokkaebi-ai) 프록시 클라이언트
// pipeline: 게임 백엔드 → AI 백엔드 내부 호출 (server ↔ ai)
// 구현(요약): POST {AI_BASE_URL}/v1/dialogue · /v1/scenarios 호출
// 구현일: 2026-06-10 (시나리오 추가: 2026-06-18) | 작성: kys
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

/** dokkaebi-ai 시나리오 생성 결과 (ScenarioGenResponse) */
export interface ScenarioResult {
  scenario_id: string;
  title: string;
  region: string;
  type: string;
  node_sequence: Record<string, unknown>[];
  anchor_node_id: string | null;
  is_public: boolean;
  created_by?: string | null;
  budget?: number | null;
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
  ): Promise<DialogueResult> {
    const url = `${this.config.get<string>('aiBaseUrl')}/v1/dialogue`;
    const body = { node_id: nodeId, stage, player_state: playerState };
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

  /** 관광지 이름 검색(앵커 자동완성)을 AI 백엔드로 위임. */
  async searchAttractions(keyword: string, topN = 8): Promise<SearchCandidate[]> {
    const url = `${this.config.get<string>('aiBaseUrl')}/v1/search`;
    const { data } = await firstValueFrom(
      this.http.get<{ candidates: SearchCandidate[] }>(url, {
        params: { keyword, top_n: topN },
      }),
    );
    return data.candidates;
  }
}
