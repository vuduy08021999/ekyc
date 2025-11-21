import { GoogleGenerativeAI, type Schema } from '@google/generative-ai';
import type { ZodType } from 'zod';

export interface GeminiInlineImagePart {
  mimeType: string;
  base64Data: string;
}

export interface GeminiStructuredJsonRequest<T> {
  apiKey: string;
  model: string;
  prompt: string;
  images: GeminiInlineImagePart[];
  responseSchema: Schema;
  timeoutMs: number;
  maxRetries: number;
  zodSchema: ZodType<T>;
}

const DEFAULT_TEMPERATURE = 0.2;
const BASE_BACKOFF_MS = 200;
const MAX_BACKOFF_MS = 1000;

export async function generateStructuredJson<T>(options: GeminiStructuredJsonRequest<T>): Promise<T> {
  const normalizedTimeout = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : 0;
  const normalizedRetries = Number.isFinite(options.maxRetries) && options.maxRetries > 0
    ? Math.floor(options.maxRetries)
    : 0;

  const operation = async (): Promise<T> => {
    const genAI = new GoogleGenerativeAI(options.apiKey);
    const model = genAI.getGenerativeModel({ model: options.model });

    const parts = [
      { text: options.prompt },
      ...options.images.map((image) => ({
        inlineData: {
          mimeType: image.mimeType,
          data: image.base64Data,
        },
      })),
    ];

    const response = await model.generateContent({
      contents: [
        {
          role: 'user',
          parts,
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: options.responseSchema,
        temperature: DEFAULT_TEMPERATURE,
      },
    });

    const rawText = response.response.text();
    const parsed = parseJsonPayload(rawText);
    return options.zodSchema.parse(parsed);
  };

  return runWithRetries(operation, normalizedRetries, normalizedTimeout);
}

async function runWithRetries<T>(operation: () => Promise<T>, maxRetries: number, timeoutMs: number): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const result = await withTimeout(operation(), timeoutMs);
      return result;
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries) {
        throw error;
      }

      const delayMs = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * (attempt + 1));
      await delay(delayMs);
    }
  }

  throw lastError ?? new Error('Unknown Gemini error');
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  if (!timeoutMs) {
    return promise;
  }

  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Gemini request timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function parseJsonPayload(rawText: string): unknown {
  const sanitized = stripCodeFence(rawText);
  if (!sanitized) {
    throw new Error('Gemini returned empty response');
  }

  try {
    return JSON.parse(sanitized);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown JSON parse error';
    throw new Error(`Failed to parse Gemini JSON response: ${reason}`);
  }
}

function stripCodeFence(input: string): string {
  let text = input.trim();
  if (text.startsWith('```')) {
    const firstLineBreak = text.indexOf('\n');
    if (firstLineBreak >= 0) {
      text = text.slice(firstLineBreak + 1);
    }
    if (text.endsWith('```')) {
      text = text.slice(0, -3);
    }
  }

  return text.trim();
}
