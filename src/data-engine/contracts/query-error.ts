import { HttpException, HttpStatus } from '@nestjs/common';
export type QueryErrorCode = 'AGENT_OFFLINE' | 'QUERY_INVALID' | 'QUERY_TIMEOUT' |
  'SOURCE_UNAVAILABLE' | 'SOURCE_SCHEMA_MISMATCH' | 'PERMISSION_DENIED' |
  'RATE_LIMITED' | 'RESULT_TOO_LARGE' | 'NOT_CONFIGURED' | 'INTERNAL_ERROR';
export interface QueryError {
  queryId?: string;
  requestId: string;
  code: QueryErrorCode;
  message: string;
  retryable: boolean;
  details?: Record<string, string>;
}
const HTTP_STATUS: Partial<Record<QueryErrorCode, number>> = {
  QUERY_INVALID: HttpStatus.BAD_REQUEST,
  PERMISSION_DENIED: HttpStatus.FORBIDDEN,
  NOT_CONFIGURED: HttpStatus.UNPROCESSABLE_ENTITY,
  AGENT_OFFLINE: HttpStatus.SERVICE_UNAVAILABLE,
  QUERY_TIMEOUT: HttpStatus.GATEWAY_TIMEOUT,
  SOURCE_UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
  RATE_LIMITED: HttpStatus.TOO_MANY_REQUESTS,
};
export class QueryFailure extends HttpException {
  constructor(public readonly code: QueryErrorCode, message: string, requestId = '', public readonly retryable = false) {
    super({ requestId, code, message, retryable } satisfies QueryError, HTTP_STATUS[code] ?? HttpStatus.INTERNAL_SERVER_ERROR);
  }
}
