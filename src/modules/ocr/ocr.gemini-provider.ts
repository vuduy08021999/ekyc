import { SchemaType, type Schema } from '@google/generative-ai';
import { z } from 'zod';
import { generateStructuredJson } from '../../infrastructure/gemini/gemini-json-client';
import { buildInlineImagePart, throwGeminiProviderError } from '../../infrastructure/gemini/gemini-provider-helpers';
import {
  OcrDriverLicenseResultDto,
  OcrIdCardResultDto,
  OcrProvider,
} from './ocr.types';

const ID_CARD_PROMPT = `Bạn là hệ thống OCR chuyên xử lý căn cước công dân Việt Nam.
Trích xuất chính xác các trường yêu cầu. Nếu không nhìn thấy thông tin, trả chuỗi rỗng nhưng giữ đúng cấu trúc JSON.
Ước lượng confidenceScore trong khoảng 0→1 (1 là chắc chắn nhất). Chỉ trả JSON phù hợp schema.`;

const DRIVER_LICENSE_PROMPT = `Bạn là hệ thống OCR cho giấy phép lái xe Việt Nam. Trích xuất đầy đủ thông tin.
Nếu thiếu dữ liệu, để chuỗi rỗng. Ước lượng confidenceScore 0→1. Chỉ trả JSON đúng schema.`;

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
  },
  required: ['documentType', 'fullName', 'dateOfBirth', 'documentNumber', 'expiryDate', 'issuingCountry', 'confidenceScore'],
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
  },
  required: ['documentType', 'fullName', 'dateOfBirth', 'licenseNumber', 'issueDate', 'expiryDate', 'category', 'confidenceScore'],
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
  })
  .transform((value) => ({
    documentType: 'ID_CARD',
    fullName: value.fullName,
    dateOfBirth: value.dateOfBirth,
    documentNumber: value.documentNumber,
    expiryDate: value.expiryDate,
    issuingCountry: value.issuingCountry,
    confidenceScore: value.confidenceScore,
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
  }));

export class GeminiOcrProvider implements OcrProvider {
  async ocrIdCard(params: Parameters<OcrProvider['ocrIdCard']>[0]): Promise<OcrIdCardResultDto> {
    const image = buildInlineImagePart(params.imageBase64);

    try {
      return await generateStructuredJson<OcrIdCardResultDto>({
        apiKey: params.apiKey,
        model: params.model,
        prompt: ID_CARD_PROMPT,
        images: [image],
        responseSchema: idCardResponseSchema,
        timeoutMs: params.aiRequestTimeoutMs,
        maxRetries: params.aiMaxRetries,
        zodSchema: idCardResultSchema,
      });
    } catch (error) {
      throwGeminiProviderError('ocr-id-card', error);
    }
  }

  async ocrDriverLicense(params: Parameters<OcrProvider['ocrDriverLicense']>[0]): Promise<OcrDriverLicenseResultDto> {
    const image = buildInlineImagePart(params.imageBase64);

    try {
      return await generateStructuredJson<OcrDriverLicenseResultDto>({
        apiKey: params.apiKey,
        model: params.model,
        prompt: DRIVER_LICENSE_PROMPT,
        images: [image],
        responseSchema: driverLicenseResponseSchema,
        timeoutMs: params.aiRequestTimeoutMs,
        maxRetries: params.aiMaxRetries,
        zodSchema: driverLicenseResultSchema,
      });
    } catch (error) {
      throwGeminiProviderError('ocr-driver-license', error);
    }
  }
}
