// ============================================================
// [v1] Jest globalSetup — 스위트별 테스트 DB 준비
// pipeline: 게임 백엔드 / 테스트 인프라
// 구현(요약): E2E 스위트가 각자 자기 DB를 쓰도록 미리 생성한다.
//            하나의 DB를 공유하면 dropSchema/synchronize가 서로를 밟아
//            "가끔 빨간 CI"가 된다(실측: pg_type_typname_nsp_index 중복 키,
//            같은 커밋이 통과↔10건 실패를 오감).
//            maxWorkers=1로 직렬화해도 커넥션 정리 타이밍 때문에 완전히 없어지지 않아
//            DB 자체를 분리한다 — 그러면 스위트가 서로를 볼 수 없다.
// 구현일: 2026-08-04 | 작성: kys (test-serialize/kys/v1)
// ============================================================
const { Client } = require('pg');

/** 스위트별 DB 이름 — 각 spec이 TEST_DB_SUFFIX로 골라 쓴다. */
const SUFFIXES = ['quest', 'core', 'upstream'];

/** 관리 접속(생성 대상 DB에 붙을 수 없으므로 기본 DB로 접속). */
function adminUrl() {
  const base =
    process.env.TEST_DATABASE_URL ??
    'postgresql://dokkaebi:dokkaebi@localhost:5432/dokkaebi_test';
  return base.replace(/\/[^/]*$/, '/postgres');
}

/** 베이스 DB 이름(접미사를 붙일 대상). */
function baseName() {
  const base =
    process.env.TEST_DATABASE_URL ??
    'postgresql://dokkaebi:dokkaebi@localhost:5432/dokkaebi_test';
  return base.slice(base.lastIndexOf('/') + 1);
}

module.exports = async () => {
  const client = new Client({ connectionString: adminUrl() });
  try {
    await client.connect();
  } catch (e) {
    // DB가 없으면 테스트가 각자 이유를 밝히며 실패한다 — 여기서 막지 않는다.
    console.warn(`⚠️  테스트 DB 준비 생략(관리 접속 실패): ${e.message}`);
    return;
  }
  for (const suffix of SUFFIXES) {
    const name = `${baseName()}_${suffix}`;
    const { rowCount } = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [name],
    );
    // CREATE DATABASE는 파라미터 바인딩이 안 되지만, 이름은 코드 상수라 주입 위험이 없다.
    if (rowCount === 0) await client.query(`CREATE DATABASE "${name}"`);
  }
  await client.end();
};
