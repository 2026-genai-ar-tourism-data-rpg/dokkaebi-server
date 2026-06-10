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
  // 게임서버 → AI 백엔드(dokkaebi-ai) 내부 호출 (compose 네트워크에선 http://ai:8001)
  aiBaseUrl: process.env.AI_BASE_URL ?? 'http://localhost:8001',
});
