// ============================================================
// [v1] 시나리오 생성 DTO — whitelist:true에서 wishlist_only가 잘리지 않고 AI로 가는지.
// pipeline: 게임 백엔드 / 테스트 (DB 불필요)
// 구현일: 2026-09-19 | 작성: ljs (wishlist-only/ljs/v1)
// ============================================================
import { ValidationPipe } from '@nestjs/common';
import { GenerateScenarioDto } from '../src/scenario/scenario.module';

const pipe = new ValidationPipe({ transform: true, whitelist: true });
const meta = { type: 'body' as const, metatype: GenerateScenarioDto };
const base = { user_id: 'u1', start: { lat: 37.57, lng: 126.98 }, wishlist: [{ content_id: '101' }] };

describe('GenerateScenarioDto', () => {
  it('wishlist_only를 그대로 통과시킨다', async () => {
    const dto = await pipe.transform({ ...base, wishlist_only: true }, meta);
    expect(dto.wishlist_only).toBe(true);
  });

  it('없으면 비워 둬 AI 기본값(채움)으로 간다', async () => {
    const dto = await pipe.transform({ ...base }, meta);
    expect(dto.wishlist_only).toBeUndefined();
  });

  it('불리언이 아니면 거절한다', async () => {
    await expect(pipe.transform({ ...base, wishlist_only: 'yes' }, meta)).rejects.toBeDefined();
  });
});
