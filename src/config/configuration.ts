// ============================================================
// [v2] 설정(config) — env 단일 소스
// pipeline: 공통 인프라 (전 모듈 참조)
// 구현(요약): PORT/DB/Redis/AI URL + 게임 룰 상수(GPS 판정·스푸핑·보상) 로드.
//            ConfigModule.forRoot(load)에 주입. 매직넘버는 전부 여기로 모은다.
// 구현일: 2026-06-10 (게임 룰 상수 추가: 2026-08-02) | 작성: kys (base-pipeline/kys/v1)
// ============================================================

/** env -> 타입 설정 객체. 매직넘버·URL은 전부 여기로. */
export default () => ({
  port: parseInt(process.env.PORT ?? '8000', 10),
  databaseUrl:
    process.env.DATABASE_URL ?? 'postgresql://dokkaebi:dokkaebi@localhost:5432/dokkaebi',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  // 스키마 자동 동기화. 로컬/개발 전용 — 배포는 migration 사용(DB_SYNC=false).
  dbSync: (process.env.DB_SYNC ?? 'true') === 'true',
  // 게스트/토큰 서명 비밀키 (배포 시 반드시 env로 교체)
  authSecret: process.env.AUTH_SECRET ?? 'dev-secret-change-me',
  // 토큰 유효기간(초). 기본 30일 — 게스트가 여행 중 재로그인하지 않도록 넉넉히.
  authTokenTtlSec: parseInt(process.env.AUTH_TOKEN_TTL_SEC ?? '2592000', 10),
  // 게임서버 → AI 백엔드(dokkaebi-ai) 내부 호출 (compose 네트워크에선 http://ai:8001)
  // ⚠️ localhost 대신 127.0.0.1 — Node가 localhost를 IPv6(::1)로 풀어 uvicorn(IPv4)과
  //    어긋나 AggregateError(ECONNREFUSED)가 나는 것 방지.
  aiBaseUrl: process.env.AI_BASE_URL ?? 'http://127.0.0.1:8001',

  // ── 게임 룰 (퀘스트 판정·보상) ──────────────────────────────
  quest: {
    // 노드에 trigger_radius_m이 없을 때 쓰는 기본 반경(m). 기획: 도심50/개방100/자연150.
    triggerRadiusDefaultM: parseInt(process.env.QUEST_TRIGGER_RADIUS_M ?? '100', 10),
    // GPS 정확도가 이보다 나쁘면(오차 반경 큼) 판정 보류 — 실내·터널 오인증 방지.
    gpsAccuracyMaxM: parseInt(process.env.QUEST_GPS_ACCURACY_MAX_M ?? '100', 10),
    // 스푸핑 방어: 직전 위치 대비 허용 이동속도(m/s). 30m/s ≈ 108km/h(차량 상한).
    maxSpeedMps: parseFloat(process.env.QUEST_MAX_SPEED_MPS ?? '30'),
    // 이동속도 계산을 위한 직전 위치 보관 시간(초).
    lastFixTtlSec: parseInt(process.env.QUEST_LAST_FIX_TTL_SEC ?? '3600', 10),
    // 속도 검사를 건너뛰는 최소 간격(초) — 너무 촘촘한 fix는 GPS 오차로 과속 오판.
    speedCheckMinIntervalSec: parseFloat(process.env.QUEST_SPEED_MIN_INTERVAL_SEC ?? '3'),
    // 조각 중복 획득 방지용 Redis 선점 락 TTL(초).
    fragmentLockTtlSec: parseInt(process.env.QUEST_FRAGMENT_LOCK_TTL_SEC ?? '10', 10),
    // 보상: 조각 1개당 경험치 / 시나리오 완주(피날레) 보너스.
    expPerFragment: parseInt(process.env.QUEST_EXP_PER_FRAGMENT ?? '100', 10),
    expFinaleBonus: parseInt(process.env.QUEST_EXP_FINALE_BONUS ?? '500', 10),
  },
});
