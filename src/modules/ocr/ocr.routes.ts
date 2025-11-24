import { Router } from 'express';
import { z } from 'zod';
import { validateBody } from '../../middleware/validation';
import { OcrService } from './ocr.service';
import { GeminiOcrProvider } from './ocr.gemini-provider';
import { createSuccessResponse } from '../../common/dto/api-response.dto';
import { MAX_GEMINI_RETRIES, MAX_GEMINI_TIMEOUT_MS } from '../../common/types/gemini';

const provider = new GeminiOcrProvider();
const service = new OcrService(provider);

const baseGeminiSchema = z.object({
  geminiApiKey: z.string().min(1),
  prompt: z.string().min(1),
  model: z.string().min(1),
  requestId: z.string().min(1).optional(),
  aiRequestTimeoutMs: z.number().int().min(1).max(MAX_GEMINI_TIMEOUT_MS),
  aiMaxRetries: z.number().int().min(0).max(MAX_GEMINI_RETRIES),
});

const idCardSchema = baseGeminiSchema.extend({
  imageBase64: z.string().min(1),
  documentSide: z.enum(['FRONT', 'BACK']).default('FRONT'),
});

const driverLicenseSchema = baseGeminiSchema.extend({
  imageBase64: z.string().min(1),
  documentSide: z.enum(['FRONT', 'BACK']).default('FRONT'),
});

export const ocrRouter = Router();

ocrRouter.post(
  '/id-card',
  validateBody(idCardSchema),
  async (req, res, next) => {
    try {
      const requestId = (req as any).requestId as string | undefined;
      const result = await service.processIdCardOcr(req.body);
      res.status(200).json(createSuccessResponse(result, 'OK', 'OCR ID card success', requestId));
    } catch (error) {
      next(error);
    }
  },
);

ocrRouter.post(
  '/driver-license',
  validateBody(driverLicenseSchema),
  async (req, res, next) => {
    try {
      const requestId = (req as any).requestId as string | undefined;
      const result = await service.processDriverLicenseOcr(req.body);
      res.status(200).json(createSuccessResponse(result, 'OK', 'OCR driver license success', requestId));
    } catch (error) {
      next(error);
    }
  },
);
