// ============================================================
// [v1] DB 엔티티 — 유저·시나리오·플레이런·방문·조각·도감
// pipeline: 게임 백엔드 / 영속 계층 (TypeORM)
// 구현(요약): 게스트 유저, 생성된 시나리오(노드 원본 JSON), 시나리오 1회 플레이(run),
//            노드 GPS 방문 기록, 조각 획득(중복 방지 유니크), 도깨비 도감 수집.
//            조각·방문은 run 단위라 같은 시나리오를 다시 플레이하면 처음부터 시작된다.
// 구현일: 2026-08-02 | 작성: kys (quest-api/kys/v1) · 이슈 #8
// ============================================================
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/** 플레이 진행 상태 — 기획 상태머신(ARRIVED → … → REWARDED). */
export type RunState = 'IN_PROGRESS' | 'COMPLETED';

/** 게스트/소셜 유저. user_id는 auth가 발급한 문자열 그대로 PK. */
@Entity('users')
export class User {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  user_id: string;

  @Column({ type: 'varchar', length: 64 })
  nickname: string;

  /** 누적 경험치 — 조각 획득·완주 보상으로 증가. */
  @Column({ type: 'int', default: 0 })
  exp: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

/**
 * AI가 생성한 시나리오 원본. node_sequence·route_tree를 통째로 보관한다.
 * 퀘스트 판정(노드 좌표·반경·requires·fragment_id)이 전부 여기서 나오므로
 * 저장하지 않으면 게임 루프가 성립하지 않는다.
 */
@Entity('scenarios')
export class Scenario {
  @PrimaryColumn({ type: 'varchar', length: 128 })
  scenario_id: string;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'varchar', length: 64 })
  region: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  created_by: string | null;

  @Column({ type: 'int', default: 0 })
  stone_total: number;

  /** ScenarioGenResponse 전문(JSON). 노드 배열·분기 트리 포함. */
  @Column({ type: 'simple-json' })
  payload: Record<string, unknown>;

  @CreateDateColumn()
  created_at: Date;
}

/** 시나리오 1회 플레이. 같은 유저가 같은 시나리오를 여러 번 돌 수 있다. */
@Entity('quest_runs')
@Index(['user_id', 'scenario_id'])
export class QuestRun {
  @PrimaryGeneratedColumn('uuid')
  run_id: string;

  @Column({ type: 'varchar', length: 64 })
  user_id: string;

  @Column({ type: 'varchar', length: 128 })
  scenario_id: string;

  @Column({ type: 'varchar', length: 32, default: 'IN_PROGRESS' })
  state: RunState;

  /** 분기 선택 기록 {branch_point_node_id: choice_id} — next_node_id 산출에 쓴다. */
  @Column({ type: 'simple-json', nullable: true })
  choices: Record<string, string> | null;

  @CreateDateColumn()
  started_at: Date;

  // ⚠️ 타입 명시 필수 — `Date | null` 유니온은 리플렉션이 Object로 읽어 매핑에 실패한다.
  @Column({ type: 'timestamp', nullable: true })
  completed_at: Date | null;
}

/** 노드 GPS 인증 기록. 조각 획득의 전제조건(미인증 노드에선 획득 불가). */
@Entity('node_visits')
@Unique(['run_id', 'node_id'])
export class NodeVisit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 64 })
  run_id: string;

  @Column({ type: 'varchar', length: 128 })
  node_id: string;

  /** 인증 당시 노드까지의 실제 거리(m) — 감사·디버깅용. */
  @Column({ type: 'float' })
  distance_m: number;

  @CreateDateColumn()
  verified_at: Date;

  /**
   * 노드 완료·보상 지급 시각. null이면 아직 미지급.
   * complete를 멱등하게 만들어 같은 노드 반복 호출로 경험치를 파밍하는 것을 막는다.
   */
  @Column({ type: 'timestamp', nullable: true })
  completed_at: Date | null;
}

/** 기억석 조각 획득. (run, fragment) 유니크로 DB 레벨 중복 획득 차단. */
@Entity('fragment_collects')
@Unique(['run_id', 'fragment_id'])
export class FragmentCollect {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 64 })
  run_id: string;

  @Column({ type: 'varchar', length: 128 })
  node_id: string;

  @Column({ type: 'varchar', length: 128 })
  fragment_id: string;

  @CreateDateColumn()
  collected_at: Date;
}

/** 도깨비 도감 — 시나리오에서 만난 NPC를 유저 단위로 수집. */
@Entity('dex_entries')
@Unique(['user_id', 'npc_name'])
export class DexEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 64 })
  user_id: string;

  @Column({ type: 'varchar', length: 128 })
  npc_name: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  region: string | null;

  @CreateDateColumn()
  discovered_at: Date;
}

/** 협력/경쟁 모드 — 조각을 나눠 먹는지, 경쟁하는지. */
export type PartyMode = 'coop' | 'versus';

/** 파티(멀티 플레이 방). 초대 코드로 입장한다. */
@Entity('parties')
export class Party {
  @PrimaryGeneratedColumn('uuid')
  party_id: string;

  /** 초대 코드 — 사람이 불러줄 수 있게 짧게. 유니크. */
  @Column({ type: 'varchar', length: 8, unique: true })
  code: string;

  @Column({ type: 'varchar', length: 64 })
  region_id: string;

  @Column({ type: 'varchar', length: 16, default: 'coop' })
  mode: PartyMode;

  /** 같이 돌 시나리오. 방 만들 때 안 정했으면 null. */
  @Column({ type: 'varchar', length: 128, nullable: true })
  scenario_id: string | null;

  @Column({ type: 'varchar', length: 64 })
  host_user_id: string;

  @CreateDateColumn()
  created_at: Date;
}

/** 파티 참가자. (party, user) 유니크로 같은 사람이 두 번 안 들어간다. */
@Entity('party_members')
@Unique(['party_id', 'user_id'])
export class PartyMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 64 })
  party_id: string;

  @Column({ type: 'varchar', length: 64 })
  user_id: string;

  @Column({ type: 'varchar', length: 64 })
  nickname: string;

  @CreateDateColumn()
  joined_at: Date;
}

/** 전체 엔티티 목록 — TypeORM 등록용 단일 소스. */
export const ENTITIES = [
  User, Scenario, QuestRun, NodeVisit, FragmentCollect, DexEntry, Party, PartyMember,
];
