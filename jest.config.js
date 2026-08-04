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
  // ⚠️ 직렬 실행 필수 — E2E 스위트들이 같은 dokkaebi_test DB에 dropSchema:true로 붙는다.
  //    병렬로 돌면 스키마를 동시에 지우고 만들다가 충돌한다:
  //      QueryFailedError: duplicate key ... "pg_type_typname_nsp_index"
  //    간헐적으로만 터져서 "가끔 빨간 CI"가 되기 쉽다(실측: 같은 커밋이 통과↔10건 실패).
  //    스위트별 DB를 나누는 방법도 있지만, 스위트가 3개뿐이라 직렬이 더 단순하다.
  maxWorkers: 1,
  // 스위트별 테스트 DB를 미리 만든다(test/setup-databases.js 주석 참고).
  globalSetup: '<rootDir>/test/setup-databases.js',
};
