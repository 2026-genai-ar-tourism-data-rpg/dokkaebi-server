// ============================================================
// [v1] 유저 모듈 — 진행 상태(/me)
// pipeline: 게임 백엔드 / 유저
// 구현(요약): UserController + UserService (탐사등급·방문률·도감 스텁)
// 구현일: 2026-06-10 | 작성: kys (base-pipeline/kys/v1)
// ============================================================
import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

/** 유저 진행 데이터 (UserProgress). 담당: 이지선(데이터 조회). */
@Injectable()
export class UserService {
  /** 내 진행 상태 조회 */
  async me() {
    // TODO(이지선): DB에서 탐사등급·경험치·방문률·도감·기억석 복원도 집계
    return {
      user_id: 'u_demo',
      tier: '초급 탐사자',
      level: 1,
      exp: 0,
      visit_rate: 0,
      dex_count: 0,
      memory_stone_progress: {},
    };
  }
}

@ApiTags('user')
@Controller('me')
export class UserController {
  constructor(private readonly user: UserService) {}

  /** 내 진행 상태 */
  @Get()
  me() {
    return this.user.me();
  }
}

@Module({ controllers: [UserController], providers: [UserService] })
export class UserModule {}
