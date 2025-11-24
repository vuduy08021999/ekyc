import { BaseGeminiRequestDto } from '../../common/types/gemini';

export type DocumentSide = 'FRONT' | 'BACK';

export interface OcrIdCardRequestDto extends BaseGeminiRequestDto {
  imageBase64: string;
  documentSide: DocumentSide;
}

export interface OcrDriverLicenseRequestDto extends BaseGeminiRequestDto {
  imageBase64: string;
  documentSide: DocumentSide;
}

export interface OcrIdCardResultDto {
  documentType: 'ID_CARD';
  fullName: string;
  dateOfBirth: string;
  documentNumber: string;
  expiryDate: string;
  issuingCountry: string;
  confidenceScore: number;
  isValidate: boolean;
  reasonText: string;
}

export interface OcrDriverLicenseResultDto {
  documentType: 'DRIVER_LICENSE';
  fullName: string;
  dateOfBirth: string;
  licenseNumber: string;
  issueDate: string;
  expiryDate: string;
  category: string;
  confidenceScore: number;
  isValidate: boolean;
  reasonText: string;
}

export interface OcrProvider {
  ocrIdCard(params: {
    imageBase64: string;
    apiKey: string;
    prompt: string;
    model: string;
    aiRequestTimeoutMs: number;
    aiMaxRetries: number;
  }): Promise<OcrIdCardResultDto>;
  ocrDriverLicense(params: {
    imageBase64: string;
    apiKey: string;
    prompt: string;
    model: string;
    aiRequestTimeoutMs: number;
    aiMaxRetries: number;
  }): Promise<OcrDriverLicenseResultDto>;
}

export interface OcrService {
  processIdCardOcr(request: OcrIdCardRequestDto): Promise<OcrIdCardResultDto>;
  processDriverLicenseOcr(request: OcrDriverLicenseRequestDto): Promise<OcrDriverLicenseResultDto>;
}
