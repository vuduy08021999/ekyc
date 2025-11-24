# OCR & Face API (Node.js + TypeScript)

> Dự án triển khai 4 API OCR/khuôn mặt với kiến trúc hiện đại (route → service → provider). Request gửi ảnh base64 + khoá Gemini ngay trong body, response luôn HTTP 200 nhưng phân loại rõ trạng thái trong JSON.

> **Tài liệu dành cho khách hàng (không cần biết backend):** xem `docs/api-khach-hang.md`.

## 1. Kiến trúc & luồng xử lý

- **Stack:** Node.js LTS, TypeScript, Express 5, `@google/generative-ai`.
- **Modules:**
  - `modules/ocr`: CCCD & GPLX.
  - `modules/face`: so sánh & validate khuôn mặt.
- **Provider:** tầng provider tách biệt với hai implementation thực tế `GeminiOcrProvider` & `GeminiFaceProvider`, gọi trực tiếp SDK `@google/generative-ai` bằng khoá/model khách gửi lên.
- **Stateless images:** server không ghi ảnh ra đĩa; base64 được stream thẳng vào Gemini theo từng request (đáp ứng yêu cầu không lưu trữ).
- **DTO chia sẻ:**
  - `ApiResponse<T>`: chuẩn hóa body phản hồi.
  - `BaseGeminiRequestDto`: chứa `geminiApiKey`, `prompt`, `model`, `requestId`, `aiRequestTimeoutMs`, `aiMaxRetries`.

**Pipeline mỗi request:**
1. Client gửi POST JSON (ảnh base64 + khoá + model mong muốn + requestId + thông số timeout/retry cho Gemini; phần structured output do server toàn quyền quyết định).
2. Middleware Zod validate.
3. Service chuẩn hóa payload và gọi provider Gemini.
4. Provider thực thi nghiệp vụ (gọi Gemini hoặc provider cắm ngoài) → controller đóng gói `ApiResponse` → gửi HTTP 200.

## 2. Chuẩn phản hồi (HTTP 200)

```json
{
  "status": "SUCCESS" | "CLIENT_ERROR" | "SERVER_ERROR",
  "code": "OK" | "VALIDATION_ERROR" | "INTERNAL_ERROR" | "...",
  "message": "Mô tả ngắn",
  "data": { ... } | null,
  "requestId": "uuid",
  "timestamp": "ISO-8601"
}
```

- `SUCCESS`: xử lý xong (kể cả kết quả nghiệp vụ âm tính).
- `CLIENT_ERROR`: lỗi input, trả chi tiết trong `data`.
- `SERVER_ERROR`: lỗi nội bộ (ví dụ gọi Gemini fail sau này).

## 3. Cài đặt & chạy

Yêu cầu: Node.js ≥ 18.

```powershell
npm install          # cài deps
npm run dev          # chạy dev (ts-node-dev)
npm run build        # biên dịch sang dist/
npm start            # chạy bản build
npm test             # Jest + Supertest
```

Port mặc định `3000` (set `PORT` nếu muốn đổi).

## 4. API chi tiết

| Endpoint | Trường riêng bắt buộc | Mô tả |
| --- | --- | --- |
| `POST /api/ocr/id-card` | `imageBase64` | OCR căn cước |
| `POST /api/ocr/driver-license` | `imageBase64` | OCR GPLX |
| `POST /api/face/compare` | `sourceImageBase64`, `targetImageBase64` | So sánh hai khuôn mặt |
| `POST /api/face/validate` | `imageBase64` | Kiểm tra ảnh khuôn mặt |

### Các trường chung trong body

```json
{
  "geminiApiKey": "bắt buộc",
  "model": "bắt buộc (ví dụ gemini-flash-latest)",
  "requestId": "bắt buộc phía client để map response",
  "aiRequestTimeoutMs": "bắt buộc, timeout tối đa mỗi lần gọi Gemini (ms)",
  "aiMaxRetries": "bắt buộc, số lần retry tối đa nếu gặp lỗi",
  "...": "các field ảnh cụ thể"
}
```

- `model`: client chọn trực tiếp model Gemini (ví dụ `gemini-flash-latest`, `gemini-2.0-flash`). Đây là trường bắt buộc.
- `requestId`: client tự sinh (UUID, timestamp...). Server sẽ echo đúng giá trị này trong mọi response để dễ khớp log.
- `aiRequestTimeoutMs`: thời gian tối đa (ms) cho một lượt gọi Gemini. Server sẽ bọc Promise bằng `Promise.race([call, timeout])` và nếu quá hạn sẽ trả `SERVER_ERROR`.
- `aiMaxRetries`: số lần retry tối đa khi gọi Gemini lỗi (>= 0). Server sẽ dùng thông số này để cấu hình vòng lặp retry/backoff.
- `documentSide`: (áp dụng cho OCR) chỉ chấp nhận `FRONT`. Nếu gửi `BACK`, API sẽ trả `CLIENT_ERROR` với `code = UNSUPPORTED_SIDE`.
- Structured JSON: server tự định nghĩa schema chuẩn cho từng use case và sẽ nội suy khi gọi Gemini, client không cần (và không thể) truyền lên.

### Ví dụ request OCR CCCD

```json
{
  "geminiApiKey": "YOUR_GEMINI_KEY",
  "prompt": "Please extract required fields as JSON.",
  "model": "gemini-flash-latest",
  "requestId": "req-123",
  "aiRequestTimeoutMs": 5000,
  "aiMaxRetries": 2,
  "imageBase64": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ...",
  "documentSide": "FRONT"
}
```

### Ví dụ request Face Validate (schema do server chọn)

```json
{
  "geminiApiKey": "YOUR_GEMINI_KEY",
  "prompt": "Please return face quality and isLive as JSON.",
  "model": "gemini-2.0-flash",
  "requestId": "req-face",
  "aiRequestTimeoutMs": 7000,
  "aiMaxRetries": 1,
  "imageBase64": "data:image/png;base64,iVBORw0KGgo..."
}
```

Server sẽ dựa trên endpoint để quyết định structured schema phù hợp, ví dụ `face.validate` tập trung vào `isLive`, `qualityScore`, `reason`.

### Ví dụ response SUCCESS

```json
{
  "status": "SUCCESS",
  "code": "OK",
  "message": "Face validate success",
  "data": {
    "isLive": true,
    "qualityScore": 0.83,
    "reason": "OK"
  },
  "requestId": "40b1...",
  "timestamp": "2025-11-21T04:15:27.211Z"
}
```

### Ví dụ response CLIENT_ERROR

```json
{
  "status": "CLIENT_ERROR",
  "code": "VALIDATION_ERROR",
  "message": "Request body validation failed",
  "data": {
    "geminiApiKey": { "_errors": ["Required"] }
  },
  "requestId": "1f86...",
  "timestamp": "2025-11-21T04:16:10.010Z"
}
```

## 5. Structured JSON & tích hợp Gemini

- Server định nghĩa sẵn `serverResponseConfig` cho từng endpoint (ví dụ `ocr.idCard`, `face.validate`). Mỗi cấu hình gồm `responseMimeType` và `responseJsonSchema` chặt chẽ.
- Khi nhận request, backend xác định endpoint tương ứng rồi tự động gắn cấu hình này vào lệnh gọi Gemini. Client không cần truyền thêm thông tin.
- Ví dụ minh hoạ:

  ```ts
  import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';

  const serverResponseConfig = {
    faceValidate: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          isLive: { type: SchemaType.BOOLEAN },
          qualityScore: { type: SchemaType.NUMBER },
          reason: { type: SchemaType.STRING },
        },
        required: ['isLive', 'qualityScore', 'reason'],
      },
    },
  } as const;

  const config = serverResponseConfig.faceValidate;

  const genAI = new GoogleGenerativeAI(request.geminiApiKey);
  const model = genAI.getGenerativeModel({ model: request.model });

  const response = await model.generateContent({
    contents,
    generationConfig: {
      responseMimeType: config.responseMimeType,
      responseSchema: config.responseSchema,
    },
  });
  ```

- Sau khi nhận kết quả, server vẫn có thể `JSON.parse()` và validate lại bằng Zod/JSON Schema nội bộ để bảo đảm dữ liệu chuẩn trước khi đóng gói `ApiResponse` gửi cho client.

## 6. Lộ trình mở rộng

1. `npm install @google/genai zod-to-json-schema` (nếu chưa có ở client).
2. Bổ sung thêm provider (ví dụ fine-tuned model nội bộ) implement interface sẵn có, gọi API đúng mẫu.
3. Tuỳ môi trường mà bind provider phù hợp (Gemini production, provider on-prem cho môi trường đặc thù).
4. Cân nhắc vô hiệu hóa `FileSystemImageStorageService` ở production (stateless tuyệt đối, ảnh chỉ lưu tạm trong request hoặc upload thẳng Gemini File API).

## 7. Testing

- `tests/api.test.ts` dùng Jest + Supertest để smoke test 4 endpoint + case lỗi validate + case client truyền `model` khác mặc định + case OCR mặt sau trả `UNSUPPORTED_SIDE` + echo `requestId`.
- Gemini SDK được mock hoàn toàn trong test để không gọi mạng, các response mẫu được enqueue thủ công.
- Chạy test:

  ```powershell
  npm test
  ```

---

> Bạn có thể bổ sung thêm ví dụ cURL/Postman, tài liệu mapping thực tế với Gemini, hoặc logging nâng cao theo nhu cầu đội ngũ.


