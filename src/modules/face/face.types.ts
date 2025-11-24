import { BaseGeminiRequestDto } from '../../common/types/gemini';

export interface FaceCompareRequestDto extends BaseGeminiRequestDto {
  sourceImageBase64: string;
  targetImageBase64: string;
}

export interface FaceValidateRequestDto extends BaseGeminiRequestDto {
  imageBase64: string;
}

export interface FaceCompareResultDto {
  similarityScore: number;
  isMatch: boolean;
  isValidate: boolean;
  reasonText: string;
}

export interface FaceValidateResultDto {
  isLive: boolean;
  qualityScore: number;
  reason: string;
  isValidate: boolean;
  reasonText: string;
}

export interface FaceProvider {
  compareFaces(params: {
    sourceImageBase64: string;
    targetImageBase64: string;
    apiKey: string;
    prompt: string;
    model: string;
    aiRequestTimeoutMs: number;
    aiMaxRetries: number;
  }): Promise<FaceCompareResultDto>;
  validateFace(params: {
    imageBase64: string;
    apiKey: string;
    prompt: string;
    model: string;
    aiRequestTimeoutMs: number;
    aiMaxRetries: number;
  }): Promise<FaceValidateResultDto>;
}

export interface FaceService {
  compareFaces(request: FaceCompareRequestDto): Promise<FaceCompareResultDto>;
  validateFace(request: FaceValidateRequestDto): Promise<FaceValidateResultDto>;
}
