# API OCR & Face Recognition

> **Phiên bản:** 2025-12-01

## 1. Tổng quan

| Thông tin | Giá trị |
|-----------|---------|
| Base URL | `https://api.example.com` |
| Content-Type | `application/json` |
| Dung lượng ảnh tối đa | 5 MB |
| Định dạng ảnh | `data:<mime>;base64,<payload>` |

**Lưu ý:** Server xử lý stateless — ảnh không được lưu trên đĩa.

---

## 2. Chuẩn phản hồi

```json
{
  "status": "SUCCESS | CLIENT_ERROR | SERVER_ERROR",
  "code": "OK | VALIDATION_ERROR | INTERNAL_ERROR | ...",
  "message": "Mô tả ngắn",
  "data": { },
  "requestId": "string",
  "timestamp": "ISO-8601"
}
```

| Status | Ý nghĩa |
|--------|---------|
| `SUCCESS` | Xử lý thành công (kể cả kết quả âm tính như `isMatch = false`) |
| `CLIENT_ERROR` | Dữ liệu đầu vào không hợp lệ |
| `SERVER_ERROR` | Lỗi server hoặc AI provider |

---

## 3. Trường chung (bắt buộc trong mọi request)

| Trường | Kiểu | Bắt buộc | Mô tả |
|--------|------|----------|-------|
| `geminiApiKey` | string | ✔️ | API key Gemini do bạn quản lý |
| `model` | string | ✔️ | Tên model (vd: `gemini-flash-latest`) |
| `prompt` | string | ✔️ | Prompt gửi xuống Gemini |
| `aiRequestTimeoutMs` | number | ✔️ | Timeout mỗi lần gọi Gemini (1 → 300000 ms) |
| `aiMaxRetries` | number | ✔️ | Số lần retry tối đa (0 → 10) |
| `requestId` | string | | ID để map response (khuyên dùng) |

---

## 4. Endpoints

### 4.1. POST /api/ocr/id-card

OCR mặt trước CCCD.

**Request body bổ sung:**

| Trường | Kiểu | Bắt buộc | Mô tả |
|--------|------|----------|-------|
| `imageBase64` | string | ✔️ | Ảnh CCCD dạng base64 |
| `documentSide` | enum | | `FRONT` (mặc định) |

**Response `data`:**

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `documentType` | string | `ID_CARD` |
| `fullName` | string | Họ tên |
| `dateOfBirth` | string | Ngày sinh (YYYY-MM-DD) |
| `documentNumber` | string | Số CCCD |
| `expiryDate` | string | Ngày hết hạn |
| `issuingCountry` | string | Mã quốc gia (vd: `VN`) |
| `confidenceScore` | number | Độ tin cậy (0 → 1) |
| `reasonText` | string | Giải thích từ AI |
| `isValidate` | boolean | Xác nhận đọc được thông tin |

---

### 4.2. POST /api/ocr/driver-license

OCR mặt trước GPLX.

**Request body bổ sung:**

| Trường | Kiểu | Bắt buộc | Mô tả |
|--------|------|----------|-------|
| `imageBase64` | string | ✔️ | Ảnh GPLX dạng base64 |
| `documentSide` | enum | | `FRONT` (mặc định). Gửi `BACK` sẽ trả lỗi `UNSUPPORTED_SIDE` |

**Response `data`:**

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `documentType` | string | `DRIVER_LICENSE` |
| `fullName` | string | Họ tên |
| `dateOfBirth` | string | Ngày sinh (YYYY-MM-DD) |
| `licenseNumber` | string | Số GPLX |
| `issueDate` | string | Ngày cấp |
| `expiryDate` | string | Ngày hết hạn |
| `category` | string | Hạng bằng (A1, B2, C...) |
| `confidenceScore` | number | Độ tin cậy (0 → 1) |
| `reasonText` | string | Giải thích từ AI |
| `isValidate` | boolean | Xác nhận đọc được thông tin |

---

### 4.3. POST /api/face/compare

So sánh hai ảnh khuôn mặt.

**Request body bổ sung:**

| Trường | Kiểu | Bắt buộc | Mô tả |
|--------|------|----------|-------|
| `sourceImageBase64` | string | ✔️ | Ảnh khuôn mặt nguồn |
| `targetImageBase64` | string | ✔️ | Ảnh khuôn mặt đích |

**Response `data`:**

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `similarityScore` | number | Độ tương đồng (0 → 1) |
| `isMatch` | boolean | `true` nếu ≥ 80% |
| `reasonText` | string | Giải thích từ AI |
| `isValidate` | boolean | Kết quả đủ tin cậy |

---

### 4.4. POST /api/face/validate

Kiểm tra chất lượng ảnh và liveness.

**Request body bổ sung:**

| Trường | Kiểu | Bắt buộc | Mô tả |
|--------|------|----------|-------|
| `imageBase64` | string | ✔️ | Ảnh khuôn mặt |

**Response `data`:**

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `isLive` | boolean | Ảnh người thật (không phải chụp màn hình) |
| `qualityScore` | number | Chất lượng ảnh (0 → 1) |
| `reason` | string | `OK` hoặc `LOW_QUALITY_OR_NOT_LIVE` |
| `reasonText` | string | Giải thích từ AI |
| `isValidate` | boolean | Ảnh đạt điều kiện |

---

### 4.5. GET /api/health

Kiểm tra trạng thái dịch vụ.

**Response:**

```json
{
  "status": "UP",
  "env": "production",
  "uptimeSeconds": 12345,
  "timestamp": "2025-12-01T07:00:00.000Z"
}
```

---

## 5. Ví dụ request

```bash
curl -X POST https://api.example.com/api/ocr/id-card \
  -H "Content-Type: application/json" \
  -d '{
    "geminiApiKey": "YOUR_KEY",
    "model": "gemini-flash-latest",
    "prompt": "Trích xuất thông tin CCCD, trả JSON.",
    "aiRequestTimeoutMs": 5000,
    "aiMaxRetries": 2,
    "imageBase64": "data:image/jpeg;base64,/9j/4AAQ...",
    "documentSide": "FRONT"
  }'
```

---

## 6. Mẫu phản hồi lỗi

**Thiếu trường bắt buộc:**

```json
{
  "status": "CLIENT_ERROR",
  "code": "VALIDATION_ERROR",
  "message": "Request body validation failed",
  "data": {
    "geminiApiKey": { "_errors": ["Required"] }
  },
  "requestId": "...",
  "timestamp": "..."
}
```

**Lỗi server/AI:**

```json
{
  "status": "SERVER_ERROR",
  "code": "INTERNAL_ERROR",
  "message": "Gemini provider downtime",
  "data": null,
  "requestId": "...",
  "timestamp": "..."
}
```

---

## 7. Hỗ trợ

| Hạng mục | Giá trị |
|----------|---------|
| Thời gian phản hồi | < 2s với ảnh < 5 MB |
| Khung giờ hỗ trợ | 08:00–22:00 GMT+7 |
| Email | support@example.com |
