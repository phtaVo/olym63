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

  // ⚠️ CẢNH BÁO BẢO MẬT:
  // Vì đây là web tĩnh (GitHub Pages), API key này sẽ lộ ra cho BẤT KỲ AI
  // xem mã nguồn trang web (view-source). Bất kỳ ai cũng có thể lấy và dùng
  // key này để gọi Gemini API và tốn tiền/quota của bạn.
  // => Bắt buộc phải giới hạn (restrict) key này trong Google Cloud Console:
  //    APIs & Services > Credentials > chọn key > "Application restrictions"
  //    > "HTTP referrers" > chỉ cho phép domain GitHub Pages của bạn
  //    (vd: yourusername.github.io/*)
  GEMINI_API_KEY: 'AIzaSyBD28mlnviNw-r5NTzPilkZx2tqQ3jMO6U',

  GEMINI_MODEL: 'gemini-1.5-flash',

  get GEMINI_API_URL() {
    return `https://generativelanguage.googleapis.com/v1beta/models/${this.GEMINI_MODEL}:generateContent?key=${this.GEMINI_API_KEY}`;
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
