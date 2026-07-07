// ============================================================
// [v1] 퀘스트 DTO — 요청/응답 (OpenAPI 계약과 1:1)
// pipeline: 게임 백엔드 / 퀘스트 (계약)
// 구현(요약): GPS인증·대화·조각획득·보상 DTO. class-validator로 검증
// 구현일: 2026-06-10 | 작성: kys (base-pipeline/kys/v1)
// ============================================================
import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString } from 'class-validator';

/** GPS 위치 인증 요청 */
export class LocationVerifyDto {
  @ApiProperty() @IsNumber() lat: number;
  @ApiProperty() @IsNumber() lng: number;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() accuracy_m?: number;
}

/** NPC 대화 요청 */
export class DialogueDto {
  @ApiProperty() @IsString() node_id: string;
  @ApiProperty({ default: '등장' }) @IsOptional() @IsString() stage?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() user_input?: string;
}
