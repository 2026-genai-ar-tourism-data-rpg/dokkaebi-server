// ============================================================
// [v2] 인증 모듈 — 게스트 로그인 (JWT-유사 토큰) + 검증
// pipeline: 게임 백엔드 / 인증 (앱 로그인 → 토큰 → 보호 엔드포인트)
// 구현(요약): POST /auth/guest {nickname} → user_id + HMAC 서명 토큰 발급 + users DB 영속.
//            verify()가 서명·만료를 검사해 payload 반환 → AuthGuard가 req.user 주입.
//            의존성 없이 crypto로 서명(MVP). 카카오/구글은 같은 골격에 추가 예정.
// 구현일: 2026-06-18 (영속·검증 추가: 2026-08-02) | 작성: kys (auth-guest/kys/v1) · 이슈 #8
// ------------------------------------------------------------
// [v3] POST /auth/supabase 추가 — Supabase Auth(이메일 등)로 로그인하면
//      같은 user_id로 재로그인돼 진행도가 이어진다(게스트는 매번 새 user_id).
//      토큰 발급·검증 골격은 게스트와 동일, 신원 확인만 SupabaseAuthService로 위임.
// 구현일: 2026-09-17 | 작성: jch (supabase-auth-bridge/jch/v1)
// ============================================================
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';

import { HttpModule } from '@nestjs/axios';
import { Body, Controller, Injectable, Module, Post, UnauthorizedException } from '@nestjs/common';
import { ApiProperty, ApiTags } from '@nestjs/swagger';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { IsOptional, IsString } from 'class-validator';
import { Repository } from 'typeorm';

import { User } from '../database/entities';
import { SupabaseAuthService } from './supabase-auth.service';

/** 게스트 로그인 요청 (닉네임 선택) */
export class GuestLoginDto {
  @ApiProperty({ required: false, example: '지민' })
  @IsOptional()
  @IsString()
  nickname?: string;
}

/** Supabase 로그인 요청 — 앱이 Supabase Auth에서 받은 세션 액세스 토큰을 그대로 전달. */
export class SupabaseLoginDto {
  @ApiProperty({ example: 'eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9...' })
  @IsString()
  access_token: string;

  /** 최초 가입 시에만 사용(기존 계정이면 저장된 닉네임을 그대로 씀). */
  @ApiProperty({ required: false, example: '지민' })
  @IsOptional()
  @IsString()
  nickname?: string;
}

/** 토큰에 담기는 내용 — 검증 통과 시 req.user로 주입된다. */
export interface TokenPayload {
  sub: string; // user_id
  nickname: string;
  iat: number; // 발급 시각(ms)
  exp: number; // 만료 시각(ms)
}

@Injectable()
export class AuthService {
  constructor(
    private readonly config: ConfigService,
    private readonly supabaseAuth: SupabaseAuthService,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  /** payload → "base64(payload).base64(HMAC)" (JWT 유사, 라이브러리 없이). */
  private sign(payload: TokenPayload): string {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${body}.${this.hmac(body)}`;
  }

  /** 서명 계산 — 발급·검증이 반드시 같은 함수를 쓰도록 분리. */
  private hmac(body: string): string {
    const secret = this.config.get<string>('authSecret') ?? 'dev-secret';
    return createHmac('sha256', secret).update(body).digest('base64url');
  }

  /**
   * 토큰 검증 — 서명 위조·만료를 걸러내고 payload 반환(실패 시 null).
   * 서명 비교는 timingSafeEqual로 타이밍 공격을 피한다.
   */
  verify(token: string | undefined): TokenPayload | null {
    if (!token) return null;
    const [body, sig] = token.split('.');
    if (!body || !sig) return null;

    const a = Buffer.from(sig);
    const b = Buffer.from(this.hmac(body));
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    try {
      const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as TokenPayload;
      if (!payload?.sub) return null;
      if (typeof payload.exp === 'number' && payload.exp < Date.now()) return null;
      return payload;
    } catch {
      return null;
    }
  }

  /** 게스트 유저 발급(익명) + users 영속 → 서버를 재시작해도 진행도가 유지된다. */
  async guest(nickname?: string) {
    const userId = `guest_${randomUUID().slice(0, 8)}`;
    const nick = nickname?.trim() || '탐험가';
    const now = Date.now();
    const ttlMs = (this.config.get<number>('authTokenTtlSec') ?? 2592000) * 1000;

    await this.users.save(this.users.create({ user_id: userId, nickname: nick, exp: 0 }));

    const token = this.sign({ sub: userId, nickname: nick, iat: now, exp: now + ttlMs });
    return { user_id: userId, nickname: nick, token };
  }

  /**
   * Supabase 로그인 — 같은 Supabase 계정으로 다시 오면 같은 user_id를 재발급해
   * RunSession·ScenarioStore가 이어진다(둘 다 user_id로 키를 잡으므로 이거면 충분).
   */
  async supabase(accessToken: string, nickname?: string) {
    const verified = await this.supabaseAuth.verify(accessToken);
    if (!verified) throw new UnauthorizedException('유효하지 않거나 만료된 Supabase 토큰입니다.');

    const now = Date.now();
    const ttlMs = (this.config.get<number>('authTokenTtlSec') ?? 2592000) * 1000;

    let user = await this.users.findOne({ where: { supabase_id: verified.supabaseId } });
    if (!user) {
      const userId = `sb_${randomUUID().slice(0, 8)}`;
      const nick = nickname?.trim() || verified.email?.split('@')[0] || '탐험가';
      user = await this.users.save(
        this.users.create({
          user_id: userId,
          nickname: nick,
          exp: 0,
          supabase_id: verified.supabaseId,
        }),
      );
    }

    const token = this.sign({
      sub: user.user_id,
      nickname: user.nickname,
      iat: now,
      exp: now + ttlMs,
    });
    return { user_id: user.user_id, nickname: user.nickname, token };
  }
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** 게스트 로그인 — 닉네임만으로 즉시 시작 */
  @Post('guest')
  guest(@Body() dto: GuestLoginDto) {
    return this.auth.guest(dto.nickname);
  }

  /** Supabase 로그인 — 같은 계정이면 이전 진행도로 이어진다 */
  @Post('supabase')
  supabase(@Body() dto: SupabaseLoginDto) {
    return this.auth.supabase(dto.access_token, dto.nickname);
  }
}

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    HttpModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      // JWKS는 Supabase 자체 응답이라 AI 호출보다 훨씬 빨리 끝난다 — 넉넉히 10초.
      useFactory: () => ({ timeout: 10_000, maxRedirects: 0 }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, SupabaseAuthService],
  exports: [AuthService],
})
export class AuthModule {}
