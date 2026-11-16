// ============================================================
// STATS — thống kê luyện tập của từng tài khoản (lưu trong trình duyệt)
//  • Số trận đã luyện của mỗi phần thi
//  • Số câu hỏi KHÔNG TRÙNG LẶP đã luyện / tổng số câu của bộ câu hỏi
// Lưu ở localStorage theo từng tài khoản (chỉ trên thiết bị đang dùng).
// ============================================================
const STATS = (() => {
  const MODES = [
    { id: 'khoi_dong', label: 'Khởi Động',        icon: '🚀', loader: 'khoi_dong' },
    { id: 'vcnv',      label: 'Vượt Chướng Ngại Vật', icon: '🧩', loader: 'vcnv' },
    { id: 'tang_toc',  label: 'Tăng Tốc',         icon: '⚡', loader: 'tang_toc' },
    { id: 've_dich',   label: 'Về Đích',          icon: '🏁', loader: 've_dich' },
    { id: 'xuat_phat', label: 'Xuất Phát (ĐĐVQ)', icon: '🏃', loader: 'xuat_phat' },
    { id: 'vinh_quang',label: 'Vinh Quang (ĐĐVQ)', icon: '🏆', loader: null }   // chưa mở
  ];
  const TOTALS_TTL = 6 * 3600 * 1000;   // nhớ tổng số câu 6 giờ để khỏi tải lại sheet

  function userKey() {
    const u = (typeof AUTH !== 'undefined' && AUTH.getCurrentUser) ? AUTH.getCurrentUser() : null;
    return u ? String(u.id != null ? u.id : u.username) : 'guest';
  }
  const dataKey = () => 'olym63_stats_' + userKey();
  const totalsKey = 'olym63_bank_totals';

  function read(key) { try { return JSON.parse(localStorage.getItem(key)) || null; } catch (e) { return null; } }
  function write(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) {} }

  // Băm chuỗi (djb2) → khóa ngắn, đủ để phân biệt câu hỏi
  function hash(s) {
    s = String(s || '').normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }
  const qKey = (question, answer) => hash(question) + '.' + hash(answer);

  function load() {
    const d = read(dataKey()) || {};
    d.played = d.played || {}; d.seen = d.seen || {};
    return d;
  }

  // Ghi nhận 1 trận đã hoàn thành: answers = STATE.answers
  function recordRound(mode, answers) {
    if (!mode || !answers || !answers.length) return;
    const d = load();
    d.played[mode] = (d.played[mode] || 0) + 1;
    const seen = d.seen[mode] = d.seen[mode] || {};
    answers.forEach(a => { if (a && a.question) seen[qKey(a.question, a.correctAnswer)] = 1; });
    write(dataKey(), d);
  }

  // Tổng số câu (không trùng) của bộ câu hỏi từng phần thi
  async function fetchTotals(force) {
    const cached = read(totalsKey);
    if (!force && cached && Date.now() - cached.t < TOTALS_TTL) return cached.v;
    const count = (res) => (res && res.success) ? new Set(res.questions.map(q => qKey(q.question, q.answer))).size : null;
    const jobs = {
      khoi_dong: () => loadKhoiDong(DEFAULT_SOURCE, true),
      ve_dich:   () => loadVeDich(DEFAULT_SOURCE),
      vcnv:      () => loadVcnv(true),
      tang_toc:  () => loadTangToc(true),
      xuat_phat: () => loadXuatPhat(true)
    };
    const v = Object.assign({}, cached ? cached.v : {});
    await Promise.all(Object.keys(jobs).map(async k => {
      try { const n = count(await jobs[k]()); if (n != null) v[k] = n; } catch (e) {}
    }));
    write(totalsKey, { t: Date.now(), v });
    return v;
  }

  // Dữ liệu hiển thị
  function summary(totals) {
    const d = load();
    return MODES.map(m => {
      const seenCount = Object.keys(d.seen[m.id] || {}).length;
      const total = m.loader ? (totals ? totals[m.id] : null) : null;
      return { id: m.id, label: m.label, icon: m.icon, soon: !m.loader,
               played: d.played[m.id] || 0, seen: seenCount, total: total == null ? null : total };
    });
  }

  function cardHtml(rows, loading) {
    const totalPlayed = rows.reduce((s, r) => s + r.played, 0);
    const items = rows.map(r => {
      if (r.soon) return `<div class="stat-row stat-soon"><div class="stat-head"><span class="stat-name">${r.icon} ${r.label}</span><span class="stat-played">Sắp ra mắt</span></div></div>`;
      const pct = r.total ? Math.min(100, Math.round(r.seen * 100 / r.total)) : 0;
      const frac = r.total != null ? `${r.seen} / ${r.total} câu` : `${r.seen} câu${loading ? ' · đang tải tổng...' : ''}`;
      return `<div class="stat-row">
        <div class="stat-head"><span class="stat-name">${r.icon} ${r.label}</span><span class="stat-played">${r.played} trận</span></div>
        <div class="stat-bar"><div class="stat-bar-fill" style="width:${pct}%"></div></div>
        <div class="stat-sub"><span>Câu khác nhau đã luyện: <b>${frac}</b></span>${r.total ? `<span>${pct}%</span>` : ''}</div>
      </div>`;
    }).join('');
    return `<div class="profile-card-title">📊 Tiến độ luyện tập <span class="stat-total">${totalPlayed} trận</span></div>${items}
      <div class="profile-info-note">Chỉ tính các câu khác nhau (một câu luyện nhiều lần chỉ đếm một lần). Số liệu được lưu trên thiết bị này.</div>`;
  }

  // Vẽ vào phần tử #profile-stats-card (nếu đang mở), sau đó cập nhật khi đã có tổng số câu
  async function render() {
    const el = document.getElementById('profile-stats-card');
    if (!el) return;
    const cached = read(totalsKey);
    el.innerHTML = cardHtml(summary(cached ? cached.v : null), !cached);
    try {
      const totals = await fetchTotals(false);
      const el2 = document.getElementById('profile-stats-card');
      if (el2) el2.innerHTML = cardHtml(summary(totals), false);
    } catch (e) {}
  }

  return { recordRound, render, fetchTotals, qKey };
})();
