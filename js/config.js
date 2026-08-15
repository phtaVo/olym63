// ==================== CẤU HÌNH ====================
// ĐIỀN THÔNG TIN CỦA BẠN VÀO ĐÂY

const CONFIG = {
  // ID của Google Sheet chứa câu hỏi (lấy từ URL sheet, đoạn giữa /d/ và /edit)
  SPREADSHEET_ID: '10Z5aWLvNB5qWcWusD1YnmdQp-ZXoC2wSJeHdjo-aLOw',

  // Tên 2 sheet (tab) trong file Google Sheet
  SHEET_NAMES: {
    khoi_dong: 'KhoiDong',
    ve_dich: 'VeDich'
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
    starHope:    'https://raw.githubusercontent.com/phtaVo/olympia-audio/main/starhope.mp3'
  }
};
