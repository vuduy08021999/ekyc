# API Quản lý P12 (chữ ký số)

Phiên bản: 2025-11-21 — tài liệu cho đội tích hợp và khách hàng kỹ thuật.

## Base path

`/api/signature`

## Tổng quan

- Kiến trúc REST/JSON. Mọi HTTP response trả mã 200; trạng thái nghiệp vụ nằm trong body theo chuẩn `ApiResponse` (`status`: `SUCCESS | CLIENT_ERROR | SERVER_ERROR`).
- File `.p12` và sidecar metadata lưu tại `storage/p12` (có thể đổi qua biến môi trường `P12_STORAGE_DIR`).

## Bảo mật (tóm tắt)

- Passphrase của `.p12` KHÔNG gửi từ client. Server quản lý passphrase cố định qua biến môi trường `SIGN_P12_PASSPHRASE`. Nếu không đặt biến này, server tạm dùng `changeit` và log cảnh báo — KHÔNG dùng mặc định này ở production.

## Chuẩn phản hồi

```json
{
  "status": "SUCCESS | CLIENT_ERROR | SERVER_ERROR",
  "code": "OK | ALREADY_EXISTS | NOT_FOUND | VALIDATION_ERROR | ...",
  "message": "Mô tả ngắn",
  "data": { ... } | null,
  "requestId": "string", // nếu client gửi
  "timestamp": "ISO-8601"
}
```

## Endpoints

| Method | Path | Mô tả |
|---|---|---|
| POST | `/p12` | Tạo file `.p12` cho một `ekycId`. (Client gửi `ekycId`, `subject`, `daysValid`, `overwrite` — KHÔNG gửi passphrase) |
| GET | `/p12/count?prefix=<prefix>` | Đếm file `.p12` có `ekycId` bắt đầu bằng prefix. |
| GET | `/p12?prefix=&limit=&offset=&details=` | Liệt kê file `.p12` theo prefix, phân trang. |
| DELETE | `/p12/:ekycId` | Xóa file `.p12` và sidecar metadata. |

---

### POST /p12 — Tạo P12

**Mục đích:** Server sinh chứng thư tự ký và xuất PKCS#12 (.p12) dựa trên thông tin client; tên file đặt theo `ekycId`.

#### Request body (application/json)

| Trường    | Kiểu     | Bắt buộc | Mô tả |
|-----------|----------|----------|-------|
| ekycId    | string   | ✔️       | Mã định danh nội bộ. Chỉ cho phép ký tự ASCII letters (A–Z a–z), số (0–9), dấu gạch dưới `_` và dấu gạch ngang `-`. Regex: `^[A-Za-z0-9_-]{1,128}$`. Tối đa 128 ký tự |
| overwrite | boolean  | ✳️       | Ghi đè file nếu đã tồn tại (mặc định: `false`). |
| subject   | object   | ✳️       | Thông tin subject của certificate (xem bảng chi tiết bên dưới). |
| daysValid | number   | ✳️       | Số ngày hiệu lực của certificate (mặc định: `3650`). |

Ví dụ:

```jsonc
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

#### Trường trong `subject` (chi tiết)

| Trường           | Kiểu   | Mô tả |
|------------------|--------|-------|
| commonName       | string | Common Name (CN). Tên hiển thị; recommended max length 64. |
| email            | string | Email liên hệ (RFC-style). |
| organizationName | string | Tên tổ chức/công ty. |
| countryName      | string | Mã quốc gia ISO 3166-1 alpha-2 (2 ký tự), ví dụ: `VN`. |

Chú ý: các trường trong `subject` là tùy chọn; server sẽ dùng `ekycId` làm `commonName` nếu `subject` không được cung cấp.

#### Hành vi

- Nếu `overwrite=false` và file tồn tại → trả `CLIENT_ERROR` `code=ALREADY_EXISTS` (trong body).
- Nếu `overwrite=true` → file sẽ được ghi đè hoàn toàn: service tạo file tạm (ví dụ `abc123.p12.1618033988.tmp`) rồi rename về tên đích. Trên hệ thống POSIX thao tác rename thường là atomic; trên Windows nếu rename trên file tồn tại thất bại, service sẽ thử xóa file cũ rồi rename. Kết quả là file `.p12` cũ bị thay thế hoàn toàn bằng file mới.
- Sau khi `.p12` được ghi, server sẽ tạo/ghi đè sidecar `<ekycId>.json` chứa metadata (`serialNumber`, `fingerprint`, `createdAt`). Lưu ý: nếu việc ghi sidecar thất bại sau khi `.p12` đã được cập nhật, có thể tồn tại `.p12` mới mà sidecar không được cập nhật; client nên gọi `GET /p12?details=true` để xác minh metadata nếu cần.
- Nếu thao tác ghi/rename thất bại (ví dụ vì file đang được lock hoặc quyền), API trả `SERVER_ERROR` trong body (HTTP header vẫn 200 theo quy ước). Server cố gắng dọn file tạm nếu có, nhưng không đảm bảo rollback hoàn toàn của file `.p12` trong mọi trường hợp.

#### Response `data` (thành công)

| Trường        | Kiểu     | Mô tả |
|---------------|----------|-------|
| ekycId        | string   | Mã định danh đã tạo |
| filename      | string   | Tên file `.p12` trên server |
| path          | string   | Đường dẫn tuyệt đối tới file trên server |
| createdAt     | string   | Thời điểm tạo (ISO-8601) |
| serialNumber  | string   | Serial number của certificate |
| fingerprint   | string   | SHA-256 fingerprint của certificate |

Ví dụ:

```json
{
  "ekycId": "abc123",
  "filename": "abc123.p12",
  "path": "storage/p12/abc123.p12",
  "createdAt": "2025-11-21T12:34:56.789Z",
  "serialNumber": "0123456789abcdef...",
  "fingerprint": "abcdef0123456789..."
}
```

---

### GET /p12/count — Đếm theo prefix

- Query: `prefix` (ví dụ `abc*` hoặc `abc`). Nếu không gửi → đếm toàn bộ.
- Response `data`: `{ "prefix": "abc", "count": 42 }`.

---

### GET /p12 — Liệt kê theo prefix (phân trang)

- Query params: `prefix`, `limit` (default 100), `offset` (default 0), `details` (boolean).
- Nếu `details=true`: server cố gắng đọc sidecar metadata để trả `serialNumber`/`fingerprint`.

- Response `data` (ví dụ):

```json
{
  "total": 123,
  "items": [
    { "ekycId": "abc1", "filename": "abc1.p12", "sizeBytes": 12345, "createdAt": "...", "serialNumber": "...", "fingerprint": "..." },
    { "ekycId": "abc2", "filename": "abc2.p12", "sizeBytes": 54321, "createdAt": "..." }
  ]
}
```

---

### DELETE /p12/:ekycId — Xóa P12

- Path param: `ekycId`.
- Hành vi: xóa file và sidecar; nếu không tìm thấy → trả `CLIENT_ERROR` `code=NOT_FOUND`.

## Ràng buộc & validation (chi tiết)

### Quy tắc `ekycId`

- Pattern (server-side): `^[A-Za-z0-9_-]{1,128}$` — chỉ cho phép ký tự ASCII letters (A–Z a–z), chữ số (0–9), dấu gạch dưới `_` và dấu gạch ngang `-`. Độ dài từ 1 đến 128 ký tự.
- Không cho phép khoảng trắng, dấu chấm (`.`), dấu gạch chéo (`/`), hoặc dấu backslash (`\\`), hoặc ký tự Unicode (ví dụ: `đ`, `á`). Các ký tự này bị từ chối để tránh path traversal và các vấn đề với hệ thống file.

Ví dụ hợp lệ:
- `abc`, `user_123`, `AC-01`, `a1_b2-c3`

Ví dụ không hợp lệ (bị server từ chối):
- `user.name` (chứa `.`)
- `user name` (chứa khoảng trắng)
- `../secret` hoặc `sub/dir` (chứa `/` gây path traversal)
- `đặng` (ký tự Unicode)
- `` (chuỗi rỗng)
- chuỗi dài hơn 128 ký tự

### Hành vi khi input không hợp lệ

- Server sử dụng validator (Zod) để kiểm tra request. Nếu `ekycId` không phù hợp sẽ trả `status: "CLIENT_ERROR"`, `code: "VALIDATION_ERROR"` và `data` mô tả lỗi (ví dụ như trường `ekycId` bị lỗi). HTTP header vẫn là 200 theo quy ước dự án.

Ví dụ phản hồi lỗi (validation):

```json
{
  "status": "CLIENT_ERROR",
  "code": "VALIDATION_ERROR",
  "message": "Request body validation failed",
  "data": { "ekycId": { "_errors": ["Invalid format: only A-Za-z0-9_- allowed"] } },
  "timestamp": "2025-11-21T12:34:56.789Z"
}
```

### Snippet kiểm tra phía client

JavaScript (Node / browser):

```js
const EKYC_RE = /^[A-Za-z0-9_-]{1,128}$/;
function validateEkycId(id) {
  if (typeof id !== 'string') return false;
  return EKYC_RE.test(id);
}
```

PowerShell:

```powershell
$ekycId = 'abc123'
if (-not ($ekycId -match '^[A-Za-z0-9_-]{1,128}$')) {
  Write-Error 'ekycId invalid'
}
```

### Lý do và khuyến nghị

- Vì file `.p12` được lưu trên filesystem theo tên `ekycId.p12`, giới hạn ký tự giúp tránh path traversal, encoding issues và rủi ro khi di chuyển giữa hệ điều hành (Windows/Unix) hoặc khi làm backup/restore.
- Nếu bạn cần lưu tên hiển thị có dấu hoặc khoảng trắng (ví dụ tên người dùng tiếng Việt), hãy gửi trường `displayName`/`subject.commonName` trong body; `ekycId` vẫn giữ dạng an toàn để lưu file. Lưu `displayName` trong sidecar metadata nếu cần hiển thị cho người dùng.
- Client nên trim whitespace trước khi gửi và có thể URL-encode khi sử dụng `ekycId` trong URL path.

## Bảo mật & vận hành

- Bắt buộc authentication & RBAC trên production.
- Quản lý private key / secrets nên đặt trong KMS/HSM hoặc biến môi trường an toàn; không commit vào mã nguồn.
- Revocation: cân nhắc CRL hoặc chứng thư ngắn hạn (short-lived) tùy yêu cầu.

## Mẫu phản hồi lỗi

### Thiếu/không hợp lệ field

```json
{
  "status": "CLIENT_ERROR",
  "code": "VALIDATION_ERROR",
  "message": "Request body validation failed",
  "data": { "ekycId": { "_errors": ["Required or invalid format"] } },
  "requestId": "...",
  "timestamp": "..."
}
```

### Đã tồn tại (overwrite=false)

```json
{
  "status": "CLIENT_ERROR",
  "code": "ALREADY_EXISTS",
  "message": "P12 already exists",
  "data": null,
  "timestamp": "..."
}
```

## Gợi ý kiểm thử nhanh

### PowerShell

Tạo P12 (KHÔNG gửi passphrase):
```powershell
$body = @{
  ekycId = "abc123"
  overwrite = $false
  subject = @{ commonName = "Nguyen Van A"; email = "a@example.com" }
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/api/signature/p12" -Method Post -Body $body -ContentType "application/json"
```

Đếm theo prefix:
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/signature/p12/count?prefix=abc*" -Method Get
```

Liệt kê (có details):
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/signature/p12?prefix=abc*&limit=50&offset=0&details=true" -Method Get
```

Xóa:
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/signature/p12/abc123" -Method Delete
```

### curl (bash)

```bash
curl -X POST http://localhost:3000/api/signature/p12 \
  -H "Content-Type: application/json" \
  -d '{"ekycId":"abc123","overwrite":false,"subject":{"commonName":"Nguyen Van A","email":"a@example.com"}}'
```

## Vị trí code liên quan

- `src/modules/signature/` — `signature.routes.ts`, `signature.service.ts`, `cert_generator.ts`, `signature.validation.ts`.

---

Nếu bạn muốn tôi tiếp tục mở rộng (nhúng marker HMAC, hoặc thêm endpoint sign/verify PDF), cho biết lựa chọn để tôi triển khai tiếp.
