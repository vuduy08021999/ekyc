import { Router } from 'express';
import { z } from 'zod';
import { validateBody } from '../../middleware/validation';
import { FaceService } from './face.service';
import { GeminiFaceProvider } from './face.gemini-provider';
import { createSuccessResponse } from '../../common/dto/api-response.dto';
import { MAX_GEMINI_RETRIES, MAX_GEMINI_TIMEOUT_MS } from '../../common/types/gemini';

const provider = new GeminiFaceProvider();
const service = new FaceService(provider);

const baseGeminiSchema = z.object({
  geminiApiKey: z.string().min(1),
  prompt: z.string().min(1),
  model: z.string().min(1),
  requestId: z.string().min(1).optional(),
  aiRequestTimeoutMs: z.number().int().min(1).max(MAX_GEMINI_TIMEOUT_MS),
  aiMaxRetries: z.number().int().min(0).max(MAX_GEMINI_RETRIES),
});

const compareSchema = baseGeminiSchema.extend({
  sourceImageBase64: z.string().min(1),
  targetImageBase64: z.string().min(1),
});

const validateSchema = baseGeminiSchema.extend({
  imageBase64: z.string().min(1),
});

export const faceRouter = Router();

faceRouter.post(
  '/compare',
  validateBody(compareSchema),
  async (req, res, next) => {
    try {
      const requestId = (req as any).requestId as string | undefined;
      const result = await service.compareFaces(req.body);
      res.status(200).json(createSuccessResponse(result, 'OK', 'Face compare success', requestId));
    } catch (error) {
      next(error);
    }
  },
);

faceRouter.post(
  '/validate',
  validateBody(validateSchema),
  async (req, res, next) => {
    try {
      const requestId = (req as any).requestId as string | undefined;
      const result = await service.validateFace(req.body);
      res.status(200).json(createSuccessResponse(result, 'OK', 'Face validate success', requestId));
    } catch (error) {
      next(error);
    }
  },
);
