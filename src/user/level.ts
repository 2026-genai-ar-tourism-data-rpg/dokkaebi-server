// ============================================================
// [v1] 레벨·탐사 등급 — 굿 엔딩으로 끝낸 코스 수로 정한다.
// pipeline: 게임 백엔드 / 유저 (성장)
// 구현(요약): 다음 레벨까지 필요한 굿 엔딩이 1·2·3…으로 늘어난다(누적 1·3·6·10… → Lv.2·3·4·5).
//            같은 코스를 여러 번 굿 엔딩으로 끝내도 한 번만 센다(countGoodEndings).
//            예전엔 경험치 500마다 1레벨이었는데 앱 어디에도 보이지 않았다.
// 구현일: 2026-09-19 | 작성: ljs (ending-level/ljs/v1)
// ============================================================

/** 엔딩 갈래 — 앱이 피날레 완료 때 보낸다. */
export type Ending = 'good' | 'normal';

/**
 * 탐사 등급 — 레벨 구간별 호칭. 위에서부터 처음 걸리는 것을 쓴다(내림차순 유지 필수).
 * Lv.1~2 초급 · 3~5 중급 · 6~10 숙련 · 11~15 기억의 수호자 · 16~ 전설의 수호자.
 */
const TIERS: ReadonlyArray<{ minLevel: number; name: string }> = [
  { minLevel: 16, name: '전설의 수호자' },
  { minLevel: 11, name: '기억의 수호자' },
  { minLevel: 6, name: '숙련 탐사자' },
  { minLevel: 3, name: '중급 탐사자' },
  { minLevel: 1, name: '초급 탐사자' },
];

/** 이 레벨이 되는 데 필요한 누적 굿 엔딩 수 — Lv.1은 0, Lv.2는 1, Lv.3은 3, Lv.4는 6… */
export function goodEndingsForLevel(level: number): number {
  const n = Math.max(1, Math.floor(level));
  return ((n - 1) * n) / 2;
}

/** 누적 굿 엔딩 수 → 레벨(1-base). */
export function levelOfGoodEndings(goodEndings: number): number {
  let level = 1;
  while (goodEndingsForLevel(level + 1) <= goodEndings) level += 1;
  return level;
}

/** 레벨 → 탐사 등급 호칭. */
export function tierOf(level: number): string {
  return TIERS.find((t) => level >= t.minLevel)?.name ?? TIERS[TIERS.length - 1].name;
}

/** 굿 엔딩으로 끝낸 서로 다른 코스 수 — 같은 코스를 다시 굿 엔딩으로 끝내도 한 번. */
export function countGoodEndings(runs: ReadonlyArray<{ scenario_id: string; ending: string | null }>): number {
  return new Set(runs.filter((r) => r.ending === 'good').map((r) => r.scenario_id)).size;
}
