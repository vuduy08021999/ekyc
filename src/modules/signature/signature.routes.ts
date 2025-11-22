import { Router } from 'express';
import { z } from 'zod';
import { validateBody } from '../../middleware/validation';
import { SignatureService } from './signature.service';
import { createSuccessResponse } from '../../common/dto/api-response.dto';
import { createP12Schema, listQuerySchema } from './signature.validation';

const service = new SignatureService();
export const signatureRouter = Router();

// Create P12
signatureRouter.post(
  '/p12',
  validateBody(createP12Schema),
  async (req, res, next) => {
    try {
      const requestId = (req as any).requestId as string | undefined;
      const body = req.body as any;
      const meta = await service.createP12(body);
      res.status(200).json(createSuccessResponse(meta, 'OK', 'P12 created', requestId));
    } catch (err) {
      next(err);
    }
  },
);

// Count by prefix
signatureRouter.get('/p12/count', async (req, res, next) => {
  try {
    const prefixRaw = (req.query.prefix as string) || '';
    const prefix = prefixRaw;
    const count = await service.countByPrefix(prefix);
    res.status(200).json(createSuccessResponse({ prefix, count }, 'OK', 'Count result', (req as any).requestId));
  } catch (err) {
    next(err);
  }
});

// List by prefix (with pagination)
signatureRouter.get('/p12', async (req, res, next) => {
  try {
    const parsed = listQuerySchema.parse({
      prefix: req.query.prefix as string | undefined,
      limit: req.query.limit as unknown as number | undefined,
      offset: req.query.offset as unknown as number | undefined,
      details: req.query.details as unknown as boolean | undefined,
    });
    const { prefix, limit, offset, details } = parsed;
    const result = await service.listByPrefix(prefix, { limit, offset, details });
    res.status(200).json(createSuccessResponse(result, 'OK', 'List result', (req as any).requestId));
  } catch (err) {
    next(err);
  }
});

// Delete
signatureRouter.delete('/p12/:ekycId', async (req, res, next) => {
  try {
    const ekycId = req.params.ekycId as string;
    const result = await service.deleteByEkycId(ekycId);
    res.status(200).json(createSuccessResponse(result, 'OK', 'Deleted', (req as any).requestId));
  } catch (err) {
    next(err);
  }
});
