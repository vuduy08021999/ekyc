export type ApiStatus = 'SUCCESS' | 'CLIENT_ERROR' | 'SERVER_ERROR';

export interface ApiResponse<T> {
  status: ApiStatus;
  code: string;
  message: string;
  data?: T | null;
  requestId?: string;
  timestamp: string;
}

export function createSuccessResponse<T>(data: T, code = 'OK', message = 'Success', requestId?: string): ApiResponse<T> {
  const base: ApiResponse<T> = {
    status: 'SUCCESS',
    code,
    message,
    data,
    timestamp: new Date().toISOString(),
  };

  if (requestId !== undefined) {
    base.requestId = requestId;
  }

  return base;
}

export function createClientErrorResponse(code: string, message: string, details?: unknown, requestId?: string): ApiResponse<unknown> {
  const base: ApiResponse<unknown> = {
    status: 'CLIENT_ERROR',
    code,
    message,
    data: details ?? null,
    timestamp: new Date().toISOString(),
  };

  if (requestId !== undefined) {
    base.requestId = requestId;
  }

  return base;
}

export function createServerErrorResponse(code: string, message: string, details?: unknown, requestId?: string): ApiResponse<unknown> {
  const base: ApiResponse<unknown> = {
    status: 'SERVER_ERROR',
    code,
    message,
    data: details ?? null,
    timestamp: new Date().toISOString(),
  };

  if (requestId !== undefined) {
    base.requestId = requestId;
  }

  return base;
}
