import { SchemaType, type Schema } from '@google/generative-ai';
import { z } from 'zod';
import { generateStructuredJson } from '../../infrastructure/gemini/gemini-json-client';
import { buildInlineImagePart, throwGeminiProviderError } from '../../infrastructure/gemini/gemini-provider-helpers';
import {
  OcrDriverLicenseResultDto,
  OcrIdCardResultDto,
  OcrProvider,
} from './ocr.types';

// Prompts are supplied by the client via request.prompt; constants removed to enforce required prompt from caller.

const idCardResponseSchema: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    documentType: { type: SchemaType.STRING, description: 'Always ID_CARD' },
    fullName: { type: SchemaType.STRING },
    dateOfBirth: { type: SchemaType.STRING },
    documentNumber: { type: SchemaType.STRING },
    expiryDate: { type: SchemaType.STRING },
    issuingCountry: { type: SchemaType.STRING },
    confidenceScore: { type: SchemaType.NUMBER, description: '0-1' },
    isValidate: { type: SchemaType.BOOLEAN, description: 'AI-provided validation result' },
    reasonText: { type: SchemaType.STRING, description: 'Human-readable explanation from AI' },
  },
  required: ['documentType', 'fullName', 'dateOfBirth', 'documentNumber', 'expiryDate', 'issuingCountry', 'confidenceScore', 'isValidate', 'reasonText'],
};

const driverLicenseResponseSchema: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    documentType: { type: SchemaType.STRING, description: 'Always DRIVER_LICENSE' },
    fullName: { type: SchemaType.STRING },
    dateOfBirth: { type: SchemaType.STRING },
    licenseNumber: { type: SchemaType.STRING },
    issueDate: { type: SchemaType.STRING },
    expiryDate: { type: SchemaType.STRING },
    category: { type: SchemaType.STRING },
    confidenceScore: { type: SchemaType.NUMBER },
    isValidate: { type: SchemaType.BOOLEAN, description: 'AI-provided validation result' },
    reasonText: { type: SchemaType.STRING, description: 'Human-readable explanation from AI' },
  },
  required: ['documentType', 'fullName', 'dateOfBirth', 'licenseNumber', 'issueDate', 'expiryDate', 'category', 'confidenceScore', 'isValidate', 'reasonText'],
};

const stringOrEmpty = z.string().optional().transform((value) => value ?? '');

const idCardResultSchema: z.ZodType<OcrIdCardResultDto> = z
  .object({
    documentType: z.string().optional(),
    fullName: stringOrEmpty,
    dateOfBirth: stringOrEmpty,
    documentNumber: stringOrEmpty,
    expiryDate: stringOrEmpty,
    issuingCountry: stringOrEmpty,
    confidenceScore: z.number().min(0).max(1),
    reasonText: stringOrEmpty,
    isValidate: z.boolean().optional().transform((v) => v ?? false),
  })
  .transform((value) => ({
    documentType: 'ID_CARD',
    fullName: value.fullName,
    dateOfBirth: value.dateOfBirth,
    documentNumber: value.documentNumber,
    expiryDate: value.expiryDate,
    issuingCountry: value.issuingCountry,
    confidenceScore: value.confidenceScore,
    reasonText: value.reasonText,
    isValidate: value.isValidate,
  }));

const driverLicenseResultSchema: z.ZodType<OcrDriverLicenseResultDto> = z
  .object({
    documentType: z.string().optional(),
    fullName: stringOrEmpty,
    dateOfBirth: stringOrEmpty,
    licenseNumber: stringOrEmpty,
    issueDate: stringOrEmpty,
    expiryDate: stringOrEmpty,
    category: stringOrEmpty,
    confidenceScore: z.number().min(0).max(1),
    reasonText: stringOrEmpty,
    isValidate: z.boolean().optional().transform((v) => v ?? false),
  })
  .transform((value) => ({
    documentType: 'DRIVER_LICENSE',
    fullName: value.fullName,
    dateOfBirth: value.dateOfBirth,
    licenseNumber: value.licenseNumber,
    issueDate: value.issueDate,
    expiryDate: value.expiryDate,
    category: value.category,
    confidenceScore: value.confidenceScore,
    reasonText: value.reasonText,
    isValidate: value.isValidate,
  }));

export class GeminiOcrProvider implements OcrProvider {
  async ocrIdCard(params: Parameters<OcrProvider['ocrIdCard']>[0]): Promise<OcrIdCardResultDto> {
    const image = buildInlineImagePart(params.imageBase64);

    try {
      const result = await generateStructuredJson<OcrIdCardResultDto>({
        apiKey: params.apiKey,
        model: params.model,
        prompt: params.prompt,
        images: [image],
        responseSchema: idCardResponseSchema,
        timeoutMs: params.aiRequestTimeoutMs,
        maxRetries: params.aiMaxRetries,
        zodSchema: idCardResultSchema,
      });

      return result as OcrIdCardResultDto;
    } catch (error) {
      throwGeminiProviderError('ocr-id-card', error);
    }
  }

  async ocrDriverLicense(params: Parameters<OcrProvider['ocrDriverLicense']>[0]): Promise<OcrDriverLicenseResultDto> {
    const image = buildInlineImagePart(params.imageBase64);

    try {
      const result = await generateStructuredJson<OcrDriverLicenseResultDto>({
        apiKey: params.apiKey,
        model: params.model,
        prompt: params.prompt,
        images: [image],
        responseSchema: driverLicenseResponseSchema,
        timeoutMs: params.aiRequestTimeoutMs,
        maxRetries: params.aiMaxRetries,
        zodSchema: driverLicenseResultSchema,
      });

      return result as OcrDriverLicenseResultDto;
    } catch (error) {
      throwGeminiProviderError('ocr-driver-license', error);
    }
  }
}
