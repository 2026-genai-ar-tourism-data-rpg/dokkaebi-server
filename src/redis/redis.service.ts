// ============================================================
// [v1] Redis 서비스 — 조각 원자 선점 · 직전 위치 fix 보관
// pipeline: 게임 백엔드 / 공통 인프라 (멀티 동시성 · 스푸핑 판정)
// 구현(요약): SET NX로 조각 선점(멀티 4인 동시 탭 중복 방지), 직전 GPS fix를 TTL로 보관해
//            이동속도 계산에 사용. Redis가 없거나 죽어도 게임을 막지 않는다(폴백=허용) —
//            중복 방지 최종 방어선은 DB 유니크 제약이라 정합성은 유지된다.
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

  /**
   * 조각 선점 시도. 처음 잡은 요청만 true.
   * Redis가 없으면 true(허용) — DB 유니크 제약이 최종 방어선이므로 안전하다.
   */
  async acquireFragmentLock(runId: string, fragmentId: string, ttlSec: number): Promise<boolean> {
    if (!this.client) return true;
    try {
      const res = await this.client.set(
        `frag:${runId}:${fragmentId}`, '1', 'EX', ttlSec, 'NX',
      );
      return res === 'OK';
    } catch {
      return true; // Redis 장애 시 게임을 막지 않는다
    }
  }

  /** 실패한 조각 획득의 선점을 되돌린다(재시도 가능하게). */
  async releaseFragmentLock(runId: string, fragmentId: string): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.del(`frag:${runId}:${fragmentId}`);
    } catch {
      /* 폴백: TTL로 자동 만료 */
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

  /** 앱 종료 시 연결 정리(테스트가 열린 핸들로 매달리지 않도록). */
  async onModuleDestroy(): Promise<void> {
    try {
      await this.client?.quit();
    } catch {
      /* 이미 끊김 */
    }
  }
}
