import { DEFAULT_GEMINI_MODEL, MAX_GEMINI_RETRIES, MAX_GEMINI_TIMEOUT_MS } from '../../common/types/gemini';
import { AppError } from '../../common/errors/app-error';
import {
  OcrDriverLicenseRequestDto,
  OcrDriverLicenseResultDto,
  OcrIdCardRequestDto,
  OcrIdCardResultDto,
  OcrProvider,
  OcrService as IOcrService,
} from './ocr.types';

export class OcrService implements IOcrService {
  constructor(
    private readonly provider: OcrProvider,
  ) {}

  async processIdCardOcr(request: OcrIdCardRequestDto): Promise<OcrIdCardResultDto> {
    if (request.documentSide === 'BACK') {
      throw new AppError(400, 'UNSUPPORTED_SIDE', 'Chỉ hỗ trợ OCR mặt trước (FRONT) cho CCCD');
    }

    const model = request.model ?? DEFAULT_GEMINI_MODEL;
    const aiRequestTimeoutMs = Math.min(request.aiRequestTimeoutMs, MAX_GEMINI_TIMEOUT_MS);
    const aiMaxRetries = Math.min(request.aiMaxRetries, MAX_GEMINI_RETRIES);

    const payload = {
      imageBase64: request.imageBase64,
      apiKey: request.geminiApiKey,
      prompt: request.prompt,
      model,
      aiRequestTimeoutMs,
      aiMaxRetries,
    };

    return this.provider.ocrIdCard(payload);
  }

  async processDriverLicenseOcr(request: OcrDriverLicenseRequestDto): Promise<OcrDriverLicenseResultDto> {
    if (request.documentSide === 'BACK') {
      throw new AppError(400, 'UNSUPPORTED_SIDE', 'Chỉ hỗ trợ OCR mặt trước (FRONT) cho GPLX');
    }

    const model = request.model ?? DEFAULT_GEMINI_MODEL;
    const aiRequestTimeoutMs = Math.min(request.aiRequestTimeoutMs, MAX_GEMINI_TIMEOUT_MS);
    const aiMaxRetries = Math.min(request.aiMaxRetries, MAX_GEMINI_RETRIES);

    const payload = {
      imageBase64: request.imageBase64,
      apiKey: request.geminiApiKey,
      prompt: request.prompt,
      model,
      aiRequestTimeoutMs,
      aiMaxRetries,
    };

    return this.provider.ocrDriverLicense(payload);
  }
}
