// ============================================================
// [v1] 루트 모듈 — 도메인 모듈 조립
// pipeline: 게임 백엔드 / 부트스트랩
// 구현(요약): ConfigModule(전역) + 도메인 모듈(health/user/map/quest/party/scenario/ai) 등록
// 구현일: 2026-06-10 | 작성: kys (base-pipeline/kys/v1)
// ============================================================
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import configuration from './config/configuration';
import { AiModule } from './ai/ai.module';
import { HealthModule } from './health/health.module';
import { MapModule } from './map/map.module';
import { PartyModule } from './party/party.module';
import { QuestModule } from './quest/quest.module';
import { ScenarioModule } from './scenario/scenario.module';
import { UserModule } from './user/user.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    HealthModule,
    UserModule,
    MapModule,
    QuestModule,
    PartyModule,
    ScenarioModule,
    AiModule,
  ],
})
export class AppModule {}
