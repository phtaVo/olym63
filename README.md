# Đường Lên Đỉnh Olympia — bản Web tĩnh (HTML/JS)

Bản này thay thế hoàn toàn Google Apps Script (`Code.gs`). Toàn bộ logic
(đọc câu hỏi, chấm điểm bằng Gemini) giờ chạy ngay trên trình duyệt, nên
có thể host miễn phí trên **GitHub Pages**.

## Vì sao phải đổi cách hoạt động

GitHub Pages chỉ phục vụ file tĩnh (HTML/CSS/JS), **không có server** để
chạy `SpreadsheetApp` hay giấu API key như Apps Script làm được. Vì vậy:

1. **Đọc câu hỏi từ Google Sheet**: thay vì gọi `SpreadsheetApp` phía server,
   trang web sẽ tải sheet dưới dạng CSV công khai (endpoint `gviz/tq`).
2. **Chấm điểm bằng Gemini**: trình duyệt gọi thẳng tới Gemini API bằng
   `fetch()`, dùng API key đặt trong `js/config.js`.

⚠️ **Hệ quả bảo mật**: bất kỳ ai mở "View Page Source" trên trang web đều
thấy được API key của bạn. Bắt buộc phải:
- Vào [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → chọn API key
- Mục **Application restrictions** → chọn **HTTP referrers (web sites)**
- Thêm domain GitHub Pages của bạn, ví dụ: `https://<tên-github>.github.io/*`
- Mục **API restrictions** → chỉ cho phép "Generative Language API"

Cách này giới hạn được ai *gọi từ trang web nào*, nhưng không giấu được
key hoàn toàn. Nếu muốn giấu key thật sự, cần một backend nhỏ (Cloudflare
Worker / Vercel serverless function) đứng giữa — vượt phạm vi "web tĩnh".

## Chuẩn bị Google Sheet

1. Mở Google Sheet chứa câu hỏi (2 tab: `KhoiDong`, `VeDich` — cột A = câu hỏi,
   cột B = đáp án, cột C (chỉ VeDich) = điểm 10/20/30).
2. Nút **Share** (Chia sẻ) → **General access** → chọn **Anyone with the link**
   → quyền **Viewer**.
   (Bắt buộc, nếu không trang web sẽ không tải được câu hỏi.)
3. Copy ID sheet từ URL:
   `https://docs.google.com/spreadsheets/d/`**`ĐÂY_LÀ_ID`**`/edit`

## Cấu hình project

Mở file `js/config.js` và điền:
- `SPREADSHEET_ID`: ID sheet ở bước trên
- `SHEET_NAMES`: tên 2 tab (mặc định đã đúng: `KhoiDong`, `VeDich`)
- `GEMINI_API_KEY`: API key Gemini của bạn (lấy tại
  [Google AI Studio](https://aistudio.google.com/app/apikey))

## Cấu trúc thư mục

```
olympia-web/
├── index.html          # Trang chính
├── css/
│   └── style.css       # Toàn bộ giao diện
├── js/
│   ├── config.js        # Sửa API key + Spreadsheet ID ở đây
│   └── app.js            # Logic game (đã port từ Code.gs)
└── assets/               # (tự tạo) logo.png, favicon.png của bạn
```

Thư mục `assets/` chưa có sẵn — logo/favicon gốc là ảnh base64 rất nặng
nên mình để trang web tự bỏ qua nếu thiếu ảnh (`onerror="this.style.display='none'"`).
Nếu muốn có logo, chỉ cần bỏ file `logo.png` (và `favicon.png`) vào thư mục
`assets/`.

## Deploy lên GitHub Pages

### Cách 1 — qua giao diện web (không cần cài gì)

1. Vào [github.com](https://github.com) → **New repository** → đặt tên
   (vd `olympia-web`) → Public → Create repository.
2. Trong repo mới, chọn **Add file → Upload files**, kéo thả toàn bộ nội
   dung thư mục `olympia-web/` (giữ nguyên cấu trúc thư mục `css/`, `js/`).
3. Commit changes.
4. Vào tab **Settings → Pages** (menu bên trái).
5. Mục **Source**, chọn nhánh `main` (hoặc `master`), thư mục `/ (root)`
   → **Save**.
6. Đợi 1–2 phút, GitHub sẽ hiện link dạng:
   `https://<tên-github>.github.io/olympia-web/`
7. Mở link đó — nhớ **thêm chính domain này** vào phần HTTP referrer
   restriction của API key (bước ở trên) trước khi dùng thật.

### Cách 2 — qua terminal / git

```bash
cd olympia-web
git init
git add .
git commit -m "Olympia web tĩnh"
git branch -M main
git remote add origin https://github.com/<tên-github>/olympia-web.git
git push -u origin main
```

Sau đó vào **Settings → Pages** như bước 4-6 ở trên.

## Kiểm tra sau khi deploy

- Mở trang, bấm **Khởi Động** → nếu hiện lỗi "Không tải được câu hỏi":
  kiểm tra lại quyền chia sẻ Google Sheet (bước "Anyone with the link").
- Nếu nhập câu trả lời mà chấm điểm luôn sai/không phản hồi Gemini:
  mở Console (F12) xem lỗi — thường là do API key restriction chặn domain,
  hoặc quota Gemini miễn phí đã hết trong ngày. App có sẵn cơ chế chấm
  điểm dự phòng (so khớp từ khóa) nên vẫn chơi được kể cả khi Gemini lỗi.
- Đổi domain/tên repo sau này thì nhớ cập nhật lại HTTP referrer của key.

## Những gì đã lược bỏ so với bản Apps Script gốc

- Hàm `getDailyKnowledge()` / `getDefaultKnowledge()` (mục "Kiến thức hôm
  nay") không được gọi ở đâu trong giao diện gốc nên không port sang —
  nếu bạn muốn dùng, có thể thêm lại tương tự cách gọi Gemini trong
  `app.js`.
