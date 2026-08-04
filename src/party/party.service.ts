// ============================================================
// [v2] 파티 서비스 — 멀티 파티 로직
// pipeline: 게임 백엔드 / 파티 (멀티 협력·경쟁)
// 구현(요약): 초대 코드 발급 → DB 영속 → 코드로 입장(정원·중복·존재 검증).
//            v1은 party_id='p_demo', code='ABCD' 고정이라 누가 만들어도 같은 방이었고
//            입장 검증이 없어 없는 코드로도 들어가졌다.
// 구현일: 2026-06-10 (실구현: 2026-08-04) | 작성: kys (base-pipeline/kys/v1) · 이슈 #8
// ============================================================
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomInt } from 'crypto';
import { Repository } from 'typeorm';

import { Party, PartyMember, PartyMode, User } from '../database/entities';

/**
 * 초대 코드 알파벳 — 헷갈리는 글자를 뺐다.
 * 0/O, 1/I/L은 구두로 불러줄 때 자주 틀린다("공유하기"보다 말로 알려주는 경우가 많다).
 */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** 코드 충돌 시 재시도 횟수. 4자면 31^4 ≈ 92만이라 현실적으로 거의 안 걸린다. */
const CODE_MAX_ATTEMPTS = 10;

@Injectable()
export class PartyService {
  constructor(
    private readonly config: ConfigService,
    @InjectRepository(Party) private readonly parties: Repository<Party>,
    @InjectRepository(PartyMember) private readonly members: Repository<PartyMember>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  private get maxMembers(): number {
    return this.config.get<number>('party.maxMembers') ?? 4;
  }

  /** 사람이 부르기 쉬운 초대 코드 생성(헷갈리는 글자 제외). */
  private randomCode(): string {
    const len = this.config.get<number>('party.codeLength') ?? 4;
    let out = '';
    for (let i = 0; i < len; i++) {
      out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    }
    return out;
  }

  /** 파티 생성(초대 코드 발급). 만든 사람이 첫 멤버로 들어간다. */
  async create(
    userId: string,
    opts: { region_id?: string; mode?: PartyMode; scenario_id?: string } = {},
  ) {
    const user = await this.users.findOne({ where: { user_id: userId } });
    if (!user) throw new NotFoundException('유저를 찾을 수 없느니라.');

    // 유니크 제약에 걸리면 다른 코드로 재시도 — 경쟁 조건에서도 안전하다.
    let party: Party | null = null;
    for (let attempt = 0; attempt < CODE_MAX_ATTEMPTS; attempt++) {
      try {
        party = await this.parties.save(
          this.parties.create({
            code: this.randomCode(),
            region_id: opts.region_id ?? '종로',
            mode: opts.mode ?? 'coop',
            scenario_id: opts.scenario_id ?? null,
            host_user_id: userId,
          }),
        );
        break;
      } catch {
        party = null; // 코드 충돌 → 재시도
      }
    }
    if (!party) {
      throw new ConflictException('초대 코드를 발급하지 못했느니라. 다시 시도해다오.');
    }

    await this.members.save(
      this.members.create({ party_id: party.party_id, user_id: userId, nickname: user.nickname }),
    );
    return this.state(party);
  }

  /** 초대 코드로 입장 — 존재·정원·중복을 검증한다. */
  async join(code: string, userId: string) {
    const user = await this.users.findOne({ where: { user_id: userId } });
    if (!user) throw new NotFoundException('유저를 찾을 수 없느니라.');

    const party = await this.parties.findOne({ where: { code: code.toUpperCase() } });
    if (!party) throw new NotFoundException(`그런 초대 코드는 없느니라: ${code}`);

    const current = await this.members.count({ where: { party_id: party.party_id } });
    const already = await this.members.findOne({
      where: { party_id: party.party_id, user_id: userId },
    });

    // 이미 들어와 있으면 재입장은 성공으로 본다(앱 재시작·네트워크 재시도).
    if (!already) {
      if (current >= this.maxMembers) {
        throw new BadRequestException(`파티가 가득 찼느니라 (최대 ${this.maxMembers}인).`);
      }
      await this.members.save(
        this.members.create({ party_id: party.party_id, user_id: userId, nickname: user.nickname }),
      );
    }
    return this.state(party);
  }

  /** 파티 현재 상태 조회(멤버 목록 포함). */
  async get(partyId: string) {
    const party = await this.parties.findOne({ where: { party_id: partyId } });
    if (!party) throw new NotFoundException('파티를 찾을 수 없느니라.');
    return this.state(party);
  }

  /** 응답 형태 — 앱·게이트웨이가 같은 모양을 쓰도록 한 곳에서 만든다. */
  private async state(party: Party) {
    const members = await this.members.find({
      where: { party_id: party.party_id },
      order: { joined_at: 'ASC' },
    });
    return {
      party_id: party.party_id,
      code: party.code,
      region_id: party.region_id,
      mode: party.mode,
      scenario_id: party.scenario_id,
      host_user_id: party.host_user_id,
      max_members: this.maxMembers,
      members: members.map((m) => ({
        user_id: m.user_id,
        nickname: m.nickname,
        is_host: m.user_id === party.host_user_id,
      })),
    };
  }
}
