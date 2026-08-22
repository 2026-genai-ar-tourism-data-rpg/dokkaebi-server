// ============================================================
// [v2] Redis 서비스 — 직전 위치 fix 보관(스푸핑 판정)
// pipeline: 게임 백엔드 / 공통 인프라 (스푸핑 판정)
// 구현(요약): 직전 GPS fix를 TTL로 보관해 이동속도(스푸핑) 계산에 사용.
//            Redis가 없거나 죽어도 게임을 막지 않는다 — 속도 검사만 생략된다.
//            ⚠️ 조각 중복 방지는 여기서 하지 않는다. 예전엔 SET NX 선점을 썼는데,
//            선점 실패 시 조기 반환하면 선행 insert 커밋 전에 진행도를 세어
//            progress=0이 나갔다. 정합성 근거는 DB 유니크 제약 하나로 일원화했다.
// 구현일: 2026-08-02 | 작성: kys (quest-api/kys/v1) · 이슈 #8
// ============================================================
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/** 직전 위치 fix — 이동속도(스푸핑) 계산용. */
export interface LastFix {
  lat: number;
  lng: number;
  atMs: number;
}

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis | null;

  constructor(private readonly config: ConfigService) {
    const url = this.config.get<string>('redisUrl');
    try {
      // lazyConnect=false로 즉시 연결하되, 실패해도 예외로 앱을 죽이지 않는다.
      this.client = new Redis(url ?? '', {
        maxRetriesPerRequest: 1,
        retryStrategy: () => null, // 무한 재시도 금지 — 없으면 없는 대로 동작
      });
      this.client.on('error', (e) => this.logger.warn(`Redis 사용 불가(폴백 동작): ${e.message}`));
    } catch (e) {
      this.logger.warn(`Redis 초기화 실패(폴백 동작): ${String(e)}`);
      this.client = null;
    }
  }

  /** 유저의 직전 GPS fix 조회(없으면 null). */
  async getLastFix(userId: string): Promise<LastFix | null> {
    if (!this.client) return null;
    try {
      const raw = await this.client.get(`fix:${userId}`);
      return raw ? (JSON.parse(raw) as LastFix) : null;
    } catch {
      return null;
    }
  }

  /** 유저의 직전 GPS fix 갱신(TTL 경과 후 자동 소멸). */
  async setLastFix(userId: string, fix: LastFix, ttlSec: number): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.set(`fix:${userId}`, JSON.stringify(fix), 'EX', ttlSec);
    } catch {
      /* 폴백: 속도 검사만 생략 */
    }
  }

  /**
   * 카운터 1 증가 후 현재 값 반환. Redis가 없으면 null(호출측이 폴백한다).
   * 분기 대화 턴 수처럼 **클라이언트를 믿을 수 없는 값**을 서버가 세는 데 쓴다.
   */
  async incr(key: string, ttlSec: number): Promise<number | null> {
    if (!this.client) return null;
    try {
      const n = await this.client.incr(key);
      if (n === 1) await this.client.expire(key, ttlSec); // 첫 증가에만 TTL을 건다
      return n;
    } catch {
      return null;
    }
  }

  /** 카운터 삭제(대화가 끝나면 다음 방문을 위해 리셋). */
  async del(key: string): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.del(key);
    } catch {
      /* 폴백: TTL로 알아서 사라진다 */
    }
  }

  /** 앱 종료 시 연결 정리(테스트가 열린 핸들로 매달리지 않도록). */
  async onModuleDestroy(): Promise<void> {
    try {
      await this.client?.quit();
    } catch {
      /* 이미 끊김 */
    }
  }
}
