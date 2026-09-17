// ============================================================
// [v1] Supabase ES256 JWT 검증 단위테스트 (네트워크·DB 0)
// pipeline: 게임 백엔드 / 인증 (테스트)
// 구현(요약): 자체 발급한 EC 키로 정상·위조·만료·오서명 케이스를 확인한다.
//            실제 Supabase 프로젝트 없이도 verifyEs256Jwt()의 서명 검증
//            로직(JWK 임포트 + IEEE P1363 인코딩)이 맞는지 검증.
// 구현일: 2026-09-17 | 작성: jch (supabase-auth-bridge/jch/v1)
// ============================================================
import { createSign, generateKeyPairSync } from 'crypto';

import { Es256Jwk, verifyEs256Jwt } from './supabase-auth.service';

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url');
}

/** DER(SEQUENCE of two INTEGER) → JWT가 쓰는 R||S 64바이트 raw 결합. */
function derToRaw(der: Buffer): Buffer {
  let offset = 2;
  const readInt = (): Buffer => {
    offset++; // INTEGER 태그(0x02)
    const len = der[offset++];
    let bytes = der.subarray(offset, offset + len);
    offset += len;
    if (bytes[0] === 0) bytes = bytes.subarray(1); // 부호 패딩 제거
    return Buffer.concat([Buffer.alloc(32 - bytes.length), bytes]);
  };
  return Buffer.concat([readInt(), readInt()]);
}

describe('verifyEs256Jwt', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' }) as unknown as Es256Jwk;
  jwk.kid = 'test-kid';
  const jwks = [jwk];

  const SUB = '4c823a70-6f2c-4694-a538-59018bc59142';

  function sign(payload: Record<string, unknown>, header: Record<string, unknown> = {}): string {
    const h = b64url(JSON.stringify({ alg: 'ES256', kid: 'test-kid', typ: 'JWT', ...header }));
    const p = b64url(JSON.stringify(payload));
    const der = createSign('sha256').update(`${h}.${p}`).sign(privateKey);
    return `${h}.${p}.${b64url(derToRaw(der))}`;
  }

  it('유효한 토큰은 sub·email을 반환한다', () => {
    const token = sign({ sub: SUB, email: 'a@b.com', exp: Math.floor(Date.now() / 1000) + 3600 });
    expect(verifyEs256Jwt(token, jwks)).toEqual({ supabaseId: SUB, email: 'a@b.com' });
  });

  it('페이로드를 위조하면(서명 불일치) null', () => {
    const token = sign({ sub: SUB, exp: Math.floor(Date.now() / 1000) + 3600 });
    const [h, , s] = token.split('.');
    const tamperedPayload = b64url(JSON.stringify({ sub: 'attacker', exp: Math.floor(Date.now() / 1000) + 3600 }));
    expect(verifyEs256Jwt(`${h}.${tamperedPayload}.${s}`, jwks)).toBeNull();
  });

  it('만료된 토큰은 null', () => {
    const token = sign({ sub: SUB, exp: Math.floor(Date.now() / 1000) - 10 });
    expect(verifyEs256Jwt(token, jwks)).toBeNull();
  });

  it('다른 키로 서명된 토큰(kid 불일치 포함 안 됨)은 null', () => {
    const other = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const h = b64url(JSON.stringify({ alg: 'ES256', kid: 'test-kid', typ: 'JWT' }));
    const p = b64url(JSON.stringify({ sub: SUB, exp: Math.floor(Date.now() / 1000) + 3600 }));
    const der = createSign('sha256').update(`${h}.${p}`).sign(other.privateKey);
    const token = `${h}.${p}.${b64url(derToRaw(der))}`;
    expect(verifyEs256Jwt(token, jwks)).toBeNull();
  });

  it('kid가 JWKS에 없으면 null', () => {
    const token = sign({ sub: SUB, exp: Math.floor(Date.now() / 1000) + 3600 }, { kid: 'unknown-kid' });
    expect(verifyEs256Jwt(token, jwks)).toBeNull();
  });

  it('ES256이 아닌 alg는 null', () => {
    const token = sign({ sub: SUB, exp: Math.floor(Date.now() / 1000) + 3600 }, { alg: 'none' });
    expect(verifyEs256Jwt(token, jwks)).toBeNull();
  });

  it('형식이 JWT가 아니면 null', () => {
    expect(verifyEs256Jwt('not-a-jwt', jwks)).toBeNull();
  });

  it('sub가 없으면 null', () => {
    const token = sign({ exp: Math.floor(Date.now() / 1000) + 3600 });
    expect(verifyEs256Jwt(token, jwks)).toBeNull();
  });
});
