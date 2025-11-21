import { Request, Response, NextFunction } from 'express';
import { ZodTypeAny } from 'zod';
import { AppError } from '../common/errors/app-error';

export function validateBody(schema: ZodTypeAny) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Request body validation failed', result.error.format());
    }
    req.body = result.data;
    next();
  };
}
