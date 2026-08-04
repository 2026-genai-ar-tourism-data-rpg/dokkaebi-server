// ============================================================
// [v2] 퀘스트 서비스 — 게임 루프 실구현 (상태머신 ARRIVED→REWARDED)
// pipeline: 게임 백엔드 / 퀘스트 (GPS 판정·조각 획득·보상)
// 구현(요약): run 시작 → 노드 GPS 인증(하버사인+반경+스푸핑) → 조각 획득(원자 선점+게이트)
//            → 노드 완료(보상 트랜잭션·도감·다음 노드). 판정 수치는 전부 config.quest.
//            v1은 전부 더미 반환이라 5km 밖에서도 인증됐다(이슈 #8).
//            조각 중복 방지는 DB 유니크 제약 단독 — 근거는 collectFragment 주석 참고.
// 구현일: 2026-06-10 (실구현: 2026-08-02 · 중복방지 일원화: 2026-08-04) | 작성: kys
// ============================================================
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { isWithinRadius, speedMps } from '../common/geo';
import {
  DexEntry,
  FragmentCollect,
  NodeVisit,
  QuestRun,
  User,
} from '../database/entities';
import { RedisService } from '../redis/redis.service';
import { ScenarioNode, ScenarioStore } from '../scenario/scenario.store';

/** config.quest 형태 — 판정 수치 단일 소스. */
interface QuestRules {
  triggerRadiusDefaultM: number;
  gpsAccuracyMaxM: number;
  maxSpeedMps: number;
  lastFixTtlSec: number;
  speedCheckMinIntervalSec: number;
  expPerFragment: number;
  expFinaleBonus: number;
}

/** GPS 인증 거절 사유 — 앱이 안내 문구를 고르는 데 쓴다. */
export type VerifyReason =
  | 'OUT_OF_RANGE'
  | 'LOW_ACCURACY'
  | 'IMPOSSIBLE_SPEED'
  | 'NODE_HAS_NO_COORDS';

@Injectable()
export class QuestService {
  private readonly logger = new Logger(QuestService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly store: ScenarioStore,
    private readonly redis: RedisService,
    private readonly dataSource: DataSource,
    @InjectRepository(QuestRun) private readonly runs: Repository<QuestRun>,
    @InjectRepository(NodeVisit) private readonly visits: Repository<NodeVisit>,
    @InjectRepository(FragmentCollect) private readonly fragments: Repository<FragmentCollect>,
  ) {}

  /** 판정 수치(config.quest). 매직넘버를 코드에 두지 않는다. */
  private get rules(): QuestRules {
    return this.config.get<QuestRules>('quest') as QuestRules;
  }

  // ── run 수명주기 ───────────────────────────────────────────

  /** 시나리오 플레이 시작 — run 생성. 같은 시나리오를 여러 번 돌 수 있다. */
  async startRun(userId: string, scenarioId: string) {
    const scenario = await this.store.get(scenarioId);
    const run = await this.runs.save(
      this.runs.create({
        user_id: userId,
        scenario_id: scenarioId,
        state: 'IN_PROGRESS',
        choices: {},
        completed_at: null,
      }),
    );
    const nodes = this.store.nodes(scenario);
    return {
      run_id: run.run_id,
      scenario_id: scenarioId,
      state: run.state,
      entry_node_id:
        ((scenario.payload?.route_tree as { entry_node_id?: string })?.entry_node_id ??
          nodes[0]?.node_id) ?? null,
      required: this.store.totalFragments(scenario),
      progress: 0,
    };
  }

  /** run 조회 — 진행도·수집 목록·방문 목록. 앱 복귀 시 상태 복원용. */
  async getRun(userId: string, runId: string) {
    const run = await this.ownedRun(userId, runId);
    const scenario = await this.store.get(run.scenario_id);
    const [collected, visited] = await Promise.all([
      this.fragments.find({ where: { run_id: runId } }),
      this.visits.find({ where: { run_id: runId } }),
    ]);
    const total = this.store.totalFragments(scenario);
    return {
      run_id: run.run_id,
      scenario_id: run.scenario_id,
      state: run.state,
      choices: run.choices ?? {},
      progress: collected.length,
      required: total,
      collected_fragment_ids: collected.map((c) => c.fragment_id),
      verified_node_ids: visited.map((v) => v.node_id),
      completed_at: run.completed_at,
    };
  }

  /** 내 run인지 확인하고 반환(남의 run 조작 차단). */
  private async ownedRun(userId: string, runId: string): Promise<QuestRun> {
    const run = await this.runs.findOne({ where: { run_id: runId } });
    if (!run) throw new NotFoundException(`플레이 기록 ${runId}를 찾을 수 없느니라.`);
    if (run.user_id !== userId) {
      throw new ForbiddenException('남의 여정에는 손댈 수 없느니라.');
    }
    return run;
  }

  // ── ① GPS 위치 인증 ────────────────────────────────────────

  /**
   * GPS 반경 인증 → [GPS_VERIFIED]. 조각 획득의 전제조건.
   *
   * 판정 순서: 좌표 유무 → GPS 정확도 → 스푸핑(이동속도) → 반경.
   * 스푸핑은 직전 fix(Redis)와의 평균 이동속도로 본다 — 순간이동을 막는다.
   */
  async verifyLocation(
    userId: string,
    runId: string,
    nodeId: string,
    lat: number,
    lng: number,
    accuracyM?: number,
  ) {
    const r = this.rules;
    const run = await this.ownedRun(userId, runId);
    const scenario = await this.store.get(run.scenario_id);
    const node = this.store.node(scenario, nodeId);

    const radiusM = Number(node.trigger_radius_m ?? r.triggerRadiusDefaultM);
    const player = { lat, lng };
    const reject = (reason: VerifyReason, distanceM: number) => ({
      verified: false,
      distance_m: Math.round(distanceM),
      required_radius_m: radiusM,
      state: 'ARRIVED',
      npc_spawned: false,
      reason,
    });

    // 노드에 좌표가 없으면 판정 불가(합성 앵커 등) — 통과시키지 않는다.
    if (typeof node.map_y !== 'number' || typeof node.map_x !== 'number') {
      return reject('NODE_HAS_NO_COORDS', Number.NaN);
    }
    const target = { lat: node.map_y, lng: node.map_x };

    // GPS 정확도가 반경보다 한참 나쁘면 보류 — 실내·터널 오인증 방지.
    if (typeof accuracyM === 'number' && accuracyM > r.gpsAccuracyMaxM) {
      return reject('LOW_ACCURACY', Number.NaN);
    }

    // 스푸핑: 직전 fix 대비 이동속도가 비현실적이면 거절.
    const now = Date.now();
    const last = await this.redis.getLastFix(userId);
    if (last) {
      const elapsedSec = (now - last.atMs) / 1000;
      if (elapsedSec >= r.speedCheckMinIntervalSec) {
        const v = speedMps({ lat: last.lat, lng: last.lng }, player, elapsedSec);
        if (v !== null && v > r.maxSpeedMps) {
          this.logger.warn(
            `스푸핑 의심 user=${userId} ${v.toFixed(1)}m/s > ${r.maxSpeedMps}m/s`,
          );
          await this.redis.setLastFix(userId, { lat, lng, atMs: now }, r.lastFixTtlSec);
          return reject('IMPOSSIBLE_SPEED', isWithinRadius(player, target, radiusM).distanceM);
        }
      }
    }
    await this.redis.setLastFix(userId, { lat, lng, atMs: now }, r.lastFixTtlSec);

    // 반경 판정 — GPS 오차 반경만큼은 관대하게 본다.
    const { within, distanceM } = isWithinRadius(player, target, radiusM, accuracyM ?? 0);
    if (!within) return reject('OUT_OF_RANGE', distanceM);

    // 방문 기록(재인증은 갱신 없이 무시 — 이미 인증된 노드).
    await this.visits
      .insert({ run_id: runId, node_id: nodeId, distance_m: distanceM })
      .catch(() => undefined); // 유니크 충돌 = 이미 인증됨

    return {
      verified: true,
      distance_m: Math.round(distanceM),
      required_radius_m: radiusM,
      state: 'GPS_VERIFIED',
      npc_spawned: true,
      reason: null,
    };
  }

  // ── ② 기억석 조각 획득 ─────────────────────────────────────

  /**
   * AR 기억석 조각 획득 [QUEST_ACTIVE].
   *
   * 게이트: 노드 GPS 인증 완료 → 노드 requires 충족 → 중복 아님.
   * 중복 방지는 DB 유니크 제약 하나로 끝낸다 — 동시 요청도 DB가 직렬화해 준다.
   */
  async collectFragment(userId: string, runId: string, nodeId: string) {
    const run = await this.ownedRun(userId, runId);
    const scenario = await this.store.get(run.scenario_id);
    const node = this.store.node(scenario, nodeId);

    const fragmentId = node.fragment_id;
    if (!fragmentId) {
      throw new BadRequestException('이 자리엔 기억석 조각이 없느니라.');
    }

    // 게이트 1: GPS 인증 선행 필수.
    const visited = await this.visits.findOne({ where: { run_id: runId, node_id: nodeId } });
    if (!visited) {
      throw new ForbiddenException('먼저 그 자리에 당도해야 하느니라. (GPS 미인증)');
    }

    // 게이트 2: 노드 requires 충족(단서 체인·조각 전량).
    const missing = await this.missingRequires(runId, scenario, node);
    if (missing.length > 0) {
      throw new ForbiddenException(`아직 이르니라. 부족한 것: ${missing.join(', ')}`);
    }

    // 게이트 3: 중복 획득 — DB 유니크 제약이 유일한 정합성 근거다.
    //
    // 동시 insert는 선행 트랜잭션이 커밋될 때까지 DB가 대기시켰다가 충돌로 떨군다.
    // 즉 이 지점을 지나면 행의 존재가 보장되므로 진행도를 세도 안전하다.
    //
    // ⚠️ 예전엔 Redis 선점에 실패하면 곧바로 반환했는데, 그러면 선행 insert가
    //    커밋되기 전에 count가 돌아 progress=0이 나갔다(동시 5회 요청 실측).
    //    "이미 획득했다"면서 진행도 0을 주면 앱이 조각 수를 잘못 그린다.
    let already = false;
    try {
      await this.fragments.insert({ run_id: runId, node_id: nodeId, fragment_id: fragmentId });
    } catch {
      already = true; // 유니크 충돌 = 이미 획득함(동시 요청/재시도)
    }
    return this.collectResult(runId, scenario, fragmentId, already);
  }

  /** 조각 획득 응답 조립 — 실제 진행도를 센다(더미 고정값 아님). */
  private async collectResult(
    runId: string,
    scenario: Awaited<ReturnType<ScenarioStore['get']>>,
    fragmentId: string,
    already: boolean,
  ) {
    const progress = await this.fragments.count({ where: { run_id: runId } });
    return {
      fragment_id: fragmentId,
      collected: true,
      already_collected: already,
      progress,
      required: this.store.totalFragments(scenario),
    };
  }

  /**
   * 노드 requires 중 아직 못 채운 것 — 인벤토리는 '지금까지 획득한 조각'에서 만든다.
   * clue는 조각을 준 노드가 함께 지급하므로 grants를 되짚어 인벤토리에 넣는다.
   */
  private async missingRequires(
    runId: string,
    scenario: Awaited<ReturnType<ScenarioStore['get']>>,
    node: ScenarioNode,
  ): Promise<string[]> {
    const requires = node.requires ?? [];
    if (requires.length === 0) return [];

    const collected = await this.fragments.find({ where: { run_id: runId } });
    const collectedIds = new Set(collected.map((c) => c.fragment_id));

    // 인벤토리 = 획득한 조각 + 그 조각을 준 노드가 함께 지급한 단서.
    const inventory = new Set<string>();
    for (const n of this.store.nodes(scenario)) {
      if (n.fragment_id && collectedIds.has(n.fragment_id)) {
        for (const g of n.grants ?? []) inventory.add(g);
      }
    }

    // soft 게이트(단서 체인)는 진행을 막지 않는다 — hard(조각 전량)만 강제.
    const mode = String(node.requires_mode ?? 'none');
    if (mode !== 'hard') return [];
    return requires.filter((ref) => !inventory.has(ref));
  }

  // ── ③ 노드 완료·보상 ───────────────────────────────────────

  /**
   * 노드 완료·보상 [QUEST_COMPLETE → REWARDED].
   *
   * 조각을 획득한 노드만 완료할 수 있다. 보상(경험치·도감)은 한 트랜잭션으로 지급하고,
   * 피날레에서 조각을 전부 모았으면 run을 COMPLETED로 닫는다.
   * choiceId를 주면 분기 선택으로 기록해 next_node_id 산출에 반영한다.
   */
  async complete(userId: string, runId: string, nodeId: string, choiceId?: string) {
    const r = this.rules;
    const run = await this.ownedRun(userId, runId);
    const scenario = await this.store.get(run.scenario_id);
    const node = this.store.node(scenario, nodeId);

    // 완료 검증: 이 노드의 조각을 실제로 획득했어야 한다.
    const fragmentId = node.fragment_id ?? null;
    if (fragmentId) {
      const got = await this.fragments.findOne({
        where: { run_id: runId, fragment_id: fragmentId },
      });
      if (!got) {
        throw new ForbiddenException('아직 기억석 조각을 얻지 못했느니라.');
      }
    }

    // 분기 선택 기록 → 다음 노드 산출에 반영.
    if (choiceId) {
      run.choices = { ...(run.choices ?? {}), [nodeId]: choiceId };
      await this.runs.save(run);
    }

    // 멱등성: 이미 보상을 받은 노드면 다시 지급하지 않는다.
    // (없으면 complete를 반복 호출해 경험치를 무한 파밍할 수 있다)
    const visit = await this.visits.findOne({ where: { run_id: runId, node_id: nodeId } });
    const alreadyRewarded = Boolean(visit?.completed_at);

    const total = this.store.totalFragments(scenario);
    const progress = await this.fragments.count({ where: { run_id: runId } });
    const isFinale = Boolean(node.is_finale);

    // 지역 복원 = 피날레에서 '게이트 조각 전량 + 피날레 자기 조각'까지 모은 상태.
    // 게이트(피날레 requires)만 보면 피날레 조각을 안 캐고도 복원 판정이 나므로 둘 다 본다.
    const gate = this.store.finaleGateFragments(scenario);
    const collectedIds = new Set(
      (await this.fragments.find({ where: { run_id: runId } })).map((c) => c.fragment_id),
    );
    const regionRestored =
      isFinale &&
      gate.every((id) => collectedIds.has(id)) &&
      (!fragmentId || collectedIds.has(fragmentId));

    // 보상 트랜잭션 — 경험치 + 도감 + 완료 표시. 도중 실패하면 전부 롤백.
    // 재호출(alreadyRewarded)이면 지급액 0 — 응답 형태는 그대로 유지해 앱이 분기하지 않게 한다.
    const expGained = alreadyRewarded
      ? 0
      : (fragmentId ? r.expPerFragment : 0) + (regionRestored ? r.expFinaleBonus : 0);

    if (!alreadyRewarded) {
      await this.dataSource.transaction(async (tx) => {
        if (expGained > 0) {
          await tx.increment(User, { user_id: userId }, 'exp', expGained);
        }
        const npcName = node.npc?.name;
        if (npcName) {
          // 도감은 유저 단위 수집 — 이미 있으면 무시(유니크).
          await tx
            .createQueryBuilder()
            .insert()
            .into(DexEntry)
            .values({ user_id: userId, npc_name: npcName, region: scenario.region })
            .orIgnore()
            .execute();
        }
        // 이 노드 보상 지급 완료 표시 → 다음 호출부터 멱등.
        await tx.update(NodeVisit, { run_id: runId, node_id: nodeId }, {
          completed_at: new Date(),
        });
        if (regionRestored) {
          await tx.update(QuestRun, { run_id: runId }, {
            state: 'COMPLETED',
            completed_at: new Date(),
          });
        }
      });
    }

    return {
      state: 'REWARDED',
      exp_gained: expGained,
      already_rewarded: alreadyRewarded,    // 재호출이면 true(지급 0)
      memory_stone_fragment_id: fragmentId, // 실제 시나리오 값(하드코딩 제거)
      rare_relic_id: null,
      dex_entry: node.npc?.name ?? null,
      titles: regionRestored ? [`${scenario.region}의 기억을 되찾은 자`] : [],
      region_restored: regionRestored,
      progress,
      required: total,
      next_node_id: this.store.nextNodeId(scenario, nodeId, {
        ...(run.choices ?? {}),
        ...(choiceId ? { [nodeId]: choiceId } : {}),
      }),
    };
  }
}
