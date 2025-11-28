# API PDF — Sign & Verify

Phiên bản: 2025-11-27 — Tài liệu dành cho client/đối tác tích hợp.

Base path: `/api/pdf`

Tổng quan

Các biến môi trường quan trọng

Format chung

Endpoints chính
| Method | Path | Mô tả |
|---|---|---|
| POST | `/sign` | Ký invisible PDF bằng chứng thư server lưu sẵn (ekycId). |
| POST | `/sign/visible` | Chèn appearance visible cho một hoặc nhiều signer rồi ký tuần tự (multi-signer). |
| POST | `/verify` | Trích xuất và phân tích các signature PKCS#7 trong PDF. |

POST /sign

Mục đích: ký số (invisible) một PDF bằng P12 đã lưu trên server. Đây là endpoint chính để client gọi khi cần ký bằng P12 server-managed.

Request body
```json
{
	"ekycId": "string",
	"pdfBase64": "string",
	"reason": "string?",
	"location": "string?",
	"name": "string?",
	"contactInfo": "string?",
	"requestId": "string?"
}
```

Behavior

Response `data` (thành công)
```json
{ "pdfBase64": "<signed-pdf-base64>" }
```

POST /sign/visible

Mục đích: Chèn vùng hiển thị (visible appearance) cho nhiều signer và ký tuần tự để mỗi signer có chữ ký riêng (preserve previous signatures).

Request body
```json
{
	"pdfBase64": "string",
	"signers": [
		{
			"ekycId": "string",
			"anchorPhrase": "string?",
			"page": 1,
			"x": 100, "y": 200,
			"width": 180, "height": 50,
			"name": "string?",
			"reason": "string?",
			"location": "string?",
			"contactInfo": "string?",
			"drawBorder": true|false,
			"appearance": { "color": "#rrggbb", "fontSize": 10 }
		}
	],
	"requestId": "string?"
}
```

Important rules (anchorPhrase)
	1) `pdfjs` text extraction;
	2) `pdf2json` Node API;
	3) resave PDF (no object streams) + `pdf2json` CLI fallback.
	- Đơn vị: PDF points (72 points = 1 inch). 1 cm = 72 / 2.54 ≈ 28.3464567 points.
	- Không vẽ border khi `anchorPhrase` được sử dụng (bất kể `drawBorder` gửi từ client).
	- Padding ngang cho text trong box khi anchorPhrase dùng = 0 → text không thụt dòng, align flush-left với anchor left.

Response `data` (thành công)
```json
{ "pdfBase64": "<signed-pdf-base64>" }
```

POST /verify

Request body
```json
{ "pdfBase64": "string", "details": true|false, "requestId": "string?" }
```

Behavior
	- Primary: tìm extension OID `1.3.6.1.4.1.55555.1.2` chứa JSON `{ ekycId, code }` (code = HMAC(ekycId, SIGN_SECURITY_SECRET)). Nếu khớp → `serverSigned=true`.
	- Fallback: sidecar metadata trong `P12_STORAGE_DIR` mapping fingerprint → `{ ekycId, securityCode }`.

Response `data` (thành công)
```json
{
	"total": 2,
	"signatures": [
		{ "index": 1, "ekycId": "test1p12", "serverSigned": true, "certs": [ /* cert infos */ ] },
		{ "index": 2, "error": "parse error" }
	]
}
```
 