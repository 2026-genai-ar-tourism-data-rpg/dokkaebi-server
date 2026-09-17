// ============================================================
// [v1] Supabase 세션 토큰 검증 — 로그인하면 이어하기용 신원 증명
// pipeline: 게임 백엔드 / 인증 (auth.module.ts의 게스트 로그인과 같은 골격)
// 구현(요약): 앱이 Supabase Auth로 로그인해 받은 액세스 토큰(ES256 JWT)을
//            Supabase 프로젝트의 공개 JWKS로 직접 검증한다. 공유 비밀키가
//            아니라 비대칭 서명이라 서버는 공개 URL만 알면 되고, 검증
//            자체는 Node crypto 내장 기능만으로 충분해 별도 JWT 라이브러리를
//            추가하지 않는다(guest 토큰과 같은 무의존성 원칙).
// 구현일: 2026-09-17 | 작성: jch
// ============================================================
import { createPublicKey, verify as verifySignature } from 'crypto';

import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

export interface Es256Jwk {
  kid: string;
  kty: string;
  crv: string;
  x: string;
  y: string;
}

interface SupabaseTokenPayload {
  sub?: string;
  email?: string;
  exp?: number; // 초 단위(표준 JWT) — 우리 자체 토큰의 ms 단위와 다르다.
}

/** Supabase 로그인으로 신원이 증명된 사용자. */
export interface VerifiedSupabaseUser {
  supabaseId: string;
  email?: string;
}

/**
 * ES256 JWT를 주어진 JWKS로 검증한다. 순수 함수라 네트워크·DB 없이 단위
 * 테스트 가능(geo.ts와 같은 원칙) — I/O(JWKS 조회)는 SupabaseAuthService가 맡는다.
 */
export function verifyEs256Jwt(token: string, jwks: Es256Jwk[]): VerifiedSupabaseUser | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts;

  let header: { kid?: string; alg?: string };
  let payload: SupabaseTokenPayload;
  try {
    header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8'));
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (header.alg !== 'ES256' || !header.kid) return null;

  const jwk = jwks.find((k) => k.kid === header.kid);
  if (!jwk) return null;

  const signedData = Buffer.from(`${headerB64}.${payloadB64}`);
  const signature = Buffer.from(sigB64, 'base64url');
  const publicKey = createPublicKey({
    key: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y },
    format: 'jwk',
  });
  // JWT의 ES256 서명은 R||S 원시 결합(IEEE P1363) — crypto 기본값(DER)이 아니다.
  const ok = verifySignature('sha256', signedData, { key: publicKey, dsaEncoding: 'ieee-p1363' }, signature);
  if (!ok) return null;

  if (!payload.sub) return null;
  if (typeof payload.exp === 'number' && payload.exp * 1000 < Date.now()) return null;

  return { supabaseId: payload.sub, email: payload.email };
}

@Injectable()
export class SupabaseAuthService {
  private readonly logger = new Logger(SupabaseAuthService.name);
  private jwksCache: Es256Jwk[] | null = null;
  private jwksFetchedAtMs = 0;
  private readonly jwksTtlMs = 60 * 60 * 1000; // 1시간 — 키 교체는 드물어 캐시로 충분.

  constructor(
    private readonly config: ConfigService,
    private readonly http: HttpService,
  ) {}

  /** Supabase 세션 액세스 토큰을 검증해 신원을 반환한다. 위조·만료면 null. */
  async verify(accessToken: string): Promise<VerifiedSupabaseUser | null> {
    return verifyEs256Jwt(accessToken, await this.getJwks());
  }

  /** JWKS를 가져와 캐시한다(만료 시 재요청). */
  private async getJwks(): Promise<Es256Jwk[]> {
    const now = Date.now();
    if (this.jwksCache && now - this.jwksFetchedAtMs < this.jwksTtlMs) return this.jwksCache;

    const supabaseUrl = this.config.get<string>('supabaseUrl');
    if (!supabaseUrl) {
      this.logger.warn('SUPABASE_URL이 설정되지 않았습니다 — Supabase 로그인을 검증할 수 없습니다.');
      return [];
    }

    const { data } = await firstValueFrom(
      this.http.get<{ keys: Es256Jwk[] }>(`${supabaseUrl}/auth/v1/.well-known/jwks.json`),
    );
    this.jwksCache = data.keys;
    this.jwksFetchedAtMs = now;
    return this.jwksCache;
  }
}
