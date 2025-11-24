import { SchemaType, type Schema } from '@google/generative-ai';
import { z } from 'zod';
import { generateStructuredJson } from '../../infrastructure/gemini/gemini-json-client';
import { buildInlineImagePart, throwGeminiProviderError } from '../../infrastructure/gemini/gemini-provider-helpers';
import {
  FaceCompareResultDto,
  FaceProvider,
  FaceValidateResultDto,
} from './face.types';

// Prompts are supplied by the client via request.prompt; provider will use that prompt to call Gemini.

const faceCompareResponseSchema: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    similarityScore: { type: SchemaType.NUMBER, description: 'Score 0-1' },
    isMatch: { type: SchemaType.BOOLEAN, description: 'True if above matching threshold' },
    isValidate: { type: SchemaType.BOOLEAN, description: 'AI-provided validation result' },
    reasonText: { type: SchemaType.STRING, description: 'Human-readable explanation from AI' },
  },
  required: ['similarityScore', 'isMatch', 'isValidate'],
};

const faceValidateResponseSchema: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    isLive: { type: SchemaType.BOOLEAN, description: 'True if image judged to be a live person' },
    qualityScore: { type: SchemaType.NUMBER, description: 'Quality score 0-1' },
    reason: { type: SchemaType.STRING, description: 'Short reason code like OK or LOW_QUALITY_OR_NOT_LIVE' },
    isValidate: { type: SchemaType.BOOLEAN, description: 'AI-provided validation result' },
    reasonText: { type: SchemaType.STRING, description: 'Human-readable explanation from AI' },
  },
  required: ['isLive', 'qualityScore', 'reason', 'isValidate'],
};

const stringOrEmpty = z.string().optional().transform((value) => value ?? '');

const faceCompareResultSchema: z.ZodType<FaceCompareResultDto> = z
  .object({
    similarityScore: z.number().min(0).max(1),
    isMatch: z.boolean(),
    isValidate: z.boolean().optional().transform((v) => v ?? false),
    reasonText: stringOrEmpty,
  })
  .transform((value) => ({
    similarityScore: value.similarityScore,
    isMatch: value.isMatch,
    isValidate: value.isValidate,
    reasonText: value.reasonText,
  }));

const faceValidateResultSchema: z.ZodType<FaceValidateResultDto> = z
  .object({
    isLive: z.boolean(),
    qualityScore: z.number().min(0).max(1),
    reason: z.string().min(1),
    isValidate: z.boolean().optional().transform((v) => v ?? false),
    reasonText: stringOrEmpty,
  })
  .transform((value) => ({
    isLive: value.isLive,
    qualityScore: value.qualityScore,
    reason: value.reason,
    isValidate: value.isValidate,
    reasonText: value.reasonText,
  }));

export class GeminiFaceProvider implements FaceProvider {
  async compareFaces(params: Parameters<FaceProvider['compareFaces']>[0]): Promise<FaceCompareResultDto> {
    const sourceImage = buildInlineImagePart(params.sourceImageBase64);
    const targetImage = buildInlineImagePart(params.targetImageBase64);

    try {
      const result = await generateStructuredJson<FaceCompareResultDto>({
        apiKey: params.apiKey,
        model: params.model,
        prompt: params.prompt,
        images: [sourceImage, targetImage],
        responseSchema: faceCompareResponseSchema,
        timeoutMs: params.aiRequestTimeoutMs,
        maxRetries: params.aiMaxRetries,
        zodSchema: faceCompareResultSchema,
      });

      return result as FaceCompareResultDto;
    } catch (error) {
      throwGeminiProviderError('face-compare', error);
    }
  }

  async validateFace(params: Parameters<FaceProvider['validateFace']>[0]): Promise<FaceValidateResultDto> {
    const image = buildInlineImagePart(params.imageBase64);

    try {
      const result = await generateStructuredJson<FaceValidateResultDto>({
        apiKey: params.apiKey,
        model: params.model,
        prompt: params.prompt,
        images: [image],
        responseSchema: faceValidateResponseSchema,
        timeoutMs: params.aiRequestTimeoutMs,
        maxRetries: params.aiMaxRetries,
        zodSchema: faceValidateResultSchema,
      });

      return result as FaceValidateResultDto;
    } catch (error) {
      throwGeminiProviderError('face-validate', error);
    }
  }
}
