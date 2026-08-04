// ============================================================
// [v1] 지리 계산 단위테스트 — 거리·반경·이동속도 (네트워크·DB 0)
// pipeline: 게임 백엔드 / 공통 (테스트)
// 구현(요약): 하버사인 실측 대조, 반경 경계, GPS 오차 보정, 스푸핑 속도 계산.
// 구현일: 2026-08-02 | 작성: kys (quest-api/kys/v1) · 이슈 #8
// ============================================================
import { haversineM, isWithinRadius, speedMps } from './geo';

// 실측 기준점 — 경복궁 ↔ 창덕궁(약 1.5km), 경복궁 ↔ 부산시청(약 325km)
const GYEONGBOK = { lat: 37.5796, lng: 126.977 };
const CHANGDEOK = { lat: 37.5794, lng: 126.9910 };
const BUSAN = { lat: 35.1798, lng: 129.0750 };

describe('haversineM', () => {
  it('같은 점은 거리 0', () => {
    expect(haversineM(GYEONGBOK, GYEONGBOK)).toBe(0);
  });

  it('경복궁↔창덕궁 ≈ 1.2km (오차 10% 이내)', () => {
    const d = haversineM(GYEONGBOK, CHANGDEOK);
    expect(d).toBeGreaterThan(1100);
    expect(d).toBeLessThan(1400);
  });

  it('경복궁↔부산시청 ≈ 325km (오차 5% 이내)', () => {
    const d = haversineM(GYEONGBOK, BUSAN);
    expect(d).toBeGreaterThan(309_000);
    expect(d).toBeLessThan(341_000);
  });

  it('대칭이다 — a→b와 b→a가 같다', () => {
    expect(haversineM(GYEONGBOK, BUSAN)).toBeCloseTo(haversineM(BUSAN, GYEONGBOK), 6);
  });
});

describe('isWithinRadius', () => {
  it('반경 안이면 within=true', () => {
    const r = isWithinRadius(GYEONGBOK, GYEONGBOK, 100);
    expect(r.within).toBe(true);
    expect(r.distanceM).toBe(0);
  });

  it('[회귀 #8] 8km 밖은 반드시 거절 — 예전엔 무조건 통과했다', () => {
    const far = { lat: 37.63, lng: 127.05 };
    const r = isWithinRadius(far, GYEONGBOK, 100);
    expect(r.within).toBe(false);
    expect(r.distanceM).toBeGreaterThan(7000);
  });

  it('GPS 오차 반경만큼은 관대하게 본다', () => {
    // 노드에서 약 1.2km 떨어진 지점 + 반경 100m → 기본은 거절
    expect(isWithinRadius(CHANGDEOK, GYEONGBOK, 100).within).toBe(false);
    // 그런데 단말 오차가 2km라고 보고하면 통과(정확도 나쁜 기기 구제)
    expect(isWithinRadius(CHANGDEOK, GYEONGBOK, 100, 2000).within).toBe(true);
  });

  it('음수 정확도는 무시한다(관대해지지 않는다)', () => {
    expect(isWithinRadius(CHANGDEOK, GYEONGBOK, 100, -99999).within).toBe(false);
  });
});

describe('speedMps', () => {
  it('걸어서 100m/60s ≈ 1.67m/s', () => {
    const near = { lat: 37.58050, lng: 126.977 }; // 경복궁에서 북쪽 약 100m
    const v = speedMps(GYEONGBOK, near, 60);
    expect(v).not.toBeNull();
    expect(v as number).toBeGreaterThan(1);
    expect(v as number).toBeLessThan(3);
  });

  it('[회귀 #8] 순간이동은 비현실적 속도로 드러난다', () => {
    // 서울→부산 10초 = 32km/s. 차량 상한 30m/s를 압도적으로 초과.
    const v = speedMps(GYEONGBOK, BUSAN, 10) as number;
    expect(v).toBeGreaterThan(30);
  });

  it('시간 간격이 0 이하면 계산 보류(null)', () => {
    expect(speedMps(GYEONGBOK, BUSAN, 0)).toBeNull();
    expect(speedMps(GYEONGBOK, BUSAN, -5)).toBeNull();
  });
});
