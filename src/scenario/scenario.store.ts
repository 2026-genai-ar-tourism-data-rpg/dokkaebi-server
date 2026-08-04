// ============================================================
// [v1] 시나리오 저장소 — 생성 결과 영속 + 노드 조회
// pipeline: 게임 백엔드 / 시나리오 (퀘스트 판정의 데이터 원천)
// 구현(요약): AI 생성 결과를 통째로 저장하고, 퀘스트가 필요로 하는 노드 정보
//            (좌표·trigger_radius·requires·grants·fragment_id·route_tree)를 꺼내 준다.
//            저장하지 않으면 verify-location이 노드 좌표를 알 수 없어 게임 루프가 성립 안 함.
// 구현일: 2026-08-02 | 작성: kys (quest-api/kys/v1) · 이슈 #8
// ============================================================
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Scenario } from '../database/entities';

/** 시나리오 노드 1개 — AI ScenarioGenResponse.node_sequence 원소(필요한 필드만 명시). */
export interface ScenarioNode {
  node_id: string;
  name?: string;
  kind?: string;
  map_x?: number; // 경도
  map_y?: number; // 위도
  trigger_radius_m?: number;
  fragment_id?: string | null;
  stone_no?: number | null;
  is_finale?: boolean;
  requires?: string[];
  requires_mode?: string;
  grants?: string[];
  npc?: { name?: string } | null;
  path_id?: string;
  [key: string]: unknown;
}

/** route_tree 간선 — {next, choices?}. */
interface RouteEdge {
  next?: string | null;
  choices?: { choice_id: string; next_node_id: string }[];
}

@Injectable()
export class ScenarioStore {
  constructor(
    @InjectRepository(Scenario) private readonly repo: Repository<Scenario>,
  ) {}

  /** AI 생성 결과를 저장(같은 scenario_id면 덮어씀 — 생성이 결정적이라 내용 동일). */
  async save(payload: Record<string, unknown>): Promise<Scenario> {
    const entity = this.repo.create({
      scenario_id: String(payload.scenario_id),
      title: String(payload.title ?? ''),
      region: String(payload.region ?? ''),
      created_by: (payload.created_by as string) ?? null,
      stone_total: Number(payload.stone_total ?? 0),
      payload,
    });
    return this.repo.save(entity);
  }

  /** 시나리오 조회(없으면 404). */
  async get(scenarioId: string): Promise<Scenario> {
    const found = await this.repo.findOne({ where: { scenario_id: scenarioId } });
    if (!found) throw new NotFoundException(`시나리오 ${scenarioId}를 찾을 수 없느니라.`);
    return found;
  }

  /** 시나리오의 노드 배열. */
  nodes(scenario: Scenario): ScenarioNode[] {
    return (scenario.payload?.node_sequence as ScenarioNode[]) ?? [];
  }

  /** 노드 1개 조회(없으면 404). */
  node(scenario: Scenario, nodeId: string): ScenarioNode {
    const found = this.nodes(scenario).find((n) => n.node_id === nodeId);
    if (!found) {
      throw new NotFoundException(`노드 ${nodeId}가 시나리오에 없느니라.`);
    }
    return found;
  }

  /**
   * 피날레 입장 게이트 — 피날레의 hard requires에 걸린 조각들.
   * 피날레 '자기 조각'은 여기 포함되지 않는다(자기 자신을 요구하지 않으므로).
   * (AI가 본선 기준으로 계산해 주고, 샛길은 대체 노드의 조각을 승계한다 — ai#38)
   */
  finaleGateFragments(scenario: Scenario): string[] {
    const finale = this.nodes(scenario).find((n) => n.is_finale);
    const refs = (finale?.requires ?? []).filter((r) => r.startsWith('fragment:'));
    return refs.map((r) => r.slice('fragment:'.length));
  }

  /**
   * 이 시나리오에서 모을 수 있는 조각 총수 — 앱의 "N/5" 분모.
   * 피날레 게이트(4)와 다르다: 게이트는 '피날레를 열기 위해' 필요한 수고,
   * 이 값은 피날레 자기 조각까지 포함한 전체다. 분기 샛길은 본선 조각을 승계하므로
   * 어느 갈래로 가도 총수가 같다(중복 제거).
   */
  totalFragments(scenario: Scenario): number {
    const ids = new Set(
      this.nodes(scenario)
        .map((n) => n.fragment_id)
        .filter((id): id is string => Boolean(id)),
    );
    return ids.size || Number(scenario.stone_total ?? 0);
  }

  /**
   * 다음 노드 id — 분기 선택(choices)을 반영해 route_tree를 한 칸 전진.
   * 선형(route_tree 없음)이면 node_sequence 순서를 따른다.
   */
  nextNodeId(
    scenario: Scenario,
    nodeId: string,
    choices: Record<string, string> = {},
  ): string | null {
    const tree = scenario.payload?.route_tree as
      | { nodes?: Record<string, RouteEdge> }
      | null
      | undefined;

    if (tree?.nodes) {
      const edge = tree.nodes[nodeId];
      if (!edge) return null;
      const picked = choices[nodeId];
      if (picked && edge.choices) {
        const hit = edge.choices.find((c) => c.choice_id === picked);
        if (hit) return hit.next_node_id;
      }
      return edge.next ?? null;
    }

    const seq = this.nodes(scenario);
    const idx = seq.findIndex((n) => n.node_id === nodeId);
    return idx >= 0 && idx + 1 < seq.length ? seq[idx + 1].node_id : null;
  }
}
