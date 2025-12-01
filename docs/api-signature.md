# API Quản lý P12 (Chữ ký số)

> **Phiên bản:** 2025-12-01

## 1. Tổng quan

| Thông tin | Giá trị |
|-----------|---------|
| Base path | `/api/signature` |
| Content-Type | `application/json` |
| Lưu trữ | `storage/p12` (có thể thay đổi qua `P12_STORAGE_DIR`) |

**Bảo mật:** Passphrase của `.p12` do server quản lý qua biến môi trường `SIGN_P12_PASSPHRASE`. Client không cần gửi passphrase.

---

## 2. Chuẩn phản hồi

```json
{
  "status": "SUCCESS | CLIENT_ERROR | SERVER_ERROR",
  "code": "OK | ALREADY_EXISTS | NOT_FOUND | VALIDATION_ERROR | ...",
  "message": "Mô tả ngắn",
  "data": { },
  "requestId": "string",
  "timestamp": "ISO-8601"
}
```

---

## 3. Quy tắc `ekycId`

| Ràng buộc | Giá trị |
|-----------|---------|
| Pattern | `^[A-Za-z0-9_-]{1,128}$` |
| Độ dài | 1 → 128 ký tự |
| Cho phép | `A-Z`, `a-z`, `0-9`, `_`, `-` |
| Không cho phép | Khoảng trắng, dấu chấm, `/`, `\`, Unicode |

**Ví dụ hợp lệ:** `abc123`, `user_123`, `AC-01`

**Ví dụ không hợp lệ:** `user.name`, `user name`, `../secret`, `đặng`

---

## 4. Endpoints

### 4.1. POST /api/signature/p12

Tạo file `.p12` cho một `ekycId`.

**Request body:**

| Trường | Kiểu | Bắt buộc | Mô tả |
|--------|------|----------|-------|
| `ekycId` | string | ✔️ | Mã định danh (theo quy tắc trên) |
| `overwrite` | boolean | | Ghi đè nếu đã tồn tại (mặc định: `false`) |
| `subject` | object | | Thông tin certificate |
| `daysValid` | number | | Số ngày hiệu lực (mặc định: `3650`) |
| `requestId` | string | | ID để map response |

**Trường `subject`:**

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `commonName` | string | Tên hiển thị (CN) |
| `email` | string | Email liên hệ |
| `organizationName` | string | Tên tổ chức |
| `countryName` | string | Mã quốc gia (vd: `VN`) |

**Ví dụ request:**

```json
{
  "ekycId": "abc123",
  "overwrite": false,
  "subject": {
    "commonName": "Nguyen Van A",
    "email": "a@example.com",
    "organizationName": "Cong ty ABC",
    "countryName": "VN"
  },
  "daysValid": 3650
}
```

**Response `data`:**

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `ekycId` | string | Mã định danh |
| `filename` | string | Tên file `.p12` |
| `path` | string | Đường dẫn file |
| `createdAt` | string | Thời điểm tạo (ISO-8601) |
| `serialNumber` | string | Serial number của certificate |
| `fingerprint` | string | SHA-256 fingerprint |

---

### 4.2. GET /api/signature/p12/count

Đếm file `.p12` theo prefix.

**Query params:**

| Param | Mô tả |
|-------|-------|
| `prefix` | Lọc theo prefix (vd: `abc`). Bỏ trống = đếm tất cả |

**Response `data`:**

```json
{ "prefix": "abc", "count": 42 }
```

---

### 4.3. GET /api/signature/p12

Liệt kê file `.p12` (có phân trang).

**Query params:**

| Param | Mô tả | Mặc định |
|-------|-------|----------|
| `prefix` | Lọc theo prefix | |
| `limit` | Số item tối đa | 100 |
| `offset` | Bỏ qua N item đầu | 0 |
| `details` | Trả thêm metadata (`serialNumber`, `fingerprint`) | false |

**Response `data`:**

```json
{
  "total": 123,
  "items": [
    {
      "ekycId": "abc1",
      "filename": "abc1.p12",
      "sizeBytes": 12345,
      "createdAt": "...",
      "serialNumber": "...",
      "fingerprint": "..."
    }
  ]
}
```

---

### 4.4. DELETE /api/signature/p12/:ekycId

Xóa file `.p12` và metadata.

**Path param:** `ekycId`

**Response:** Trả `NOT_FOUND` nếu không tìm thấy.

---

## 5. Ví dụ request

**PowerShell - Tạo P12:**

```powershell
$body = @{
  ekycId = "abc123"
  overwrite = $false
  subject = @{ commonName = "Nguyen Van A"; email = "a@example.com" }
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/api/signature/p12" `
  -Method Post -Body $body -ContentType "application/json"
```

**curl - Tạo P12:**

```bash
curl -X POST http://localhost:3000/api/signature/p12 \
  -H "Content-Type: application/json" \
  -d '{"ekycId":"abc123","subject":{"commonName":"Nguyen Van A"}}'
```

---

## 6. Mẫu phản hồi lỗi

**Validation error:**

```json
{
  "status": "CLIENT_ERROR",
  "code": "VALIDATION_ERROR",
  "message": "Request body validation failed",
  "data": { "ekycId": { "_errors": ["Invalid format"] } },
  "timestamp": "..."
}
```

**Đã tồn tại:**

```json
{
  "status": "CLIENT_ERROR",
  "code": "ALREADY_EXISTS",
  "message": "P12 already exists",
  "data": null,
  "timestamp": "..."
}
```
