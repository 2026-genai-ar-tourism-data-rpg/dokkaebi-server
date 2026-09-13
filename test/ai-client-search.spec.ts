// ============================================================
// [v1] 장소 검색 프록시 — 서버가 AI의 기본 후보 수를 덮지 않는지
// pipeline: 게임 백엔드 → AI 백엔드 (테스트)
// 구현(요약): AiClient.searchAttractions가 AI로 보내는 쿼리에 top_n을 넣지 않는지 확인한다.
//            8을 박아 보내면 AI 기본값(30)이 덮여, 흔한 검색어에서 반경 안 장소가 후보 8건 밖으로
//            밀려 앱에 안 보였다. DB·앱 모듈 없이 AiClient만 가짜 HttpService로 검증한다.
// 구현일: 2026-09-13 | 작성: ljs (search-top-n/ljs/v1)
// ============================================================
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of } from 'rxjs';

import { AiClient, SearchCandidate } from '../src/ai/ai.client';

/** 받은 요청을 기록하고 정해진 후보를 돌려주는 가짜 HttpService. */
function fakeHttp(candidates: SearchCandidate[]) {
  const calls: { url: string; params: Record<string, unknown> }[] = [];
  const http = {
    get: (url: string, cfg: { params: Record<string, unknown> }) => {
      calls.push({ url, params: cfg.params });
      return of({ data: { candidates } });
    },
  } as unknown as HttpService;
  return { http, calls };
}

const config = { get: () => 'http://ai.test' } as unknown as ConfigService;

describe('AiClient.searchAttractions', () => {
  it('후보 수(top_n)를 보내지 않아 AI 설정값을 따른다', async () => {
    const { http, calls } = fakeHttp([]);

    await new AiClient(http, config).searchAttractions('공원');

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('http://ai.test/v1/search');
    expect(calls[0].params).toEqual({ keyword: '공원' });
    expect(calls[0].params).not.toHaveProperty('top_n');
  });

  it('AI가 준 후보를 그대로 돌려준다', async () => {
    const candidates: SearchCandidate[] = [
      { content_id: '126510', name: '종묘', lat: 37.5741, lng: 126.9942 },
    ];
    const { http } = fakeHttp(candidates);

    await expect(new AiClient(http, config).searchAttractions('종묘')).resolves.toEqual(candidates);
  });
});
