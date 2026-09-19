// ============================================================
// [v1] 레벨·탐사 등급 계산 단위 테스트 (src/user/level.ts).
// pipeline: 게임 백엔드 / 테스트
// 구현(요약): 누적 굿 엔딩 1·3·6·10… → Lv.2·3·4·5, 등급 구간 경계, 같은 코스·노멀 엔딩 제외.
// 구현일: 2026-09-19 | 작성: ljs (ending-level/ljs/v1)
// ============================================================
import { countGoodEndings, goodEndingsForLevel, levelOfGoodEndings, tierOf } from '../src/user/level';

describe('레벨 — 굿 엔딩 코스 수', () => {
  it('다음 레벨까지 필요한 굿 엔딩이 1·2·3…으로 늘어난다', () => {
    expect([0, 1, 2, 3, 5, 6, 10, 15, 55].map(levelOfGoodEndings)).toEqual([1, 2, 2, 3, 3, 4, 5, 6, 11]);
    expect([1, 2, 3, 4, 5].map(goodEndingsForLevel)).toEqual([0, 1, 3, 6, 10]);
  });

  it('음수·소수 입력에도 Lv.1 아래로 내려가지 않는다', () => {
    expect(levelOfGoodEndings(-3)).toBe(1);
    expect(goodEndingsForLevel(0)).toBe(0);
  });

  it('등급은 Lv.1~2 초급 · 3~5 중급 · 6~10 숙련 · 11~15 기억의 수호자 · 16~ 전설의 수호자', () => {
    expect([1, 2, 3, 5, 6, 10, 11, 15, 16, 40].map(tierOf)).toEqual([
      '초급 탐사자', '초급 탐사자', '중급 탐사자', '중급 탐사자', '숙련 탐사자',
      '숙련 탐사자', '기억의 수호자', '기억의 수호자', '전설의 수호자', '전설의 수호자',
    ]);
  });

  it('같은 코스를 여러 번 굿 엔딩으로 끝내도, 노멀·미기록 엔딩은 세지 않는다', () => {
    expect(countGoodEndings([
      { scenario_id: 'a', ending: 'good' },
      { scenario_id: 'a', ending: 'good' },
      { scenario_id: 'b', ending: 'normal' },
      { scenario_id: 'c', ending: null },
      { scenario_id: 'd', ending: 'good' },
    ])).toBe(2);
    expect(countGoodEndings([])).toBe(0);
  });
});
