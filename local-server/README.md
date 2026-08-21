# Chạy Solo qua Wi-Fi nội bộ (miễn phí, không cần Cloudflare trả phí)

Một bạn trong nhóm ("host") chạy server này trên máy của mình. Những
người còn lại chỉ cần **cùng kết nối Wi-Fi** và mở trình duyệt vào địa
chỉ mà server in ra — không cần cài gì, không cần tài khoản Cloudflare.

## Cách chạy (chỉ máy của host)

**Cách 1 — Không cần cài Node.js (khuyên dùng):** vào trang Solo trên web app (kể cả bản GitHub Pages), phần "Bạn muốn làm chủ phòng?" có sẵn nút tải file chạy thẳng cho Windows/macOS/Linux (`local-server-builds/`). Tải về, **giữ nguyên file đó trong thư mục `local-server/`** rồi chạy:
- Windows: bấm đúp `olym63-solo-server-windows.exe` (nếu Windows Defender cảnh báo "Unknown publisher", chọn "More info" → "Run anyway").
- macOS: mở Terminal tại đó, chạy `chmod +x olym63-solo-server-macos && ./olym63-solo-server-macos` (lần đầu macOS có thể chặn — vào System Settings → Privacy & Security → bấm "Open Anyway").
- Linux: `chmod +x olym63-solo-server-linux && ./olym63-solo-server-linux`

**Cách 2 — Có cài Node.js:**
```bash
cd local-server
npm install
npm start
```

Terminal sẽ in ra dạng:

```
🎮 Olym63 (kèm module Solo) đang chạy!

   Trên máy này:     http://localhost:3000
   Cùng Wi-Fi:       http://192.168.1.23:3000

   👉 Gửi địa chỉ "Cùng Wi-Fi" ở trên cho bạn bè để họ mở bằng trình duyệt.
```

- **Host** mở `http://localhost:3000`.
- **Mọi người khác** (đang chung Wi-Fi/LAN với host) mở đúng địa chỉ
  dạng `http://192.168.x.x:3000` mà terminal in ra.

Cả trang web (đăng nhập, Khởi Động, Về Đích...) lẫn phần Solo đều chạy
từ server này — **không dùng GitHub Pages trong lúc chơi Solo được**,
vì Solo cần địa chỉ WebSocket cùng nguồn với trang web (`ws://` chỉ
hoạt động khi trang được mở qua `http://`, không phải `https://`).
Bạn vẫn có thể dùng bản GitHub Pages như bình thường để luyện tập một
mình (Khởi Động/Về Đích/Tăng Tốc), chỉ riêng lúc muốn chơi **Solo nhóm**
thì cả nhóm chuyển sang mở địa chỉ local-server của host.

## Yêu cầu

- Máy host đã cài [Node.js](https://nodejs.org) (bản LTS).
- Máy host và các máy khác **cùng một mạng Wi-Fi/LAN** (ví dụ cùng
  router Wi-Fi ở nhà). Wi-Fi công cộng/công ty đôi khi chặn các máy
  "nhìn thấy" nhau (client isolation) — nếu vào không được, thử phát
  Wi-Fi từ điện thoại của host và cho mọi người vào chung mạng đó.
- Nếu Windows hỏi cho phép Node.js qua tường lửa (Windows Defender
  Firewall) — chọn **Allow** (Cho phép), ít nhất với mạng riêng
  (Private network).
- Máy host cần **giữ server chạy và mở trong lúc chơi** (đừng tắt
  terminal hoặc đóng máy).

## Ghi chú

- Câu hỏi vẫn được tải trực tiếp từ Google Sheet, và chấm điểm vẫn có
  thể dùng Gemini (qua `GEMINI_PROXY_URL` trên Cloudflare Free có sẵn
  của dự án) — 2 phần này vẫn cần Internet bình thường, chỉ riêng phần
  **đồng bộ real-time giữa người chơi** là chạy nội bộ qua Wi-Fi.
- Muốn đổi cổng khác 3000: `PORT=4000 npm start`.
- Phòng chơi tự dọn khỏi bộ nhớ sau 15 phút không còn ai kết nối.
