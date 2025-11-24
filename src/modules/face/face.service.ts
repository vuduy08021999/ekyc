import { DEFAULT_GEMINI_MODEL, MAX_GEMINI_RETRIES, MAX_GEMINI_TIMEOUT_MS } from '../../common/types/gemini';
import {
  FaceCompareRequestDto,
  FaceCompareResultDto,
  FaceProvider,
  FaceService as IFaceService,
  FaceValidateRequestDto,
  FaceValidateResultDto,
} from './face.types';

export class FaceService implements IFaceService {
  constructor(
    private readonly provider: FaceProvider,
  ) {}

  async compareFaces(request: FaceCompareRequestDto): Promise<FaceCompareResultDto> {
    const model = request.model ?? DEFAULT_GEMINI_MODEL;
    const aiRequestTimeoutMs = Math.min(request.aiRequestTimeoutMs, MAX_GEMINI_TIMEOUT_MS);
    const aiMaxRetries = Math.min(request.aiMaxRetries, MAX_GEMINI_RETRIES);

    const payload = {
      sourceImageBase64: request.sourceImageBase64,
      targetImageBase64: request.targetImageBase64,
      apiKey: request.geminiApiKey,
      prompt: request.prompt,
      model,
      aiRequestTimeoutMs,
      aiMaxRetries,
    };

    return this.provider.compareFaces(payload);
  }

  async validateFace(request: FaceValidateRequestDto): Promise<FaceValidateResultDto> {
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

    return this.provider.validateFace(payload);
  }
}
