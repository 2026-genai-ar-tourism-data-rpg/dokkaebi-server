// ============================================================
// [v1] 배포 가드 — 개발용 설정이 운영에 나가는 것을 기동 시점에 막는다
// pipeline: 게임 백엔드 / 부트스트랩 (안전장치)
// 구현(요약): NODE_ENV=production일 때 위험한 기본값을 검사해 '조용히 뜨는' 대신
//            기동을 거부한다. 개발 기본값은 편의를 위해 느슨한데, 그대로 배포되면
//            토큰 위조·스키마 파괴·문서 노출로 이어진다.
//            로컬(개발)에서는 아무것도 막지 않는다 — 경고만 남긴다.
// 구현일: 2026-08-04 | 작성: kys (game-loop-wiring 대응)
// ============================================================
import { Logger } from '@nestjs/common';

/** 개발 편의를 위한 기본값들 — 운영에 그대로 나가면 안 되는 것 목록. */
const DEV_AUTH_SECRET = 'dev-secret-change-me';

export interface GuardInput {
  isProduction: boolean;
  authSecret: string;
  dbSync: boolean;
  databaseUrl: string;
}

/** 운영에서 치명적인 설정(기동 거부 대상). */
export function fatalIssues(cfg: GuardInput): string[] {
  if (!cfg.isProduction) return [];
  const issues: string[] = [];

  if (!cfg.authSecret || cfg.authSecret === DEV_AUTH_SECRET) {
    issues.push(
      'AUTH_SECRET이 개발 기본값입니다. 토큰을 누구나 위조할 수 있습니다. ' +
        '충분히 긴 임의 문자열로 교체하세요.',
    );
  }
  if (cfg.dbSync) {
    issues.push(
      'DB_SYNC=true 입니다. TypeORM이 운영 스키마를 자동 변경/삭제할 수 있습니다. ' +
        'DB_SYNC=false로 두고 migration을 쓰세요.',
    );
  }
  if (cfg.databaseUrl.includes('localhost') || cfg.databaseUrl.includes('127.0.0.1')) {
    issues.push('DATABASE_URL이 로컬을 가리킵니다. 운영 DB 주소로 교체하세요.');
  }
  if (cfg.databaseUrl.includes(':dokkaebi@')) {
    issues.push('DATABASE_URL이 개발용 기본 비밀번호를 씁니다.');
  }
  return issues;
}

/**
 * 기동 전 검사. 운영에서 치명적 설정이 있으면 예외로 기동을 막는다.
 *
 * "일단 뜨고 나중에 고치자"가 가장 위험하다 — 토큰 위조가 가능한 서버가
 * 조용히 서비스되는 것보다 기동 실패가 낫다.
 */
export function assertProductionSafe(cfg: GuardInput): void {
  const logger = new Logger('ProductionGuard');
  const issues = fatalIssues(cfg);

  if (issues.length > 0) {
    issues.forEach((i) => logger.error(`✗ ${i}`));
    throw new Error(
      `운영 설정 ${issues.length}건이 안전하지 않아 기동을 중단합니다. 위 로그를 확인하세요.`,
    );
  }

  if (!cfg.isProduction) {
    logger.warn(
      '개발 모드로 기동합니다 — 인증 비밀키·DB 자동동기화가 개발 기본값입니다. ' +
        '배포 시 NODE_ENV=production으로 두면 이 설정들이 검사됩니다.',
    );
  }
}
