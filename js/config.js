// ==================== CẤU HÌNH ====================
// ĐIỀN THÔNG TIN CỦA BẠN VÀO ĐÂY

const CONFIG = {
  // ID của Google Sheet chứa câu hỏi (lấy từ URL sheet, đoạn giữa /d/ và /edit)
  SPREADSHEET_ID: '16X-QIXWX-zmt2gVNh94qvYlWDWYRMcwSui5rbybpqjM',

  // Tên 2 sheet (tab) trong file Google Sheet
  SHEET_NAMES: {
    khoi_dong: 'KhoiDong',
    vcnv: 'VCNV',
    tang_toc: 'TangToc',
    ve_dich: 'VeDich'
  },

  // ==================== THÔNG SỐ CÁC PHẦN THI (sửa nhanh tại đây) ====================
  // Khoá API Google (Drive API) để phát video Drive ổn định — xem hướng dẫn gửi kèm.
  // Để trống thì web thử link tải trực tiếp (hay bị Google chặn với file lớn).
  DRIVE_API_KEY: '',

  GAME: {
    KHOI_DONG_COUNT: 18,          // số câu random ở Khởi Động
    KHOI_DONG_TIME: 70,           // tổng thời gian (giây)
    VCNV_COUNT: 5,                // số chướng ngại vật random
    VCNV_TIME: 60,                // thời gian cho MỖI chướng ngại vật (giây)
    VCNV_POINTS: 10,              // điểm mỗi chướng ngại vật đúng
    TANG_TOC_COUNT: 4,            // số câu Tăng Tốc
    TANG_TOC_FALLBACK_SECONDS: 20 // dự phòng nếu không đọc được độ dài file nhapcauhoi_tt
  },

  // ==================== TÀI KHOẢN / BẢNG XẾP HẠNG (qua Worker riêng) ====================
  // URL của Worker "olympia-accounts-api" — xem hướng dẫn deploy tại
  // worker-accounts/README.md. Sau khi deploy xong, dán URL vào đây.
  ACCOUNTS_API_URL: 'https://olympia-accounts-api.voducphat-learncode-tk01.workers.dev',

  // ==================== GEMINI (qua Worker proxy) ====================
  // API key KHÔNG còn nằm trong file này nữa — key được giấu trong một
  // Cloudflare Worker đứng giữa trình duyệt và Gemini, nên "View Page
  // Source" trên trang web sẽ không thấy key ở đâu cả.
  // => Xem hướng dẫn deploy Worker tại: worker/README.md
  //
  // Sau khi deploy Worker xong, dán URL của nó vào GEMINI_PROXY_URL bên dưới.
  //
  // Dùng 2 model khác nhau để tránh dồn hết request vào chung 1 hạn mức.
  // Lưu ý: model "xịn" đời mới (vd gemini-3.6-flash) thường có hạn mức MIỄN
  // PHÍ rất thấp vì còn là bản preview. Mình dùng flash-lite cho cả 2 việc
  // để có hạn mức rộng rãi và ổn định hơn — nếu muốn chất lượng "Nghiên cứu"
  // cao hơn và chấp nhận dễ bị giới hạn hơn, có thể đổi GEMINI_MODEL sang
  // 'gemini-3.6-flash' hoặc model mới hơn khi cần.
  GEMINI_MODEL: 'gemini-3.5-flash-lite',
  GEMINI_GRADING_MODEL: 'gemini-3.5-flash-lite',
  GEMINI_PROXY_URL: 'https://olympia-gemini-proxy.voducphat-learncode-tk01.workers.dev/',

  buildGeminiUrl(model) {
    return `${this.GEMINI_PROXY_URL}?model=${encodeURIComponent(model || this.GEMINI_MODEL)}`;
  },

  // Nhạc nền / hiệu ứng âm thanh (đã để sẵn, có thể thay bằng link của bạn)
  AUDIO_URLS: {
    introKD:     'https://raw.githubusercontent.com/phtaVo/olympia-audio/main/intro_kd.mp3',
    introVD:     'https://raw.githubusercontent.com/phtaVo/olympia-audio/main/intro_vd.mp3',
    bgKD:        'https://raw.githubusercontent.com/phtaVo/olympia-audio/main/60s_kd.mp3',
    correct:     'https://raw.githubusercontent.com/phtaVo/olympia-audio/main/correctans.mp3',
    fail:        'https://raw.githubusercontent.com/phtaVo/olympia-audio/main/failans.mp3',
    cauhoiVD:    'https://raw.githubusercontent.com/phtaVo/olympia-audio/main/cauhoi_vd.mp3',
    cauhoi15sVD: 'https://raw.githubusercontent.com/phtaVo/olympia-audio/main/15s_vd.mp3',
    starHope:    'https://raw.githubusercontent.com/phtaVo/olympia-audio/main/starhope.mp3',
    buzzer:      'https://raw.githubusercontent.com/phtaVo/olympia-audio/main/chuong.mp3',
    mocauhoiVD:  'https://raw.githubusercontent.com/phtaVo/olympia-audio/main/mocauhoi_vd.mp4',
    mocauhoiTT:  'https://raw.githubusercontent.com/phtaVo/olympia-audio/main/mocauhoi_tt.mp4',
    nhapcauhoiTT:'https://raw.githubusercontent.com/phtaVo/olympia-audio/main/nhapcauhoi_tt.mp4'
  },

  // ==================== MODULE SOLO (thi đấu nhóm real-time) ====================
  // Để trống: Solo sẽ TỰ nhận diện máy chủ dựa trên địa chỉ đang mở trang web
  // (dùng cho chế độ chạy qua Wi-Fi nội bộ bằng local-server/ — xem
  // local-server/README.md). Chỉ điền giá trị vào đây nếu bạn tự deploy một
  // backend real-time riêng (vd Cloudflare Durable Objects) và muốn Solo luôn
  // trỏ tới đó thay vì tự nhận diện, ví dụ: 'wss://ten-worker.workers.dev'
  SOLO_WS_URL: ''
};
