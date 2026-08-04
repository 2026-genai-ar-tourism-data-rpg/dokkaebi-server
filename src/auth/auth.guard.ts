// ============================================================
// [v1] 인증 가드 — Authorization 헤더 토큰 검증 → req.user 주입
// pipeline: 게임 백엔드 / 인증 (보호 엔드포인트 진입점)
// 구현(요약): "Bearer <token>" 파싱 → AuthService.verify → 실패 시 401.
//            통과하면 req.user에 payload를 실어 컨트롤러가 @CurrentUser로 꺼내 쓴다.
//            이전엔 토큰을 발급만 하고 검증하지 않아 아무 요청이나 통과했다(#8).
// 구현일: 2026-08-02 | 작성: kys (quest-api/kys/v1)
// ============================================================
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';

import { AuthService, TokenPayload } from './auth.module';

/** req.user가 실린 요청 타입(컨트롤러에서 참조). */
export interface AuthedRequest {
  user?: TokenPayload;
  headers: Record<string, string | string[] | undefined>;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  /** Authorization: Bearer <token> 검증. 없거나 위조·만료면 401. */
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const raw = req.headers?.authorization;
    const header = Array.isArray(raw) ? raw[0] : raw;
    const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;

    const payload = this.auth.verify(token);
    if (!payload) {
      throw new UnauthorizedException('유효한 토큰이 필요하느니라.');
    }
    req.user = payload;
    return true;
  }
}

/** 컨트롤러 파라미터로 현재 유저를 꺼내는 데코레이터 — @CurrentUser() user: TokenPayload */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): TokenPayload => {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    return req.user as TokenPayload;
  },
);
