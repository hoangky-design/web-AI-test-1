# Hinton Media — website + khu học viên + trang quản trị

Thư mục gồm 2 phần:

| Phần | Ở đâu | Chạy được trên |
|---|---|---|
| Website giới thiệu (Trang chủ, Giới thiệu, Dịch vụ, Khóa học, Tin tức, Hoạt động, Khách hàng, Liên hệ) | `public/` | Bất kỳ hosting tĩnh nào **hoặc** máy chủ Node bên dưới |
| Khu học viên (đăng ký, đăng nhập, mua khóa học bằng chuyển khoản, xem video) + Quản trị (khóa học, video, thanh toán, khách hàng, bài viết, cài đặt) + Tin tức | `server/` + `public/` | **Chỉ máy chủ Node** (VPS, Render, Railway, Fly.io…) |

> GitHub Pages / Netlify Drop chỉ chạy được phần web tĩnh. Đăng nhập, mua khóa học, xem video, tin tức và quản trị **cần máy chủ Node**.

## 1. Chạy thử trên máy

Cần Node.js 18 trở lên (khuyên dùng 20/22) và `ffmpeg` nếu muốn tạo video mẫu.

```bash
npm install
cp .env.example .env          # rồi mở .env để sửa (xem mục 3)
npm run create-admin -- --email ban@congty.vn --password "mat-khau-dai-it-nhat-10-ky-tu"
npm start                     # http://localhost:8080
```

> `.npmrc` đặt `ignore-scripts=true`: better-sqlite3 và bcrypt đã kèm sẵn bản biên dịch cho Linux/macOS/Windows (x64/arm64) nên không cần trình biên dịch. Chỉ khi chạy trên nền tảng lạ mới cần xóa dòng đó và cài `build-essential`.

- Trang quản trị: `http://localhost:8080/quan-tri.html` (đăng nhập bằng tài khoản quản trị).
- Khu học viên: `http://localhost:8080/bai-hoc-cua-toi.html`.

### Dữ liệu mẫu (tùy chọn, chỉ để thử)

```bash
npm run seed-demo
```

Tạo 2 khóa học `[DEMO]` × 2 video mẫu (ffmpeg), 2 bài viết `[DEMO]`, và 2 tài khoản thử:

| Vai trò | Email | Mật khẩu |
|---|---|---|
| Quản trị (demo) | `admin.demo@example.com` | `AdminDemo#2026` |
| Học viên (demo) | `hocvien.demo@example.com` | `HocVienDemo#2026` |

**Trước khi ra mắt:** xóa các khóa học/bài viết `[DEMO]` trong Quản trị, khóa tài khoản demo (Quản trị › Khách hàng › Khóa TK) hoặc chạy trên cơ sở dữ liệu mới không có dữ liệu mẫu.

### Kiểm tra tự động

Khi máy chủ đang chạy (và đã có dữ liệu mẫu):

```bash
npm run verify
```

Chạy toàn bộ luồng: đăng ký → khóa học bị khóa → báo chuyển khoản → quản trị duyệt → xem video (HTTP Range 206) → quản trị đóng quyền (403) → hết hạn → khóa tài khoản; cùng các kiểm tra phân quyền, chống CSRF, lọc XSS bài viết, kiểm tra tệp tải lên. Mỗi lần chạy tạo thêm 1 tài khoản `[TEST]`.

## 2. Tạo / đặt lại tài khoản quản trị

- Cách 1: `npm run create-admin -- --email ... --password "..."` (chạy lại với cùng email để đặt lại mật khẩu).
- Cách 2: điền `ADMIN_EMAIL` + `ADMIN_PASSWORD` trong `.env`; lần khởi động đầu tiên (khi chưa có quản trị viên) sẽ tự tạo. Sau đó nên xóa mật khẩu khỏi `.env`.
- Đổi mật khẩu: Quản trị › Cài đặt › Đổi mật khẩu quản trị.

## 3. Điền thông tin chuyển khoản (bắt buộc trước khi bán)

Quản trị › **Cài đặt** › Thông tin chuyển khoản: Tên ngân hàng, **Mã ngân hàng VietQR** (ví dụ `VCB` hoặc BIN `970436`, tra tại vietqr.io), Số tài khoản, Chủ tài khoản (in hoa không dấu).

- Khi còn trống, học viên thấy `[CẦN BỔ SUNG — …]` và không có mã QR.
- Khi đủ thông tin, mỗi khóa học hiện ảnh VietQR (`img.vietqr.io`) với đúng **số tiền** và **nội dung chuyển khoản** riêng cho từng học viên + khóa học: `HM<mã học viên>K<mã khóa học>` (ví dụ `HM12K3`).
- Có thể điền sẵn trong `.env` (`BANK_*`) — chỉ dùng ở lần chạy đầu.

## 4. Quy trình bán khóa học

1. Quản trị › **Khóa học** › Thêm khóa học (tên, mô tả, học phí, ảnh, «Mở bán») › **Video** › Thêm video (tải tệp MP4 lên, hoặc link YouTube *không công khai*/Vimeo).
2. Học viên vào **Khóa học** › «Mua & học online» › tạo tài khoản › thấy bảng chuyển khoản › chuyển khoản › bấm **Tôi đã chuyển khoản**.
3. Quản trị › **Thanh toán** › đối chiếu sao kê (số tiền + nội dung) › **Duyệt** → khóa học mở ngay cho học viên. (Hoặc Từ chối.)
4. Quản trị › **Khách hàng** › «Quyền khóa học»: mở/đóng từng khóa cho từng người, đặt ngày hết hạn; «Khóa TK» để chặn đăng nhập.

Trang `khoa-hoc.html` tự lấy các khóa học đang mở bán từ máy chủ. Mảng `COURSES` trong `public/courses.js` chỉ là dữ liệu dự phòng khi chạy web tĩnh (đặt `COURSES_API = null` nếu chỉ deploy tĩnh).

## 5. Bài viết / Tin tức

Quản trị › **Bài viết** › Viết bài mới: tiêu đề, tóm tắt, ảnh bìa, chuyên mục, nội dung Markdown (thanh công cụ: đậm, nghiêng, tiêu đề, danh sách, trích dẫn, liên kết, chèn ảnh), Nháp/Đăng, ngày đăng (ngày tương lai = hẹn giờ). HTML được lọc ở máy chủ (chống XSS). Bài đã đăng hiện ở `tin-tuc.html`, `bai-viet.html?slug=…` và 3 bài mới nhất ở cuối `hoat-dong.html`.

## 6. Bảo mật — đã làm và giới hạn

- Mật khẩu băm bằng **bcrypt** (12 vòng). Phiên đăng nhập: cookie `hm_sid` **HttpOnly, SameSite=Lax** (+ `Secure` khi `COOKIE_SECURE=true`), lưu trong SQLite, hết hạn sau `SESSION_DAYS`.
- Mọi API quản trị kiểm tra vai trò `admin` **ở máy chủ**; trang `quan-tri.html` và `bai-hoc-cua-toi.html` chuyển hướng về đăng nhập nếu chưa đủ quyền.
- Chống CSRF: mọi yêu cầu ghi phải có header `X-HM-Request` (form giả mạo từ trang khác không gửi được) + SameSite.
- Giới hạn đăng nhập sai (8 lần / 15 phút theo IP + email).
- Video lưu trong `storage/videos` (ngoài `public/`), chỉ phát qua `/api/videos/:id/stream` sau khi kiểm tra quyền **mỗi lần yêu cầu**; hỗ trợ HTTP Range để tua.
- `controlsList="nodownload"`, tắt chuột phải, tắt PiP **chỉ là ngăn cản thông thường**: người có quyền xem vẫn có thể quay màn hình hoặc dùng công cụ tải. Muốn chống tải mạnh hơn cần DRM / dịch vụ video chuyên dụng (Bunny Stream, Cloudflare Stream, Vimeo OTT…). Link YouTube không công khai vẫn có thể bị chia sẻ bởi người đã xem.
- Ảnh tải lên: chỉ JPG/PNG/WebP/GIF, kiểm tra nội dung thật (magic bytes), tối đa `MAX_IMAGE_MB`; không nhận SVG.
- Chưa có: xác minh email, quên mật khẩu tự động (hiện hướng dẫn liên hệ), đối soát ngân hàng tự động (Casso/SePay webhook), Content-Security-Policy.

## 7. Deploy (đưa lên mạng)

Cần hosting chạy được **Node.js lâu dài + ổ đĩa lưu file** (SQLite + video):

- **VPS** (Ubuntu): cài Node 22, `git clone`/tải thư mục, `npm ci --omit=dev`, tạo `.env` (`COOKIE_SECURE=true`, `TRUST_PROXY=1`), chạy bằng `pm2 start server/server.js --name hinton` hoặc systemd, đặt Nginx/Caddy phía trước làm HTTPS (Let's Encrypt). Nginx: tăng `client_max_body_size` (ví dụ `2g`) để tải video lớn.
- **Render / Railway / Fly.io**: chọn dịch vụ Node, lệnh `npm start`, **gắn ổ đĩa bền vững (persistent disk/volume)** vào `data/` và `storage/` — nếu không, dữ liệu và video mất mỗi lần deploy lại.
- Video nhiều/lớn: cân nhắc dùng link nhúng (YouTube không công khai/Vimeo) hoặc dịch vụ video để tiết kiệm băng thông máy chủ.
- Sau khi có tên miền: cập nhật các dòng `TODO(domain)` trong `<head>` mỗi trang.

## 8. Sao lưu

Toàn bộ dữ liệu nằm ở 3 chỗ: `data/hinton.db` (tài khoản, khóa học, thanh toán, bài viết, cài đặt), `storage/videos/`, `storage/uploads/`.

```bash
# Sao lưu CSDL an toàn khi máy chủ đang chạy (cần gói sqlite3):
sqlite3 data/hinton.db ".backup 'backup/hinton-$(date +%F).db'"
# Hoặc không cần sqlite3: dừng máy chủ rồi chép data/hinton.db (kèm -wal, -shm nếu có)
tar czf backup/storage-$(date +%F).tgz storage/
```

Nên đặt cron chạy hằng ngày và chép bản sao ra ngoài máy chủ (Google Drive, S3…). Khôi phục: dừng máy chủ, chép file `.db` và thư mục `storage/` về chỗ cũ, khởi động lại.

## 9. Cấu trúc thư mục

```
public/            web tĩnh (HTML/CSS/JS/ảnh) — styles.css dùng token trong tokens.css
  contact.js       thông tin liên hệ (một chỗ duy nhất)
  courses.js       khóa học dự phòng cho web tĩnh + vẽ thẻ khóa học
  app.js           hàm dùng chung cho các trang có máy chủ
  account.js       đăng ký / đăng nhập      library.js  bài học của tôi
  news.js          tin tức / bài viết       admin.js    trang quản trị
server/            máy chủ Express (server.js, routes-*.js, lib.js, db.js, config.js)
scripts/           create-admin.js, seed-demo.js, verify-e2e.js
storage/videos     video tải lên (không công khai)
storage/uploads    ảnh tải lên (phục vụ qua /uploads/…)
data/              cơ sở dữ liệu SQLite
```

Các chỗ còn `[CẦN BỔ SUNG — …]` (màu xanh cyan) là nội dung chưa có nguồn xác thực: phải thay hết trước khi ra mắt.
