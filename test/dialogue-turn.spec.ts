// ============================================================
// [v1] 분기 대화 프록시 테스트 — 서버가 턴을 센다 (dialogue-rework/kys/v1)
// pipeline: 게임 백엔드 / 대화 (테스트)
// 구현(요약): 앱이 보내는 turn을 믿지 않고 서버 카운터로 덮어쓰는지, 대화가 끝나면
//            카운터가 리셋되는지, 인증 없이는 못 부르는지를 HTTP로 검증한다.
//            AI 백엔드는 스텁(네트워크·LLM 0). Redis는 실물을 쓰되 없으면 폴백 경로가
//            동작하는지만 보므로 CI에서도 안전하다.
// 구현일: 2026-08-19 | 작성: kys (dialogue-rework/kys/v1)
// ============================================================
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';

import { AiClient } from '../src/ai/ai.client';
import { AuthModule } from '../src/auth/auth.module';
import configuration from '../src/config/configuration';
import { User } from '../src/database/entities';
import { DialogueModule } from '../src/dialogue/dialogue.module';
import { RedisModule } from '../src/redis/redis.module';
import { RedisService } from '../src/redis/redis.service';

/** AI가 받은 바디를 그대로 되돌려 주는 스텁 — 서버가 무엇을 넘겼는지 본다. */
const seen: Record<string, unknown>[] = [];
let aiDone = false;
const aiStub = {
  dialogueTurn: async (body: Record<string, unknown>) => {
    seen.push(body);
    return { response: '허허', choices: [], grants: [], done: aiDone };
  },
};

/** Redis 없이도 결정적으로 돌도록 카운터를 인메모리로 대체. */
const counters = new Map<string, number>();
const redisStub = {
  incr: async (key: string) => {
    const n = (counters.get(key) ?? 0) + 1;
    counters.set(key, n);
    return n;
  },
  del: async (key: string) => {
    counters.delete(key);
  },
};

describe('분기 대화 프록시', () => {
  let app: INestApplication;
  let token: string;

  const auth = () => ({ Authorization: `Bearer ${token}` });
  const turn = (body: Record<string, unknown>) =>
    request(app.getHttpServer()).post('/v1/dialogue/turn').set(auth()).send(body);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
        RedisModule,
        AuthModule,
        DialogueModule,
      ],
    })
      .overrideProvider(AiClient)
      .useValue(aiStub)
      .overrideProvider(RedisService)
      .useValue(redisStub)
      // 이 스위트는 대화 프록시만 본다 — 유저 저장은 스텁으로 대체(DB 불필요).
      .overrideProvider(getRepositoryToken(User))
      .useValue({
        findOne: async () => null,
        save: async (u: Partial<User>) => u,
        create: (u: Partial<User>) => u,
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();

    const res = await request(app.getHttpServer())
      .post('/v1/auth/guest')
      .send({ nickname: '나그네' });
    token = res.body.token as string;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    seen.length = 0;
    counters.clear();
    aiDone = false;
  });

  it('토큰이 없으면 401 — 유저 단위로 턴을 세야 하므로 익명 호출을 받지 않는다', async () => {
    await request(app.getHttpServer())
      .post('/v1/dialogue/turn')
      .send({ node_id: 'n1' })
      .expect(401);
  });

  it('앱이 turn=0을 계속 보내도 서버 카운터가 올라간다 (깊이상한 우회 차단)', async () => {
    await turn({ node_id: 'n1', turn: 0 }).expect(201);
    await turn({ node_id: 'n1', turn: 0 }).expect(201);
    await turn({ node_id: 'n1', turn: 0 }).expect(201);

    expect(seen.map((b) => b.turn)).toEqual([0, 1, 2]); // 앱 값(0,0,0)이 아니라 서버 값
  });

  it('노드가 다르면 카운터도 따로 센다', async () => {
    await turn({ node_id: 'n1', turn: 0 }).expect(201);
    await turn({ node_id: 'n2', turn: 0 }).expect(201);

    expect(seen.map((b) => b.turn)).toEqual([0, 0]);
  });

  it('대화가 끝나면(done) 카운터를 비워 다음 방문이 처음부터 시작된다', async () => {
    await turn({ node_id: 'n1', turn: 0 }).expect(201);
    aiDone = true;
    await turn({ node_id: 'n1', turn: 0 }).expect(201);
    aiDone = false;
    await turn({ node_id: 'n1', turn: 0 }).expect(201);

    expect(seen.map((b) => b.turn)).toEqual([0, 1, 0]);
  });

  it('branch·history 등 나머지 필드는 손대지 않고 그대로 넘긴다', async () => {
    const branch = {
      prompt: '갈림길이로다',
      options: [{ choice_id: 'b1', label: '샛길', next_node_id: 'alt' }],
    };
    await turn({ node_id: 'n1', turn: 0, branch, history: [{ role: 'me', text: '가겠다' }] })
      .expect(201);

    expect(seen[0].branch).toEqual(branch);
    expect(seen[0].history).toEqual([{ role: 'me', text: '가겠다' }]);
  });
});
