// ============================================================
// [v2] 퀘스트 DTO — 요청/응답 (OpenAPI 계약과 1:1)
// pipeline: 게임 백엔드 / 퀘스트 (계약)
// 구현(요약): run 시작·GPS인증·대화·조각획득·완료 DTO. class-validator로 검증.
// 구현일: 2026-06-10 (run/complete 추가: 2026-08-02) | 작성: kys (base-pipeline/kys/v1)
// ============================================================
import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString } from 'class-validator';

/** 플레이 시작 요청 — 어떤 시나리오를 돌지. */
export class StartRunDto {
  @ApiProperty() @IsString() scenario_id: string;
}

/** GPS 위치 인증 요청 */
export class LocationVerifyDto {
  @ApiProperty() @IsNumber() lat: number;
  @ApiProperty() @IsNumber() lng: number;
  /** 단말이 보고한 GPS 오차 반경(m). 크면 판정 보류. */
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() accuracy_m?: number;
}

/** NPC 대화 요청 */
export class DialogueDto {
  @ApiProperty() @IsString() node_id: string;
  @ApiProperty({ default: '등장' }) @IsOptional() @IsString() stage?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() user_input?: string;
  /** 장소 표시명. 없으면 AI 프롬프트에 node_id가 장소명으로 박힌다. */
  @ApiProperty({ required: false }) @IsOptional() @IsString() node_name?: string;
}

/** 노드 완료 요청 — 갈림길에서 고른 갈래(choice_id)를 함께 기록한다. */
export class CompleteNodeDto {
  @ApiProperty({ required: false, description: '갈림길 선택 id (main|b1)' })
  @IsOptional()
  @IsString()
  choice_id?: string;
}
