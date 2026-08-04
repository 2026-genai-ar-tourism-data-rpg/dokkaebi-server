// ============================================================
// [v1] 지리 계산 유틸 — 하버사인 거리 · 반경 판정 · 이동속도
// pipeline: 게임 백엔드 / 공통 (퀘스트 GPS 판정의 순수 계산부)
// 구현(요약): 좌표 2점 거리(m), 반경 내 판정, 두 fix 사이 이동속도(m/s).
//            순수 함수라 DB·네트워크 없이 단위 테스트 가능(결정론).
// 구현일: 2026-08-02 | 작성: kys (quest-api/kys/v1) · 이슈 #8
// ============================================================

/** 지구 평균 반지름(m) — 하버사인 상수. */
const EARTH_RADIUS_M = 6371000;

/** 위경도 좌표 한 점. */
export interface LatLng {
  lat: number;
  lng: number;
}

/** 도(degree) → 라디안. */
function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * 두 좌표 사이 대권거리(m). 하버사인 공식.
 * 수 km 규모에서 오차 0.5% 이내라 퀘스트 반경 판정(수십~수백 m)에 충분하다.
 */
export function haversineM(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

/**
 * 플레이어가 노드 반경 안에 있는지 판정.
 * GPS 정확도(accuracyM)는 오차 반경이므로 그만큼 관대하게 봐준다 —
 * 정확도가 나쁜 기기에서 실제로 도착했는데 튕기는 것을 막기 위함.
 */
export function isWithinRadius(
  player: LatLng,
  node: LatLng,
  radiusM: number,
  accuracyM = 0,
): { within: boolean; distanceM: number } {
  const distanceM = haversineM(player, node);
  return { within: distanceM <= radiusM + Math.max(0, accuracyM), distanceM };
}

/**
 * 두 위치 fix 사이의 평균 이동속도(m/s). 스푸핑(순간이동) 판정용.
 * 시간 간격이 0 이하면 계산 불가 → null(판정 보류).
 */
export function speedMps(
  from: LatLng,
  to: LatLng,
  elapsedSec: number,
): number | null {
  if (!Number.isFinite(elapsedSec) || elapsedSec <= 0) return null;
  return haversineM(from, to) / elapsedSec;
}
