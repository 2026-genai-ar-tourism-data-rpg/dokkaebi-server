// ============================================================
// [v1] DB 모듈 — TypeORM 루트 연결
// pipeline: 게임 백엔드 / 영속 계층 (부트스트랩)
// 구현(요약): DATABASE_URL(Postgres) 연결. dbSync=true면 스키마 자동 생성(로컬 전용).
//            테스트는 이 모듈 대신 sqlite 인메모리 옵션을 쓴다(test/db.ts).
// 구현일: 2026-08-02 | 작성: kys (quest-api/kys/v1) · 이슈 #8
// ============================================================
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ENTITIES } from './entities';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      /** env의 DATABASE_URL로 Postgres 연결. 엔티티는 entities.ts 단일 소스. */
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        url: config.get<string>('databaseUrl'),
        entities: ENTITIES,
        // 로컬/개발 편의. 배포는 DB_SYNC=false + migration.
        synchronize: config.get<boolean>('dbSync') ?? false,
        logging: false,
      }),
    }),
  ],
})
export class DatabaseModule {}
