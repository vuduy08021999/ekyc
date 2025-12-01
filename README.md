# HƯỚNG DẪN CÀI ĐẶT & CHẠY (thư mục `test`)

Tệp này chỉ chứa hướng dẫn ngắn gọn để cài đặt và chạy dịch vụ thử nghiệm nằm trong `test`.

Yêu cầu:

- Node.js (khuyến nghị LTS, ví dụ v18+)
- npm
- (Tùy chọn) Docker

1) Cài đặt và build

Mở terminal ở thư mục gốc của repository và chạy:

```pwsh
# Cài dependencies cho thư mục test
npm --prefix test ci

# Build TypeScript -> dist
npm --prefix test run build
```

2) Chạy dịch vụ

Chạy ở chế độ phát triển (auto-reload):

```pwsh
npm --prefix test run dev
```

Chạy ở chế độ production (build rồi chạy):

```pwsh
npm --prefix test ci
npm --prefix test run build
npm --prefix test start
```

Hoặc thiết lập biến môi trường rồi chạy trực tiếp:

```pwsh
$env:SIGN_P12_PASSPHRASE='changeit'; $env:SIGN_SECURITY_SECRET='changeit'; npm --prefix test start
```

3) Biến môi trường quan trọng

- `SIGN_P12_PASSPHRASE` — passphrase dùng khi đọc/ghi file `.p12` (dev mặc định: `changeit`).
- `SIGN_SECURITY_SECRET` — secret dùng để gắn marker cho chứng chỉ do server tạo.
- `P12_STORAGE_DIR` — đường dẫn tới thư mục chứa `.p12` (mặc định: `test/storage/p12`).
- `PORT` — cổng HTTP (mặc định: `3000`).

4) Tạo thư mục lưu P12 (nếu cần)

```pwsh
New-Item -ItemType Directory -Path .\test\storage\p12 -Force
```

5) (Tùy chọn) Chạy bằng Docker

Xây image (từ thư mục gốc):

```pwsh
docker build -t ekyc-test -f Dockerfile .
```

Chạy container (ví dụ ánh xạ thư mục P12 từ host vào container):

```pwsh
docker run -d --name ekyc-deheus --restart=always -p 3000:3000 -e SIGN_P12_PASSPHRASE=superp11442ssekycdeheus20226985 -e SIGN_SECURITY_SECRET=superp11442ssekycdeheus20226985 -v "D:\Arito\ekyc-deheus\storage\p12:C:\app\storage\p12"  --log-opt max-size=10m  --log-opt max-file=5  ekyc-deheus
```

Lưu ý: điều chỉnh đường dẫn `-v` theo môi trường của bạn.

6) Kiểm tra

- Khi server chạy, xem log sẽ thấy `Server listening on port 3000`.
- API chính nằm tại `http://localhost:3000` (chi tiết route trong `test/src/modules/pdf`).

Nếu bạn cần tôi bổ sung ví dụ curl cho các API (tạo P12, sign, verify) hoặc chuyển toàn bộ README sang tiếng Việt đầy đủ hơn, báo tôi biết.

