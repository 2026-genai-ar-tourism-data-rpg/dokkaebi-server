// ============================================================
// [v1] AI 백엔드(dokkaebi-ai) 프록시 클라이언트
// pipeline: 게임 백엔드 → AI 백엔드 내부 호출 (server ↔ ai)
// 구현(요약): POST {AI_BASE_URL}/v1/dialogue 호출해 NPC 대사 받기
// 구현일: 2026-06-10 | 작성: kys (base-pipeline/kys/v1)
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
}
