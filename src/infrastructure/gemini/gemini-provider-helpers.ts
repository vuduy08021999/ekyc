import { AppError } from '../../common/errors/app-error';
import { parseBase64Image } from '../../common/utils/base64';
import type { GeminiInlineImagePart } from './gemini-json-client';

export function buildInlineImagePart(imageBase64: string): GeminiInlineImagePart {
  const parsed = parseBase64Image(imageBase64);
  return {
    mimeType: parsed.mimeType,
    base64Data: parsed.base64Payload,
  };
}

export function throwGeminiProviderError(operation: string, error: unknown): never {
  if (error instanceof AppError) {
    throw error;
  }

  const details =
    error instanceof Error
      ? { name: error.name, message: error.message }
      : { error };

  throw new AppError(500, 'AI_PROVIDER_ERROR', `Gemini ${operation} request failed`, details);
}
