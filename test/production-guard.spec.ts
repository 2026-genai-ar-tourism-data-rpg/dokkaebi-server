// ============================================================
// [v1] 배포 가드 단위테스트 — 위험한 개발 기본값이 운영에 나가는지
// pipeline: 게임 백엔드 / 테스트 (DB·네트워크 0)
// 구현(요약): production일 때만 검사하고, 개발에서는 아무것도 막지 않는지 확인.
// 구현일: 2026-08-04 | 작성: kys
// ============================================================
import { assertProductionSafe, fatalIssues } from '../src/config/production-guard';

const SAFE = {
  isProduction: true,
  authSecret: 'a-long-random-production-secret-value',
  dbSync: false,
  databaseUrl: 'postgresql://dokkaebi:S7r0ngPw@db.internal:5432/dokkaebi',
};

describe('배포 가드', () => {
  it('개발 모드에서는 아무것도 막지 않는다', () => {
    expect(
      fatalIssues({
        isProduction: false,
        authSecret: 'dev-secret-change-me',
        dbSync: true,
        databaseUrl: 'postgresql://dokkaebi:dokkaebi@localhost:5432/dokkaebi',
      }),
    ).toEqual([]);
  });

  it('안전한 운영 설정은 통과한다', () => {
    expect(fatalIssues(SAFE)).toEqual([]);
    expect(() => assertProductionSafe(SAFE)).not.toThrow();
  });

  it('[회귀] 개발용 AUTH_SECRET으로는 운영 기동을 막는다', () => {
    const issues = fatalIssues({ ...SAFE, authSecret: 'dev-secret-change-me' });
    expect(issues.join()).toContain('AUTH_SECRET');
    expect(() => assertProductionSafe({ ...SAFE, authSecret: 'dev-secret-change-me' }))
      .toThrow(/안전하지 않아/);
  });

  it('AUTH_SECRET이 비어도 막는다', () => {
    expect(fatalIssues({ ...SAFE, authSecret: '' }).join()).toContain('AUTH_SECRET');
  });

  it('[회귀] DB_SYNC=true로는 운영 기동을 막는다 — 스키마가 자동 변경된다', () => {
    expect(fatalIssues({ ...SAFE, dbSync: true }).join()).toContain('DB_SYNC');
  });

  it('DATABASE_URL이 로컬이면 막는다', () => {
    expect(
      fatalIssues({ ...SAFE, databaseUrl: 'postgresql://u:p@localhost:5432/d' }).join(),
    ).toContain('로컬');
  });

  it('개발용 기본 비밀번호를 쓰면 막는다', () => {
    expect(
      fatalIssues({ ...SAFE, databaseUrl: 'postgresql://dokkaebi:dokkaebi@db:5432/d' }).join(),
    ).toContain('비밀번호');
  });

  it('문제가 여러 개면 전부 보고한다 — 하나씩 고치며 재기동하지 않게', () => {
    const issues = fatalIssues({
      isProduction: true,
      authSecret: 'dev-secret-change-me',
      dbSync: true,
      databaseUrl: 'postgresql://dokkaebi:dokkaebi@localhost:5432/dokkaebi',
    });
    expect(issues.length).toBeGreaterThanOrEqual(4);
  });
});
