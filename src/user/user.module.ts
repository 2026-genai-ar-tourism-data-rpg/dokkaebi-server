// ============================================================
// [v2] 유저 모듈 — 진행 상태(/me)
// pipeline: 게임 백엔드 / 유저
// 구현(요약): DB에서 경험치·레벨·등급·도감 수·조각 진행도를 실제로 집계한다.
//            v1은 전부 고정값(u_demo/level 1/exp 0)이라 누가 로그인해도 같은 화면이었다.
// 구현일: 2026-06-10 (실구현: 2026-08-04) | 작성: kys (base-pipeline/kys/v1) · 이슈 #8
// ============================================================
import { Controller, Get, Injectable, Module, NotFoundException, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { AuthModule, TokenPayload } from '../auth/auth.module';
import { DexEntry, FragmentCollect, QuestRun, Scenario, User } from '../database/entities';

/**
 * 탐사 등급 — 레벨 구간별 호칭. 기획 문구라 코드 상수로 둔다(수치는 config).
 * 위에서부터 처음 걸리는 것을 쓴다(내림차순 유지 필수).
 */
const TIERS: ReadonlyArray<{ minLevel: number; name: string }> = [
  { minLevel: 20, name: '기억의 수호자' },
  { minLevel: 10, name: '숙련 탐사자' },
  { minLevel: 5, name: '중급 탐사자' },
  { minLevel: 1, name: '초급 탐사자' },
];

/** 유저 진행 데이터 (UserProgress). */
@Injectable()
export class UserService {
  constructor(
    private readonly config: ConfigService,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(DexEntry) private readonly dex: Repository<DexEntry>,
    @InjectRepository(QuestRun) private readonly runs: Repository<QuestRun>,
    @InjectRepository(FragmentCollect) private readonly fragments: Repository<FragmentCollect>,
    @InjectRepository(Scenario) private readonly scenarios: Repository<Scenario>,
  ) {}

  /** 경험치 → 레벨(1-base). config.progression.expPerLevel 기준. */
  private levelOf(exp: number): number {
    const per = this.config.get<number>('progression.expPerLevel') ?? 500;
    return Math.floor(exp / per) + 1;
  }

  /** 레벨 → 탐사 등급 호칭. */
  private tierOf(level: number): string {
    return TIERS.find((t) => level >= t.minLevel)?.name ?? TIERS[TIERS.length - 1].name;
  }

  /**
   * 내 진행 상태 — 경험치·레벨·도감·조각 진행도를 실제 DB에서 집계.
   *
   * memory_stone_progress는 지역별 {collected, total}이다. 앱이 "종로 3/5"로 쓴다.
   * 분모는 내가 플레이한 시나리오의 조각 총수 합 — 아직 안 돌아본 지역은
   * 분모가 없으므로 목록에 넣지 않는다(0/0을 그리지 않게).
   */
  async me(userId: string) {
    const user = await this.users.findOne({ where: { user_id: userId } });
    if (!user) throw new NotFoundException('유저를 찾을 수 없느니라.');

    const level = this.levelOf(user.exp);

    const [dexCount, runs] = await Promise.all([
      this.dex.count({ where: { user_id: userId } }),
      this.runs.find({ where: { user_id: userId } }),
    ]);

    // 지역별 조각 진행도 — run 단위로 시나리오를 찾아 지역에 합산.
    const progress: Record<string, { collected: number; total: number }> = {};
    for (const run of runs) {
      const scenario = await this.scenarios.findOne({
        where: { scenario_id: run.scenario_id },
      });
      if (!scenario) continue;
      const collected = await this.fragments.count({ where: { run_id: run.run_id } });
      const bucket = (progress[scenario.region] ??= { collected: 0, total: 0 });
      bucket.collected += collected;
      bucket.total += scenario.stone_total;
    }

    const completedRuns = runs.filter((r) => r.state === 'COMPLETED').length;
    // 방문률 = 완주한 코스 / 시작한 코스(%). 시작한 게 없으면 0.
    const visitRate = runs.length > 0 ? Math.round((completedRuns / runs.length) * 100) : 0;

    return {
      user_id: user.user_id,
      nickname: user.nickname,
      tier: this.tierOf(level),
      level,
      exp: user.exp,
      visit_rate: visitRate,
      dex_count: dexCount,
      runs_total: runs.length,
      runs_completed: completedRuns,
      memory_stone_progress: progress,
    };
  }
}

@ApiTags('user')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('me')
export class UserController {
  constructor(private readonly user: UserService) {}

  /** 내 진행 상태 */
  @Get()
  me(@CurrentUser() current: TokenPayload) {
    return this.user.me(current.sub);
  }
}

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([User, DexEntry, QuestRun, FragmentCollect, Scenario]),
  ],
  controllers: [UserController],
  providers: [UserService],
})
export class UserModule {}
