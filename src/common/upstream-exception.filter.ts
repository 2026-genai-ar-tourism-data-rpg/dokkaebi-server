// ============================================================
// [v1] 업스트림 예외 필터 — AI 백엔드 오류를 앱이 이해할 수 있게 전달
// pipeline: 게임 백엔드 / 공통 (에러 계약)
// 구현(요약): dokkaebi-ai 호출(axios)이 실패하면 그 상태코드·에러 바디를 그대로 앞단에 넘긴다.
//            이게 없으면 AI가 준 422("반경 내 관광지 없음")가 전부 500 Internal server error로
//            뭉개져, 앱이 '사용자가 고칠 수 있는 실패'와 '서버 장애'를 구분하지 못한다.
//            AI가 죽었거나(ECONNREFUSED) 응답이 없으면 503으로 정규화한다.
// 구현일: 2026-08-04 | 작성: kys (upstream-errors/kys/v1)
// ============================================================
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { AxiosError } from 'axios';

/** 앱이 분기할 수 있는 에러 코드(문자열 계약). */
const CODE_UPSTREAM_DOWN = 'upstream_unavailable';
const CODE_UPSTREAM_ERROR = 'upstream_error';

/** axios 오류인지 — instanceof는 번들 경계에서 어긋날 수 있어 형태로 판별한다. */
function isAxiosError(e: unknown): e is AxiosError {
  return Boolean(e) && (e as AxiosError).isAxiosError === true;
}

@Catch()
export class UpstreamExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(UpstreamExceptionFilter.name);

  constructor(private readonly adapterHost: HttpAdapterHost) {}

  /** 예외 → HTTP 응답. AI 오류는 원래 의미를 보존해 내려보낸다. */
  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.adapterHost;
    const ctx = host.switchToHttp();
    const res = ctx.getResponse();

    // NestJS 표준 예외(401/403/404 등)는 그대로 둔다.
    if (exception instanceof HttpException) {
      httpAdapter.reply(res, exception.getResponse(), exception.getStatus());
      return;
    }

    if (isAxiosError(exception)) {
      const status = exception.response?.status;
      const body = exception.response?.data;

      if (status) {
        // AI가 구조화된 에러({error:{code,message}})를 줬으면 그대로 전달.
        this.logger.warn(`AI 백엔드 ${status}: ${JSON.stringify(body)?.slice(0, 200)}`);
        httpAdapter.reply(
          res,
          body ?? { error: { code: CODE_UPSTREAM_ERROR, message: 'AI 백엔드 오류' } },
          status,
        );
        return;
      }

      // 응답 자체가 없음 = AI가 안 떠 있거나 네트워크 단절.
      this.logger.error(`AI 백엔드 연결 실패: ${exception.code ?? exception.message}`);
      httpAdapter.reply(
        res,
        {
          error: {
            code: CODE_UPSTREAM_DOWN,
            message: 'AI 백엔드에 연결할 수 없느니라. 잠시 후 다시 시도해다오.',
          },
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
      return;
    }

    // 그 외 미처리 예외 — 트레이스는 로그로만, 응답엔 일반 메시지.
    this.logger.error('미처리 예외', exception instanceof Error ? exception.stack : String(exception));
    httpAdapter.reply(
      res,
      { error: { code: 'internal_error', message: '서버에 예기치 못한 문제가 생겼느니라.' } },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}
