import { Request, Response, NextFunction } from 'express';
import { AppError } from '../common/errors/app-error';
import { createClientErrorResponse, createServerErrorResponse } from '../common/dto/api-response.dto';

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const requestId = (req as any).requestId as string | undefined;

  if (err instanceof AppError) {
    const isClientError = err.httpStatus >= 400 && err.httpStatus < 500;
    const body = isClientError
      ? createClientErrorResponse(err.code, err.message, err.details, requestId)
      : createServerErrorResponse(err.code, err.message, err.details, requestId);

    res.status(200).json(body);
    return;
  }

  console.error('Unexpected error:', err);
  const body = createServerErrorResponse('INTERNAL_ERROR', 'Internal server error', undefined, requestId);
  res.status(200).json(body);
}
