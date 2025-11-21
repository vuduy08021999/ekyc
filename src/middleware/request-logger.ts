import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const incomingRequestId = typeof req.body === 'object' && req.body !== null && typeof (req.body as any).requestId === 'string'
    ? ((req.body as any).requestId as string).trim()
    : undefined;
  const requestId = incomingRequestId && incomingRequestId.length > 0 ? incomingRequestId : randomUUID();
  (req as any).requestId = requestId;

  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(
      `[${requestId}] ${req.method} ${req.originalUrl} - ${res.statusCode} - ${duration}ms`,
    );
  });

  next();
}
