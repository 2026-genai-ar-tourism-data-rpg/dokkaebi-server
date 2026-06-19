// ============================================================
// [v1] 인증 모듈 — 게스트 로그인 (JWT-유사 토큰)
// pipeline: 게임 백엔드 / 인증 (앱 로그인 → 토큰)
// 구현(요약): POST /auth/guest {nickname} → user_id + HMAC 서명 토큰 발급.
//            의존성 없이 crypto로 서명(MVP). 카카오/구글은 같은 골격에 추가 예정.
//            ⚠️ users DB 영속·토큰 검증 미들웨어는 TODO(이지선/김예슬).
// 구현일: 2026-06-18 | 작성: kys (auth-guest/kys/v1)
// ============================================================
import { createHmac, randomUUID } from 'crypto';

import { Body, Controller, Injectable, Module, Post } from '@nestjs/common';
import { ApiProperty, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { IsOptional, IsString } from 'class-validator';

/** 게스트 로그인 요청 (닉네임 선택) */
export class GuestLoginDto {
  @ApiProperty({ required: false, example: '지민' })
  @IsOptional()
  @IsString()
  nickname?: string;
}

@Injectable()
export class AuthService {
  constructor(private readonly config: ConfigService) {}

  /** payload → "base64(payload).base64(HMAC)" (JWT 유사, 라이브러리 없이). */
  private sign(payload: Record<string, unknown>): string {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const secret = this.config.get<string>('authSecret') ?? 'dev-secret';
    const sig = createHmac('sha256', secret).update(body).digest('base64url');
    return `${body}.${sig}`;
  }

  /** 게스트 유저 발급(익명). MVP는 비영속 — users DB 적재는 추후(이지선). */
  guest(nickname?: string) {
    const userId = `guest_${randomUUID().slice(0, 8)}`;
    const nick = nickname?.trim() || '탐험가';
    const token = this.sign({ sub: userId, nickname: nick, iat: Date.now() });
    return { user_id: userId, nickname: nick, token };
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
}

@Module({ controllers: [AuthController], providers: [AuthService] })
export class AuthModule {}
