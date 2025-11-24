export interface BaseGeminiRequestDto {
  geminiApiKey: string;
  prompt: string;
  model: string;
  requestId?: string;
  aiRequestTimeoutMs: number;
  aiMaxRetries: number;
}

export const DEFAULT_GEMINI_MODEL = 'gemini-flash-latest';
export const MAX_GEMINI_TIMEOUT_MS = 5 * 60 * 1000;
export const MAX_GEMINI_RETRIES = 10;
