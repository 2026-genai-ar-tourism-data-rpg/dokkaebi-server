// ============================================================
// [v1] 설정(config) — env 단일 소스
// pipeline: 공통 인프라 (전 모듈 참조)
// 구현(요약): PORT/DB/Redis/AI URL 로드. ConfigModule.forRoot(load)에 주입
// 구현일: 2026-06-10 | 작성: kys (base-pipeline/kys/v1)
// ============================================================

/** env -> 타입 설정 객체. 매직넘버·URL은 전부 여기로. */
export default () => ({
  port: parseInt(process.env.PORT ?? '8000', 10),
  databaseUrl:
    process.env.DATABASE_URL ?? 'postgresql://dokkaebi:dokkaebi@localhost:5432/dokkaebi',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  // 게스트/토큰 서명 비밀키 (배포 시 반드시 env로 교체)
  authSecret: process.env.AUTH_SECRET ?? 'dev-secret-change-me',
  // 게임서버 → AI 백엔드(dokkaebi-ai) 내부 호출 (compose 네트워크에선 http://ai:8001)
  // ⚠️ localhost 대신 127.0.0.1 — Node가 localhost를 IPv6(::1)로 풀어 uvicorn(IPv4)과
  //    어긋나 AggregateError(ECONNREFUSED)가 나는 것 방지.
  aiBaseUrl: process.env.AI_BASE_URL ?? 'http://127.0.0.1:8001',
});
