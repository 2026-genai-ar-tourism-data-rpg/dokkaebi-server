// ============================================================
// [v1] 게임 루프 E2E — 인증→시나리오→run→GPS→조각→완료 (이슈 #8)
// pipeline: 게임 백엔드 / 퀘스트 (테스트)
// 구현(요약): 실제 Postgres(dokkaebi_test)에 앱을 띄우고 HTTP로 전 구간 검증.
//            AI 백엔드는 호출하지 않는다(AiClient를 고정 시나리오로 대체) → 네트워크·LLM 0.
//            v1 더미가 통과시키던 것들(반경 밖 인증·미인증 획득·중복 획득·보상 재지급)이
//            실제로 막히는지가 이 파일의 존재 이유다.
// 구현일: 2026-08-02 | 작성: kys (quest-api/kys/v1)
// ============================================================
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { Repository } from 'typeorm';

import { AiClient } from '../src/ai/ai.client';
import { AuthModule } from '../src/auth/auth.module';
import configuration from '../src/config/configuration';
import { ENTITIES, User } from '../src/database/entities';
import { QuestModule } from '../src/quest/quest.module';
import { RedisModule } from '../src/redis/redis.module';
import { ScenarioModule } from '../src/scenario/scenario.module';

// 스위트 전용 DB — 하나를 공유하면 dropSchema/synchronize가 서로를 밟아 간헐 실패한다.
// (globalSetup이 미리 만들어 둔다: test/setup-databases.js)
const TEST_DB =
  (process.env.TEST_DATABASE_URL ??
    'postgresql://dokkaebi:dokkaebi@localhost:5432/dokkaebi_test') + '_quest';

// 노드 좌표 — 종로 실좌표 기반(경복궁 근처 2곳 + 멀리 떨어진 1곳)
const N1 = { id: 'n1', lat: 37.5796, lng: 126.977 };
const N2 = { id: 'n2', lat: 37.5794, lng: 126.9772 };
const FAR = { lat: 37.63, lng: 127.05 }; // 두 노드에서 8km 밖

/** AI가 돌려줄 법한 최소 시나리오(2노드: 일반 + 피날레). */
const FAKE_SCENARIO = {
  scenario_id: 'scn_test_001',
  title: '테스트 코스',
  region: '종로',
  type: 'custom',
  stone_total: 2,
  anchor_node_id: N2.id,
  is_public: false,
  created_by: null,
  is_branching: false,
  route_tree: null,
  node_sequence: [
    {
      order: 0, node_id: N1.id, name: '첫 노드', kind: 'spot',
      map_x: N1.lng, map_y: N1.lat, trigger_radius_m: 100,
      stone_no: 1, fragment_id: 'test_stone_1of2', is_finale: false,
      requires: [], requires_mode: 'none',
      grants: ['fragment:test_stone_1of2', 'clue:첫단서'],
      npc: { name: '먹 도깨비' },
    },
    {
      order: 1, node_id: N2.id, name: '피날레 노드', kind: 'spot',
      map_x: N2.lng, map_y: N2.lat, trigger_radius_m: 100,
      stone_no: 2, fragment_id: 'test_stone_2of2', is_finale: true,
      requires: ['fragment:test_stone_1of2'], requires_mode: 'hard',
      grants: ['fragment:test_stone_2of2'],
      npc: { name: '수호 도깨비' },
    },
  ],
};

/** AI 백엔드를 대신하는 스텁 — 네트워크·LLM 호출 없음. */
const aiStub = {
  generateScenario: async () => FAKE_SCENARIO,
  dialogue: async () => ({ response: '허허', cache_hit: false }),
  dialogueTurn: async () => ({}),
  searchAttractions: async () => [],
};

describe('게임 루프 E2E (#8)', () => {
  let app: INestApplication;
  let users: Repository<User>;
  let token: string;
  let userId: string;
  let runId: string;

  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
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
          dropSchema: true, // 매 실행마다 깨끗한 스키마 → 결정론
        }),
        RedisModule,
        AuthModule,
        ScenarioModule,
        QuestModule,
      ],
    })
      .overrideProvider(AiClient)
      .useValue(aiStub)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();

    users = moduleRef.get(getRepositoryToken(User));
  });

  afterAll(async () => {
    await app?.close();
  });

  /** 각 테스트가 이전 위치 fix에 영향받지 않도록 스푸핑 이력을 지운다. */
  const clearFix = async () => {
    const redis = app.get<{ setLastFix: Function }>(
      (await import('../src/redis/redis.service')).RedisService,
    );
    // 아주 오래된 fix로 덮어써 속도 검사를 무력화(직접 삭제 API 대신 안전한 우회)
    await (redis as any).setLastFix?.(userId, { lat: 0, lng: 0, atMs: 0 }, 1);
  };

  it('① 게스트 로그인 — 유저가 DB에 영속된다', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/auth/guest')
      .send({ nickname: '예슬' })
      .expect(201);

    token = res.body.token;
    userId = res.body.user_id;
    expect(token).toBeTruthy();

    const saved = await users.findOne({ where: { user_id: userId } });
    expect(saved?.nickname).toBe('예슬');
    expect(saved?.exp).toBe(0);
  });

  it('② 토큰 없이·위조 토큰으로는 접근할 수 없다', async () => {
    await request(app.getHttpServer())
      .post('/v1/runs').send({ scenario_id: 'x' }).expect(401);

    await request(app.getHttpServer())
      .post('/v1/runs')
      .set('Authorization', `Bearer ${token.slice(0, -1)}X`)
      .send({ scenario_id: 'x' })
      .expect(401);
  });

  it('③ 시나리오 생성 시 DB에 저장된다 (없으면 GPS 판정 불가)', async () => {
    await request(app.getHttpServer())
      .post('/v1/scenarios/custom')
      .set(auth())
      .send({ user_id: userId, start: { lat: N1.lat, lng: N1.lng } })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post('/v1/runs')
      .set(auth())
      .send({ scenario_id: FAKE_SCENARIO.scenario_id })
      .expect(201);

    runId = res.body.run_id;
    expect(res.body.required).toBe(2); // 조각 총수(피날레 게이트 1개와 다름)
    expect(res.body.progress).toBe(0);
    expect(res.body.entry_node_id).toBe(N1.id);
  });

  it('④ [회귀] 반경 밖에서는 인증되지 않는다 — 예전엔 5km 밖도 통과했다', async () => {
    await clearFix();
    const res = await request(app.getHttpServer())
      .post(`/v1/runs/${runId}/nodes/${N1.id}/verify-location`)
      .set(auth())
      .send({ lat: FAR.lat, lng: FAR.lng })
      .expect(201);

    expect(res.body.verified).toBe(false);
    expect(res.body.reason).toBe('OUT_OF_RANGE');
    expect(res.body.distance_m).toBeGreaterThan(7000); // 실제 거리를 돌려준다(0 아님)
  });

  it('⑤ [회귀] GPS 미인증 노드에서는 조각을 획득할 수 없다', async () => {
    await request(app.getHttpServer())
      .post(`/v1/runs/${runId}/nodes/${N1.id}/collect`)
      .set(auth())
      .send({})
      .expect(403);
  });

  it('⑥ [회귀] 순간이동(비현실적 이동속도)은 거절된다', async () => {
    // 직전 fix를 '방금 8km 밖'으로 심고 즉시 목적지에서 인증 시도
    const { RedisService } = await import('../src/redis/redis.service');
    await app.get(RedisService).setLastFix(
      userId, { lat: FAR.lat, lng: FAR.lng, atMs: Date.now() - 5000 }, 60,
    );

    const res = await request(app.getHttpServer())
      .post(`/v1/runs/${runId}/nodes/${N1.id}/verify-location`)
      .set(auth())
      .send({ lat: N1.lat, lng: N1.lng })
      .expect(201);

    expect(res.body.verified).toBe(false);
    expect(res.body.reason).toBe('IMPOSSIBLE_SPEED');
  });

  it('⑦ GPS 정확도가 너무 나쁘면 판정을 보류한다', async () => {
    await clearFix();
    const res = await request(app.getHttpServer())
      .post(`/v1/runs/${runId}/nodes/${N1.id}/verify-location`)
      .set(auth())
      .send({ lat: N1.lat, lng: N1.lng, accuracy_m: 5000 })
      .expect(201);

    expect(res.body.verified).toBe(false);
    expect(res.body.reason).toBe('LOW_ACCURACY');
  });

  it('⑧ 정상 도착하면 인증되고 조각을 얻는다', async () => {
    await clearFix();
    const v = await request(app.getHttpServer())
      .post(`/v1/runs/${runId}/nodes/${N1.id}/verify-location`)
      .set(auth())
      .send({ lat: N1.lat, lng: N1.lng, accuracy_m: 10 })
      .expect(201);
    expect(v.body.verified).toBe(true);
    expect(v.body.state).toBe('GPS_VERIFIED');

    const c = await request(app.getHttpServer())
      .post(`/v1/runs/${runId}/nodes/${N1.id}/collect`)
      .set(auth())
      .send({})
      .expect(201);
    expect(c.body.fragment_id).toBe('test_stone_1of2');
    expect(c.body.already_collected).toBe(false);
    expect(c.body.progress).toBe(1);
  });

  it('⑨ [회귀] 같은 조각을 중복 획득할 수 없다 (동시 요청 포함)', async () => {
    const attempts = await Promise.all(
      Array.from({ length: 5 }, () =>
        request(app.getHttpServer())
          .post(`/v1/runs/${runId}/nodes/${N1.id}/collect`)
          .set(auth())
          .send({}),
      ),
    );
    expect(attempts.every((r) => r.body.already_collected === true)).toBe(true);
    expect(attempts.every((r) => r.body.progress === 1)).toBe(true);
  });

  it('⑩ 노드 완료 시 실제 조각 id로 보상한다 (하드코딩 아님)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/runs/${runId}/nodes/${N1.id}/complete`)
      .set(auth())
      .send({})
      .expect(201);

    expect(res.body.memory_stone_fragment_id).toBe('test_stone_1of2');
    expect(res.body.exp_gained).toBe(100);
    expect(res.body.dex_entry).toBe('먹 도깨비');
    expect(res.body.region_restored).toBe(false);
    expect(res.body.next_node_id).toBe(N2.id);

    const u = await users.findOne({ where: { user_id: userId } });
    expect(u?.exp).toBe(100);
  });

  it('⑪ [회귀] complete 재호출로 경험치를 파밍할 수 없다', async () => {
    for (let i = 0; i < 3; i++) {
      const res = await request(app.getHttpServer())
        .post(`/v1/runs/${runId}/nodes/${N1.id}/complete`)
        .set(auth())
        .send({})
        .expect(201);
      expect(res.body.exp_gained).toBe(0);
      expect(res.body.already_rewarded).toBe(true);
    }
    const u = await users.findOne({ where: { user_id: userId } });
    expect(u?.exp).toBe(100); // 여전히 100
  });

  it('⑫ 피날레를 완료하면 지역이 복원되고 run이 닫힌다', async () => {
    await clearFix();
    await request(app.getHttpServer())
      .post(`/v1/runs/${runId}/nodes/${N2.id}/verify-location`)
      .set(auth())
      .send({ lat: N2.lat, lng: N2.lng, accuracy_m: 10 })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/v1/runs/${runId}/nodes/${N2.id}/collect`)
      .set(auth())
      .send({})
      .expect(201);

    const res = await request(app.getHttpServer())
      .post(`/v1/runs/${runId}/nodes/${N2.id}/complete`)
      .set(auth())
      .send({})
      .expect(201);

    expect(res.body.region_restored).toBe(true);
    expect(res.body.titles).toContain('종로의 기억을 되찾은 자');
    expect(res.body.exp_gained).toBe(600); // 조각 100 + 피날레 보너스 500

    const run = await request(app.getHttpServer())
      .get(`/v1/runs/${runId}`)
      .set(auth())
      .expect(200);
    expect(run.body.state).toBe('COMPLETED');
    expect(run.body.progress).toBe(2);
  });

  it('⑬ 남의 플레이 기록은 조회·조작할 수 없다', async () => {
    const other = await request(app.getHttpServer())
      .post('/v1/auth/guest')
      .send({ nickname: '침입자' })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/v1/runs/${runId}`)
      .set('Authorization', `Bearer ${other.body.token}`)
      .expect(403);
  });
});
