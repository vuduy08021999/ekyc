import { SchemaType, type Schema } from '@google/generative-ai';
import { z } from 'zod';
import { generateStructuredJson } from '../../infrastructure/gemini/gemini-json-client';
import { buildInlineImagePart, throwGeminiProviderError } from '../../infrastructure/gemini/gemini-provider-helpers';
import {
  FaceCompareResultDto,
  FaceProvider,
  FaceValidateResultDto,
} from './face.types';

const FACE_COMPARE_PROMPT = `Bạn là hệ thống so khớp khuôn mặt. Ảnh đầu tiên là nguồn (identity gốc), ảnh thứ hai là ảnh cần kiểm tra.
Đánh giá độ giống nhau (similarityScore 0→1) và đặt isMatch = true nếu similarityScore ≥ 0.8. Chỉ trả JSON.`;

const FACE_VALIDATE_PROMPT = `Bạn là hệ thống đánh giá chất lượng ảnh khuôn mặt.
Xác định xem ảnh có phải người thật (isLive) và chấm qualityScore 0→1.
reason phải mô tả ngắn gọn như "OK" hoặc "LOW_QUALITY_OR_NOT_LIVE". Chỉ trả JSON.`;

const faceCompareResponseSchema: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    similarityScore: { type: SchemaType.NUMBER },
    isMatch: { type: SchemaType.BOOLEAN },
  },
  required: ['similarityScore', 'isMatch'],
};

const faceValidateResponseSchema: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    isLive: { type: SchemaType.BOOLEAN },
    qualityScore: { type: SchemaType.NUMBER },
    reason: { type: SchemaType.STRING },
  },
  required: ['isLive', 'qualityScore', 'reason'],
};

const faceCompareResultSchema: z.ZodType<FaceCompareResultDto> = z.object({
  similarityScore: z.number().min(0).max(1),
  isMatch: z.boolean(),
});

const faceValidateResultSchema: z.ZodType<FaceValidateResultDto> = z.object({
  isLive: z.boolean(),
  qualityScore: z.number().min(0).max(1),
  reason: z.string().min(1),
});

export class GeminiFaceProvider implements FaceProvider {
  async compareFaces(params: Parameters<FaceProvider['compareFaces']>[0]): Promise<FaceCompareResultDto> {
    const sourceImage = buildInlineImagePart(params.sourceImageBase64);
    const targetImage = buildInlineImagePart(params.targetImageBase64);

    try {
      return await generateStructuredJson<FaceCompareResultDto>({
        apiKey: params.apiKey,
        model: params.model,
        prompt: FACE_COMPARE_PROMPT,
        images: [sourceImage, targetImage],
        responseSchema: faceCompareResponseSchema,
        timeoutMs: params.aiRequestTimeoutMs,
        maxRetries: params.aiMaxRetries,
        zodSchema: faceCompareResultSchema,
      });
    } catch (error) {
      throwGeminiProviderError('face-compare', error);
    }
  }

  async validateFace(params: Parameters<FaceProvider['validateFace']>[0]): Promise<FaceValidateResultDto> {
    const image = buildInlineImagePart(params.imageBase64);

    try {
      return await generateStructuredJson<FaceValidateResultDto>({
        apiKey: params.apiKey,
        model: params.model,
        prompt: FACE_VALIDATE_PROMPT,
        images: [image],
        responseSchema: faceValidateResponseSchema,
        timeoutMs: params.aiRequestTimeoutMs,
        maxRetries: params.aiMaxRetries,
        zodSchema: faceValidateResultSchema,
      });
    } catch (error) {
      throwGeminiProviderError('face-validate', error);
    }
  }
}
