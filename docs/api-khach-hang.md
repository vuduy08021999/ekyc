# Tài liệu API cho khách hàng

> Phiên bản: 2025-11-21 — bản triển khai production tích hợp Gemini trực tiếp (cấu trúc hợp đồng ổn định).

## 1. Tổng quan

- **Base URL thử nghiệm:** `https://api.example.com` *(thay bằng domain thực tế khi bàn giao)*.
- Kiến trúc REST thuần JSON. Tất cả phản hồi luôn dùng HTTP 200, trạng thái nghiệp vụ nằm trong body.
- Dung lượng mỗi ảnh nên < 5 MB, gửi bằng chuỗi `data:<mime>;base64,<payload>`.
- Server xử lý stateless: ảnh base64 được truyền thẳng xuống Gemini và không được lưu lại trên đĩa.

## 2. Xác thực & Headers

| Header         | Bắt buộc | Ghi chú            |
|----------------|---------|--------------------|
| `Content-Type` | ✔️       | `application/json` |

Trong body, mọi request đều cần trường `geminiApiKey` (string) do khách hàng quản lý. Đây là khoá sẽ được proxy xuống Gemini, hãy giữ bí mật tuyệt đối.

## 3. Chuẩn phản hồi

```json
{
  "status": "SUCCESS | CLIENT_ERROR | SERVER_ERROR",
  "code": "OK | VALIDATION_ERROR | INTERNAL_ERROR | ...",
  "message": "Mô tả ngắn",
  "data": {},
  "requestId": "string",
  "timestamp": "ISO-8601"
}
```

- `status`: phân loại nghiệp vụ.
  - `SUCCESS`: xử lý thành công (kể cả kết quả âm tính, ví dụ `isMatch = false`).
  - `CLIENT_ERROR`: dữ liệu đầu vào không hợp lệ.
  - `SERVER_ERROR`: sự cố phía máy chủ hoặc khi gọi AI provider.
- `code`: chi tiết hơn, dùng để mapping logic phía khách.
- `requestId`: luôn xuất hiện, thuận tiện cross-check log.

## 4. Danh sách endpoint

| Endpoint                     | Mô tả                       |
|-----------------------------|-----------------------------|
| `POST /api/ocr/id-card`     | Trích xuất thông tin CCCD   |
| `POST /api/ocr/driver-license` | Trích xuất thông tin GPLX |
| `POST /api/face/compare`    | So sánh hai ảnh khuôn mặt   |
| `POST /api/face/validate`   | Kiểm tra chất lượng & live  |
| `GET /api/health`           | Kiểm tra trạng thái dịch vụ |

Các trường chung trong body của mọi endpoint:

```jsonc
{
  "geminiApiKey": "string",     // bắt buộc
  "model": "string",            // bắt buộc, ví dụ: gemini-flash-latest
  "requestId": "string",        // tùy chọn (khuyên dùng để map response)
  "aiRequestTimeoutMs": 5000,   // bắt buộc: timeout tối đa mỗi lần gọi Gemini
  "aiMaxRetries": 2             // bắt buộc: số lần retry tối đa khi lỗi
}
```

- `geminiApiKey`: Khoá API Gemini do bạn quản lý. **Bắt buộc**.
- `model`: Tên model Gemini muốn sử dụng (ví dụ: `gemini-flash-latest`). **Bắt buộc**.
- `requestId`: Chuỗi do bạn tự sinh (UUID, timestamp...). Server sẽ trả đúng giá trị này để bạn khớp log. **Tùy chọn** (khuyên dùng).
- `aiRequestTimeoutMs`: Timeout tối đa (ms) cho mỗi lần gọi Gemini. Server dùng `Promise.race()` để cưỡng bức timeout. **Bắt buộc**. *Giới hạn giá trị: 1 → 300 000 (tương đương 5 phút).* 
- `aiMaxRetries`: Số lần retry tối đa (>= 0) khi Gemini trả lỗi tạm thời. **Bắt buộc**. *Giới hạn giá trị: 0 → 10.*

## 5. Chi tiết từng API

### 5.1 POST /api/ocr/id-card

- **Mô tả:** OCR mặt trước CCCD.
- **Body bổ sung:**
  - `imageBase64` *(string, required)*: ảnh CCCD dạng base64.
  - `documentSide` *(enum, mặc định `FRONT`)* – chỉ giá trị `FRONT` được xử lý.

- **Response `data`:**
  | Field            | Kiểu     | Ghi chú                 |
  |------------------|----------|-------------------------|
  | `documentType`   | `ID_CARD`| Hằng số phân loại       |
  | `fullName`       | string   | Họ tên                   |
  | `dateOfBirth`    | string   | ISO-8601 (`YYYY-MM-DD`) |
  | `documentNumber` | string   | Số CCCD                 |
  | `expiryDate`     | string   | Ngày hết hạn             |
  | `issuingCountry` | string   | Ví dụ `VN`              |
  | `confidenceScore`| number   | 0 → 1, càng cao càng tốt |

**Ví dụ request:**
```json
{
  "geminiApiKey": "YOUR_GEMINI_KEY",
  "model": "gemini-flash-latest",
  "requestId": "req-demo-001",
  "aiRequestTimeoutMs": 5000,
  "aiMaxRetries": 2,
  "imageBase64": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ...",
  "documentSide": "FRONT"
}
```

### 5.2 POST /api/ocr/driver-license

- **Mô tả:** OCR giấy phép lái xe (GPLX).
- **Body bổ sung:**
  - `imageBase64` *(string, required)*: ảnh GPLX dạng base64.
  - `documentSide` *(enum, mặc định `FRONT`)* – bắt buộc gửi `FRONT`. Nếu gửi `BACK`, API trả `CLIENT_ERROR` với `code = UNSUPPORTED_SIDE`.

- **Response `data`:**
  | Field            | Kiểu             | Ghi chú                 |
  |------------------|------------------|-------------------------|
  | `documentType`   | `DRIVER_LICENSE` | Hằng số phân loại       |
  | `fullName`       | string           | Họ tên                  |
  | `dateOfBirth`    | string           | ISO-8601 (`YYYY-MM-DD`) |
  | `licenseNumber`  | string           | Số GPLX                 |
  | `issueDate`      | string           | Ngày cấp                |
  | `expiryDate`     | string           | Ngày hết hạn            |
  | `category`       | string           | Hạng bằng (A1, B2, C...) |
  | `confidenceScore`| number           | 0 → 1, càng cao càng tốt |

### 5.3 POST /api/face/compare

- **Body bổ sung:**
  - `sourceImageBase64` *(string, required)*
  - `targetImageBase64` *(string, required)*
- **Response `data`:**
  | Field             | Kiểu   | Ghi chú                                  |
  |-------------------|--------|------------------------------------------|
  | `similarityScore` | number | 0 → 1, càng gần 1 càng giống             |
  | `isMatch`         | bool   | `true` nếu vượt ngưỡng khớp (80% trở lên)|

### 5.4 POST /api/face/validate

- **Body bổ sung:** `imageBase64`.
- **Response `data`:**
  | Field          | Kiểu   | Ghi chú                                         |
  |----------------|--------|-------------------------------------------------|
  | `isLive`       | bool   | Ảnh có phải người thật/không phải ảnh chụp màn hình |
  | `qualityScore` | number | 0 → 1                                            |
  | `reason`       | string | Mô tả ngắn, ví dụ `OK`, `LOW_QUALITY_OR_NOT_LIVE` |

### 5.5 GET /api/health

  - **Mô tả:** Endpoint kiểm tra nhanh trạng thái dịch vụ (không cần body, chỉ gọi GET).
  - **Response mẫu:**
    ```json
    {
      "status": "UP",
      "env": "production",
      "uptimeSeconds": 12345,
      "timestamp": "2025-11-21T07:00:00.000Z"
    }
    ```
    - `status`: Luôn `UP` nếu server sẵn sàng nhận request mới.
    - `env`: Giá trị `NODE_ENV` hiện tại trên server.
    - `uptimeSeconds`: Số giây server đã chạy từ lần khởi động gần nhất.
    - `timestamp`: thời điểm hệ thống trả phản hồi.

## 6. Mẫu phản hồi lỗi

### 6.1 Thiếu trường bắt buộc / sai mặt thẻ
```json
{
  "status": "CLIENT_ERROR",
  "code": "VALIDATION_ERROR",
  "message": "Request body validation failed",
  "data": {
    "geminiApiKey": { "_errors": ["Required"] },
    "model": { "_errors": ["Required"] }
  },
  "requestId": "1f86...",
  "timestamp": "2025-11-21T04:16:10.010Z"
}
```

```json
{
  "status": "CLIENT_ERROR",
  "code": "UNSUPPORTED_SIDE",
  "message": "Chỉ hỗ trợ OCR mặt trước",
  "data": null,
  "requestId": "req-demo-back",
  "timestamp": "2025-11-21T04:20:00.000Z"
}
```

### 6.2 Lỗi nội bộ/AI provider
```json
{
  "status": "SERVER_ERROR",
  "code": "INTERNAL_ERROR",
  "message": "Gemini provider downtime",
  "data": null,
  "requestId": "51c2...",
  "timestamp": "2025-11-21T05:00:00.000Z"
}
```

## 7. Gợi ý kiểm thử nhanh

### curl (Bash)
```bash
curl -X POST https://api.example.com/api/face/validate \
  -H "Content-Type: application/json" \
  -d '{
        "geminiApiKey": "YOUR_GEMINI_KEY",
        "model": "gemini-flash-latest",
        "requestId": "req-demo-validate",
        "aiRequestTimeoutMs": 5000,
        "aiMaxRetries": 2,
        "imageBase64": "data:image/png;base64,iVBORw0KGgo..."
      }'
```

### Postman
1. Tạo request POST đến endpoint mong muốn.
2. Body → raw JSON, dán payload mẫu.
3. Lưu `geminiApiKey` ở Postman Environment để tái sử dụng.

## 8. SLA & hỗ trợ

| Hạng mục        | Giá trị mặc định                                     |
|-----------------|------------------------------------------------------|
| Thời gian phản hồi | < 2s với ảnh < 5 MB                                |
| Khung giờ hỗ trợ  | 08:00–22:00 GMT+7                                   |
| Bảo trì định kỳ   | Tự động restart vào 03:00 sáng ngày 1 hằng tháng (UTC+7). Docker `restart: always` đảm bảo uptime sau vài giây. |
| Kênh liên hệ      | support@example.com                                 |

> Mọi thay đổi hợp đồng API sẽ được thông báo tối thiểu 2 tuần trước khi áp dụng môi trường production.
