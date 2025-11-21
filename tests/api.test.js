"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const app_1 = __importDefault(require("../src/app"));
const dummyBase64 = 'data:image/jpeg;base64,' + Buffer.from('test-image').toString('base64');
describe('API endpoints', () => {
    it('should handle OCR ID card', async () => {
        const res = await (0, supertest_1.default)(app_1.default)
            .post('/api/ocr/id-card')
            .send({
            geminiApiKey: 'dummy-key',
            imageBase64: dummyBase64,
        })
            .expect(200);
        expect(res.body.status).toBe('SUCCESS');
        expect(res.body.data).toBeDefined();
        expect(res.body.data.documentType).toBe('ID_CARD');
    });
    it('should handle OCR driver license', async () => {
        const res = await (0, supertest_1.default)(app_1.default)
            .post('/api/ocr/driver-license')
            .send({
            geminiApiKey: 'dummy-key',
            imageBase64: dummyBase64,
        })
            .expect(200);
        expect(res.body.status).toBe('SUCCESS');
        expect(res.body.data).toBeDefined();
        expect(res.body.data.documentType).toBe('DRIVER_LICENSE');
    });
    it('should handle face compare', async () => {
        const res = await (0, supertest_1.default)(app_1.default)
            .post('/api/face/compare')
            .send({
            geminiApiKey: 'dummy-key',
            sourceImageBase64: dummyBase64,
            targetImageBase64: dummyBase64,
        })
            .expect(200);
        expect(res.body.status).toBe('SUCCESS');
        expect(res.body.data).toBeDefined();
        expect(typeof res.body.data.similarityScore).toBe('number');
    });
    it('should handle face validate', async () => {
        const res = await (0, supertest_1.default)(app_1.default)
            .post('/api/face/validate')
            .send({
            geminiApiKey: 'dummy-key',
            imageBase64: dummyBase64,
        })
            .expect(200);
        expect(res.body.status).toBe('SUCCESS');
        expect(res.body.data).toBeDefined();
        expect(typeof res.body.data.qualityScore).toBe('number');
    });
    it('should return client error on validation failure', async () => {
        const res = await (0, supertest_1.default)(app_1.default)
            .post('/api/ocr/id-card')
            .send({})
            .expect(200);
        expect(res.body.status).toBe('CLIENT_ERROR');
        expect(res.body.code).toBe('VALIDATION_ERROR');
    });
});
//# sourceMappingURL=api.test.js.map