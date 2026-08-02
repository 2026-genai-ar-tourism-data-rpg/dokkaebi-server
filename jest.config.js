// [v1] Jest 설정 — 서버 단위·E2E 테스트 (2026-08-02, kys)
// E2E는 로컬 Postgres(dokkaebi_test)를 쓴다. sqlite로 대체하지 않는 이유:
// 드라이버 방언 차이(예: timestamp 매핑)를 sqlite가 숨겨서 Postgres에서만 깨진 적이 있다.
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  testEnvironment: 'node',
  testTimeout: 30000,
};
