// ============================================================
// [v1] 업스트림 예외 필터 E2E — AI 오류가 앱까지 의미를 잃지 않고 전달되는지
// pipeline: 게임 백엔드 / 공통 (테스트)
// 구현(요약): AiClient가 axios 오류를 던지는 상황을 만들어 응답 상태·바디를 검증.
//            필터가 없으면 전부 500 "Internal server error"로 뭉개진다.
// 구현일: 2026-08-04 | 작성: kys (upstream-errors/kys/v1)
// ============================================================
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpAdapterHost } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AxiosError } from 'axios';
import request from 'supertest';

import { AiClient } from '../src/ai/ai.client';
import { UpstreamExceptionFilter } from '../src/common/upstream-exception.filter';
import configuration from '../src/config/configuration';
import { ENTITIES } from '../src/database/entities';
import { ScenarioModule } from '../src/scenario/scenario.module';

// 스위트 전용 DB — 하나를 공유하면 dropSchema/synchronize가 서로를 밟아 간헐 실패한다.
// (globalSetup이 미리 만들어 둔다: test/setup-databases.js)
const TEST_DB =
  (process.env.TEST_DATABASE_URL ??
    'postgresql://dokkaebi:dokkaebi@localhost:5432/dokkaebi_test') + '_upstream';

const REQUEST_BODY = { user_id: 'u', start: { lat: 37.5796, lng: 126.977 } };

/** AI가 구조화된 422를 돌려준 상황(예: 반경 내 관광지 없음 / TourAPI 장애). */
function axios422(): AxiosError {
  const e = new AxiosError('Request failed with status code 422');
  e.response = {
    status: 422,
    statusText: 'Unprocessable Entity',
    data: { error: { code: 'domain_error', message: 'TourAPI 응답 시간 초과[ReadTimeout]' } },
    headers: {},
    config: {} as never,
  };
  return e;
}

/** AI 백엔드가 아예 안 떠 있는 상황(응답 없음). */
function axiosDown(): AxiosError {
  const e = new AxiosError('connect ECONNREFUSED 127.0.0.1:8001');
  e.code = 'ECONNREFUSED';
  return e;
}

async function bootWith(error: AxiosError): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        load: [() => ({ ...configuration(), databaseUrl: TEST_DB })],
      }),
      TypeOrmModule.forRoot({
        type: 'postgres',
        url: TEST_DB,
        entities: ENTITIES,
        synchronize: true,
      }),
      ScenarioModule,
    ],
  })
    .overrideProvider(AiClient)
    .useValue({
      generateScenario: async () => {
        throw error;
      },
      searchAttractions: async () => [],
      dialogue: async () => ({}),
      dialogueTurn: async () => ({}),
    })
    .compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('v1');
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.useGlobalFilters(new UpstreamExceptionFilter(app.get(HttpAdapterHost)));
  await app.init();
  return app;
}

describe('업스트림 예외 전달', () => {
  let app: INestApplication;

  afterEach(async () => {
    await app?.close();
  });

  it('[회귀] AI의 422를 500으로 뭉개지 않고 그대로 전달한다', async () => {
    app = await bootWith(axios422());
    const res = await request(app.getHttpServer())
      .post('/v1/scenarios/custom')
      .send(REQUEST_BODY)
      .expect(422);

    // 상태코드뿐 아니라 AI가 만든 원인 문구까지 살아 있어야 앱이 안내를 띄울 수 있다.
    expect(res.body.error.code).toBe('domain_error');
    expect(res.body.error.message).toContain('ReadTimeout');
  });

  it('AI 백엔드가 죽어 있으면 503으로 정규화한다', async () => {
    app = await bootWith(axiosDown());
    const res = await request(app.getHttpServer())
      .post('/v1/scenarios/custom')
      .send(REQUEST_BODY)
      .expect(503);

    expect(res.body.error.code).toBe('upstream_unavailable');
  });

  it('내부 결함은 500이되 스택트레이스를 노출하지 않는다', async () => {
    const boom = new Error('내부 비밀 경로 /secret/path') as AxiosError;
    app = await bootWith(boom);
    const res = await request(app.getHttpServer())
      .post('/v1/scenarios/custom')
      .send(REQUEST_BODY)
      .expect(500);

    expect(res.text).not.toContain('/secret/path');
    expect(res.text).not.toContain('Traceback');
    expect(res.body.error.code).toBe('internal_error');
  });
});
