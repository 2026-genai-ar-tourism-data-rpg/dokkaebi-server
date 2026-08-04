// ============================================================
// [v1] user·map·party 모듈 E2E — 더미 반환이 실제 데이터로 바뀌었는지 (이슈 #8)
// pipeline: 게임 백엔드 / 테스트
// 구현(요약): 실제 Postgres에 앱을 띄우고 HTTP로 검증. AI 호출 없음(시나리오는 직접 적재).
//            v1이 통과시키던 것들(고정 유저·빈 지도·없는 코드 입장)이 막히는지가 핵심.
// 구현일: 2026-08-04 | 작성: kys (core-modules/kys/v1)
// ============================================================
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { Repository } from 'typeorm';

import { AuthModule } from '../src/auth/auth.module';
import configuration from '../src/config/configuration';
import { ENTITIES, Scenario, User } from '../src/database/entities';
import { MapModule } from '../src/map/map.module';
import { PartyModule } from '../src/party/party.module';
import { UserModule } from '../src/user/user.module';

// 스위트 전용 DB — 하나를 공유하면 dropSchema/synchronize가 서로를 밟아 간헐 실패한다.
// (globalSetup이 미리 만들어 둔다: test/setup-databases.js)
const TEST_DB =
  (process.env.TEST_DATABASE_URL ??
    'postgresql://dokkaebi:dokkaebi@localhost:5432/dokkaebi_test') + '_core';

const SCENARIO = {
  scenario_id: 'scn_core_001',
  title: '코어 모듈 검증 코스',
  region: '종로',
  stone_total: 2,
  node_sequence: [
    {
      order: 0, node_id: 'n1', name: '경복궁', kind: 'spot',
      map_x: 126.977, map_y: 37.5796, trigger_radius_m: 100,
      stone_no: 1, fragment_id: 'f1', is_finale: false,
      npc: { name: '먹 도깨비' },
    },
    {
      order: 1, node_id: 'n2', name: '건청궁', kind: 'spot',
      map_x: 126.9767, map_y: 37.5761, trigger_radius_m: 80,
      stone_no: 2, fragment_id: 'f2', is_finale: true,
      npc: { name: '수호 도깨비' },
    },
  ],
};

describe('user·map·party 실구현 (#8)', () => {
  let app: INestApplication;
  let scenarios: Repository<Scenario>;
  let users: Repository<User>;
  let token: string;
  let userId: string;

  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [() => ({ ...configuration(), databaseUrl: TEST_DB })],
        }),
        TypeOrmModule.forRoot({
          type: 'postgres', url: TEST_DB, entities: ENTITIES,
          synchronize: true, dropSchema: true,
        }),
        AuthModule, UserModule, MapModule, PartyModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();

    scenarios = moduleRef.get(getRepositoryToken(Scenario));
    users = moduleRef.get(getRepositoryToken(User));

    const res = await request(app.getHttpServer())
      .post('/v1/auth/guest').send({ nickname: '예슬' }).expect(201);
    token = res.body.token;
    userId = res.body.user_id;

    await scenarios.save(scenarios.create({
      scenario_id: SCENARIO.scenario_id,
      title: SCENARIO.title,
      region: SCENARIO.region,
      created_by: userId,
      stone_total: SCENARIO.stone_total,
      payload: SCENARIO,
    }));
  });

  afterAll(async () => { await app?.close(); });

  describe('GET /me', () => {
    it('[회귀] 고정값이 아니라 내 실제 유저를 돌려준다', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/me').set(auth()).expect(200);

      expect(res.body.user_id).toBe(userId);      // v1은 항상 'u_demo'
      expect(res.body.nickname).toBe('예슬');
      expect(res.body.exp).toBe(0);
      expect(res.body.level).toBe(1);
      expect(res.body.tier).toBe('초급 탐사자');
    });

    it('경험치가 오르면 레벨·등급이 따라 오른다', async () => {
      await users.update({ user_id: userId }, { exp: 5000 }); // 500/레벨 → 11레벨
      const res = await request(app.getHttpServer())
        .get('/v1/me').set(auth()).expect(200);

      expect(res.body.level).toBe(11);
      expect(res.body.tier).toBe('숙련 탐사자');
      await users.update({ user_id: userId }, { exp: 0 });    // 원복
    });

    it('토큰 없이는 볼 수 없다', async () => {
      await request(app.getHttpServer()).get('/v1/me').expect(401);
    });
  });

  describe('GET /regions/:id/nodes', () => {
    it('[회귀] 빈 배열이 아니라 저장된 시나리오의 노드를 준다', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/regions/종로/nodes').expect(200);

      expect(res.body).toHaveLength(2);            // v1은 항상 []
      const gyeongbok = res.body.find((n: { name: string }) => n.name === '경복궁');
      expect(gyeongbok.lat).toBeCloseTo(37.5796);  // map_y → lat 변환
      expect(gyeongbok.lng).toBeCloseTo(126.977);  // map_x → lng 변환
      expect(gyeongbok.trigger_radius_m).toBe(100);
      expect(gyeongbok.scenario_ids).toContain(SCENARIO.scenario_id);
    });

    it('노드가 없는 지역은 빈 목록', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/regions/부산/nodes').expect(200);
      expect(res.body).toEqual([]);
    });

    it('노드 상세는 미션·NPC까지 담아 준다', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/nodes/n2').expect(200);
      expect(res.body.name).toBe('건청궁');
      expect(res.body.is_finale).toBe(true);
      expect(res.body.npc.name).toBe('수호 도깨비');
      expect(res.body.region).toBe('종로');
    });

    it('없는 노드는 404', async () => {
      await request(app.getHttpServer()).get('/v1/nodes/does_not_exist').expect(404);
    });
  });

  describe('파티', () => {
    let code: string;
    let partyId: string;

    it('[회귀] 만들 때마다 다른 코드가 나오고 방장이 멤버로 들어간다', async () => {
      const a = await request(app.getHttpServer())
        .post('/v1/parties').set(auth()).send({ region_id: '종로' }).expect(201);
      const b = await request(app.getHttpServer())
        .post('/v1/parties').set(auth()).send({ region_id: '종로' }).expect(201);

      expect(a.body.code).not.toBe(b.body.code);   // v1은 둘 다 'ABCD'
      expect(a.body.party_id).not.toBe(b.body.party_id);
      expect(a.body.members).toHaveLength(1);      // v1은 항상 []
      expect(a.body.members[0].user_id).toBe(userId);
      expect(a.body.members[0].is_host).toBe(true);

      code = a.body.code;
      partyId = a.body.party_id;
    });

    it('[회귀] 없는 초대 코드로는 입장할 수 없다', async () => {
      await request(app.getHttpServer())
        .post('/v1/parties/ZZZZ/join').set(auth()).send({}).expect(404);
    });

    it('다른 유저가 코드로 입장하면 멤버가 늘어난다', async () => {
      const guest = await request(app.getHttpServer())
        .post('/v1/auth/guest').send({ nickname: '지선' }).expect(201);

      const res = await request(app.getHttpServer())
        .post(`/v1/parties/${code}/join`)
        .set({ Authorization: `Bearer ${guest.body.token}` })
        .send({}).expect(201);

      expect(res.body.members).toHaveLength(2);
      expect(res.body.members.map((m: { nickname: string }) => m.nickname)).toContain('지선');
    });

    it('같은 사람이 다시 들어와도 중복되지 않는다', async () => {
      const res = await request(app.getHttpServer())
        .post(`/v1/parties/${code}/join`).set(auth()).send({}).expect(201);
      expect(res.body.members).toHaveLength(2); // 방장 + 지선, 늘지 않음
    });

    it('정원(4인)을 넘으면 거절한다', async () => {
      for (const nick of ['찬희', '준형']) {
        const g = await request(app.getHttpServer())
          .post('/v1/auth/guest').send({ nickname: nick }).expect(201);
        await request(app.getHttpServer())
          .post(`/v1/parties/${code}/join`)
          .set({ Authorization: `Bearer ${g.body.token}` }).send({}).expect(201);
      }
      // 여기서 4인 — 5번째는 막혀야 한다
      const fifth = await request(app.getHttpServer())
        .post('/v1/auth/guest').send({ nickname: '초과' }).expect(201);
      await request(app.getHttpServer())
        .post(`/v1/parties/${code}/join`)
        .set({ Authorization: `Bearer ${fifth.body.token}` }).send({}).expect(400);
    });

    it('파티 상태를 조회할 수 있다', async () => {
      const res = await request(app.getHttpServer())
        .get(`/v1/parties/${partyId}`).set(auth()).expect(200);
      expect(res.body.code).toBe(code);
      expect(res.body.max_members).toBe(4);
      expect(res.body.members).toHaveLength(4);
    });
  });
});
