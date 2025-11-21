import request from 'supertest';
import app from '../src/app';

const geminiResponseQueue: Array<Record<string, unknown>> = [];

jest.mock('@google/generative-ai', () => {
  const generateContent = jest.fn(() => {
    const next = geminiResponseQueue.shift();
    if (!next) {
      throw new Error('No Gemini response enqueued for test');
    }

    return Promise.resolve({
      response: {
        text: () => JSON.stringify(next),
      },
    });
  });

  return {
    GoogleGenerativeAI: jest.fn(() => ({
      getGenerativeModel: jest.fn(() => ({
        generateContent,
      })),
    })),
    SchemaType: {
      STRING: 'string',
      NUMBER: 'number',
      BOOLEAN: 'boolean',
      ARRAY: 'array',
      OBJECT: 'object',
      INTEGER: 'integer',
    },
  };
});

const enqueueGeminiResponse = (data: Record<string, unknown>): void => {
  geminiResponseQueue.push(data);
};

const dummyBase64 = 'data:image/jpeg;base64,' + Buffer.from('test-image').toString('base64');
const defaultModel = 'gemini-flash-latest';

describe('API endpoints', () => {
  beforeEach(() => {
    geminiResponseQueue.length = 0;
    jest.clearAllMocks();
  });
  it('should handle OCR ID card', async () => {
    enqueueGeminiResponse({
      documentType: 'ID_CARD',
      fullName: 'Nguyễn Văn A',
      dateOfBirth: '1990-01-01',
      documentNumber: '012345678901',
      expiryDate: '2035-01-01',
      issuingCountry: 'VN',
      confidenceScore: 0.95,
    });

    const res = await request(app)
      .post('/api/ocr/id-card')
      .send({
        geminiApiKey: 'dummy-key',
        model: defaultModel,
        requestId: 'req-ocr-id',
        aiRequestTimeoutMs: 5000,
        aiMaxRetries: 2,
        imageBase64: dummyBase64,
        documentSide: 'FRONT',
      })
      .expect(200);

    expect(res.body.status).toBe('SUCCESS');
    expect(res.body.data).toBeDefined();
    expect(res.body.data.documentType).toBe('ID_CARD');
    expect(res.body.requestId).toBe('req-ocr-id');
  });

  it('should handle OCR driver license', async () => {
    enqueueGeminiResponse({
      documentType: 'DRIVER_LICENSE',
      fullName: 'Trần Thị B',
      dateOfBirth: '1992-02-02',
      licenseNumber: 'A123456789',
      issueDate: '2020-01-01',
      expiryDate: '2030-01-01',
      category: 'B2',
      confidenceScore: 0.9,
    });

    const res = await request(app)
      .post('/api/ocr/driver-license')
      .send({
        geminiApiKey: 'dummy-key',
        model: defaultModel,
        requestId: 'req-ocr-driver',
        aiRequestTimeoutMs: 5000,
        aiMaxRetries: 2,
        imageBase64: dummyBase64,
        documentSide: 'FRONT',
      })
      .expect(200);

    expect(res.body.status).toBe('SUCCESS');
    expect(res.body.data).toBeDefined();
    expect(res.body.data.documentType).toBe('DRIVER_LICENSE');
  });

  it('should handle face compare', async () => {
    enqueueGeminiResponse({
      similarityScore: 0.84,
      isMatch: true,
    });

    const res = await request(app)
      .post('/api/face/compare')
      .send({
        geminiApiKey: 'dummy-key',
        model: defaultModel,
        requestId: 'req-face-compare',
        aiRequestTimeoutMs: 5000,
        aiMaxRetries: 2,
        sourceImageBase64: dummyBase64,
        targetImageBase64: dummyBase64,
      })
      .expect(200);

    expect(res.body.status).toBe('SUCCESS');
    expect(res.body.data).toBeDefined();
    expect(typeof res.body.data.similarityScore).toBe('number');
  });

  it('should handle face validate', async () => {
    enqueueGeminiResponse({
      isLive: true,
      qualityScore: 0.88,
      reason: 'OK',
    });

    const res = await request(app)
      .post('/api/face/validate')
      .send({
        geminiApiKey: 'dummy-key',
        model: defaultModel,
        requestId: 'req-face-validate',
        aiRequestTimeoutMs: 5000,
        aiMaxRetries: 2,
        imageBase64: dummyBase64,
      })
      .expect(200);

    expect(res.body.status).toBe('SUCCESS');
    expect(res.body.data).toBeDefined();
    expect(typeof res.body.data.qualityScore).toBe('number');
  });

  it('should return client error on validation failure', async () => {
    const res = await request(app)
      .post('/api/ocr/id-card')
      .send({})
      .expect(200);

    expect(res.body.status).toBe('CLIENT_ERROR');
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('should accept custom model field', async () => {
    enqueueGeminiResponse({
      isLive: false,
      qualityScore: 0.42,
      reason: 'LOW_QUALITY_OR_NOT_LIVE',
    });

    const res = await request(app)
      .post('/api/face/validate')
      .send({
        geminiApiKey: 'dummy-key',
        model: 'gemini-2.0-flash',
        requestId: 'req-face-custom-model',
        aiRequestTimeoutMs: 5000,
        aiMaxRetries: 2,
        imageBase64: dummyBase64,
      })
      .expect(200);

    expect(res.body.status).toBe('SUCCESS');
  });
  
  it('should reject OCR back side images', async () => {
    const res = await request(app)
      .post('/api/ocr/id-card')
      .send({
        geminiApiKey: 'dummy-key',
        model: defaultModel,
        requestId: 'req-ocr-back',
        aiRequestTimeoutMs: 5000,
        aiMaxRetries: 2,
        imageBase64: dummyBase64,
        documentSide: 'BACK',
      })
      .expect(200);

    expect(res.body.status).toBe('CLIENT_ERROR');
    expect(res.body.code).toBe('UNSUPPORTED_SIDE');
  });
});
