# API PDF — Sign & Verify

> **Phiên bản:** 2025-12-01

## 1. Tổng quan

| Thông tin | Giá trị |
|-----------|---------|
| Base path | `/api/pdf` |
| Content-Type | `application/json` |
| Dung lượng PDF tối đa | 20 MB |
| Đơn vị tọa độ | PDF points (72 points = 1 inch ≈ 2.54 cm) |

---

## 2. Chuẩn phản hồi

```json
{
  "status": "SUCCESS | CLIENT_ERROR | SERVER_ERROR",
  "code": "OK | VALIDATION_ERROR | ...",
  "message": "Mô tả ngắn",
  "data": { },
  "requestId": "string",
  "timestamp": "ISO-8601"
}
```

---

## 3. Endpoints

| Method | Path | Mô tả |
|--------|------|-------|
| POST | `/sign` | Ký invisible PDF |
| POST | `/sign/visible` | Ký visible với nhiều signer |
| POST | `/verify` | Xác minh chữ ký trong PDF |
| POST | `/find-anchor` | Tìm tọa độ anchor phrase |

---

## 4. Chi tiết từng endpoint

### 4.1. POST /api/pdf/sign

Ký số invisible một PDF bằng P12 đã lưu trên server.

**Request body:**

| Trường | Kiểu | Bắt buộc | Mô tả |
|--------|------|----------|-------|
| `ekycId` | string | ✔️ | Mã định danh P12 |
| `pdfBase64` | string | ✔️ | PDF dạng base64 (≤ 20MB) |
| `reason` | string | | Lý do ký |
| `location` | string | | Địa điểm ký |
| `name` | string | | Tên người ký |
| `contactInfo` | string | | Thông tin liên hệ |
| `requestId` | string | | ID để map response |

**Response `data`:**

```json
{ "pdfBase64": "<signed-pdf-base64>" }
```

---

### 4.2. POST /api/pdf/sign/visible

Ký visible với nhiều signer, hỗ trợ anchor phrase để tự động định vị.

**Request body:**

| Trường | Kiểu | Bắt buộc | Mô tả |
|--------|------|----------|-------|
| `pdfBase64` | string | ✔️ | PDF dạng base64 (≤ 20MB) |
| `signers` | array | ✔️ | Danh sách người ký (tối thiểu 1) |
| `requestId` | string | | ID để map response |

**Cấu trúc mỗi signer:**

| Trường | Kiểu | Bắt buộc | Mô tả |
|--------|------|----------|-------|
| `ekycId` | string | ✔️ | Mã định danh P12 |
| `page` | number | | Trang ký (mặc định: 1) |
| `x` | number | | Tọa độ X (points) |
| `y` | number | | Tọa độ Y (points) |
| `width` | number | | Chiều rộng box (mặc định: 180) |
| `height` | number | | Chiều cao box (mặc định: 50) |
| `anchorPhrase` | string | | Từ khóa để định vị tự động |
| `paddingLeft` | number | | Dịch trái từ vị trí anchor/x (mặc định: 0) |
| `drawBorder` | boolean | | Vẽ viền box (mặc định: `true` khi dùng x/y, `false` khi dùng anchor) |
| `showDate` | boolean | | Hiển thị ngày ký (mặc định: `true`) |
| `reason` | string | | Lý do ký |
| `location` | string | | Địa điểm ký |
| `name` | string | | Tên người ký |
| `contactInfo` | string | | Thông tin liên hệ |
| `appearance` | object | | Tùy chỉnh hiển thị |

**Cấu trúc `appearance`:**

| Trường | Kiểu | Mô tả |
|--------|------|-------|
| `color` | string | Màu chữ hex (vd: `#000000`) |
| `fontSize` | number | Cỡ chữ (mặc định: 12) |

**Quy tắc định vị:**

1. **Dùng `anchorPhrase`:** Server tìm từ khóa trong PDF và đặt chữ ký 1cm bên dưới. Tọa độ `x` sẽ là `anchor.x - paddingLeft`.

2. **Dùng `x, y, width, height`:** Định vị thủ công. Tọa độ `x` sẽ là `x - paddingLeft`.

3. **Không truyền gì:** Đặt mặc định góc dưới trái (36, 36).

**Ví dụ request:**

```json
{
  "pdfBase64": "<base64>",
  "signers": [
    {
      "ekycId": "user1",
      "anchorPhrase": "Chữ ký bên A",
      "paddingLeft": 50,
      "name": "Nguyen Van A",
      "reason": "Ký hợp đồng",
      "location": "Ha Noi",
      "showDate": true
    },
    {
      "ekycId": "user2",
      "page": 2,
      "x": 350,
      "y": 100,
      "width": 200,
      "height": 60,
      "paddingLeft": 0,
      "drawBorder": true,
      "name": "Tran Van B"
    }
  ]
}
```

**Response `data`:**

```json
{ "pdfBase64": "<signed-pdf-base64>" }
```

---

### 4.3. POST /api/pdf/verify

Xác minh các chữ ký PKCS#7 trong PDF.

**Request body:**

| Trường | Kiểu | Bắt buộc | Mô tả |
|--------|------|----------|-------|
| `pdfBase64` | string | ✔️ | PDF dạng base64 (≤ 20MB) |
| `details` | boolean | | Trả chi tiết certificate |
| `requestId` | string | | ID để map response |

**Response `data`:**

```json
{
  "total": 2,
  "signatures": [
    {
      "index": 1,
      "ekycId": "user1",
      "serverSigned": true,
      "certs": [
        {
          "subject": "CN=Nguyen Van A",
          "issuer": "CN=Nguyen Van A",
          "validFrom": "2025-01-01",
          "validTo": "2035-01-01"
        }
      ]
    },
    {
      "index": 2,
      "ekycId": null,
      "serverSigned": false,
      "error": "Certificate not issued by server"
    }
  ]
}
```

**Giải thích:**

- `serverSigned: true` — Chứng thư do server cấp (xác minh qua OID hoặc sidecar metadata)
- `ekycId` — Mã định danh người ký (nếu server quản lý)

---

### 4.4. POST /api/pdf/find-anchor

Tìm tọa độ của anchor phrase trong PDF.

**Request body:**

| Trường | Kiểu | Bắt buộc | Mô tả |
|--------|------|----------|-------|
| `pdfBase64` | string | ✔️ | PDF dạng base64 (≤ 20MB) |
| `anchorPhrase` | string | ✔️ | Từ khóa cần tìm |
| `page` | number | | Giới hạn tìm trong trang cụ thể |
| `requestId` | string | | ID để map response |

**Response `data`:**

```json
{
  "found": true,
  "matches": [
    {
      "page": 1,
      "x": 42.37,
      "y": 90.69,
      "width": 120.5,
      "height": 12
    }
  ]
}
```

**Lưu ý:** Tọa độ trả về theo đơn vị PDF points. Dùng API này để xem trước vị trí trước khi gọi `/sign/visible`.

---

## 5. Ví dụ request

**PowerShell - Ký visible:**

```powershell
$body = @{
  pdfBase64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes("contract.pdf"))
  signers = @(
    @{
      ekycId = "user1"
      anchorPhrase = "Chữ ký bên A"
      paddingLeft = 50
      name = "Nguyen Van A"
    }
  )
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Uri "http://localhost:3000/api/pdf/sign/visible" `
  -Method Post -Body $body -ContentType "application/json"
```

**curl - Tìm anchor:**

```bash
curl -X POST http://localhost:3000/api/pdf/find-anchor \
  -H "Content-Type: application/json" \
  -d '{
    "pdfBase64": "<base64>",
    "anchorPhrase": "Chữ ký bên A"
  }'
```

---

## 6. Mẫu phản hồi lỗi

**PDF không hợp lệ:**

```json
{
  "status": "CLIENT_ERROR",
  "code": "VALIDATION_ERROR",
  "message": "pdfBase64 must be valid base64 and <= 20MB",
  "data": null,
  "timestamp": "..."
}
```

**Không tìm thấy P12:**

```json
{
  "status": "CLIENT_ERROR",
  "code": "NOT_FOUND",
  "message": "P12 file not found for ekycId: user1",
  "data": null,
  "timestamp": "..."
}
```

**Không tìm thấy anchor:**

```json
{
  "status": "SUCCESS",
  "code": "OK",
  "message": "Anchor phrase search result",
  "data": {
    "found": false,
    "matches": []
  },
  "timestamp": "..."
}
```
