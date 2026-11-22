// ============================================================
// ADAPT — ghi nhận môn còn yếu + luyện tập thích ứng (Olym63 v2)
//  • Mỗi học sinh có hồ sơ mức nắm từng môn (BKT) lưu NGAY TRÊN THIẾT BỊ (localStorage); học sinh đã đồng ý nghiên cứu
//    còn được dựng lại hồ sơ từ máy chủ khi đổi thiết bị.
//  • Nút gạt "Ưu tiên môn còn yếu" ở màn chọn bộ câu hỏi: tăng mạnh tỉ lệ câu thuộc môn yếu (Khởi Động, Về Đích).
//  • Học sinh đã đồng ý nghiên cứu: nhóm "adaptive" được bật tự động, nhóm "random" (đối chứng) bị khóa nút gạt trong thời gian
//    nghiên cứu để không làm nhiễu thực nghiệm, trừ khi admin mở khóa.
//  • Mọi lỗi đều quay về chọn ngẫu nhiên — không làm hỏng luồng chơi.
// Tham số BKT/trọng số là GIẢ ĐỊNH ban đầu (tài liệu thiết kế A3, A6), chưa hiệu chuẩn bằng dữ liệu thật.
// ============================================================
const ADAPT = (() => {
  const P = { L0: 0.3, T: 0.1, S: 0.1, G: 0.1 };           // tham số BKT (giả định)
  const TARGET = 0.75, SIGMA = 0.15;                         // xác suất đúng mục tiêu
  const W_NEED = 0.4, W_RECENT = 0.1;
  const CAND = 300, TOPK = 5, RECENT_MS = 7 * 24 * 3600 * 1000, SEEN_CAP = 3000, MODEL_TTL = 3600 * 1000;
  const K = 0.4, MIN_N = 5;                                  // hệ số Elo; số lượt tối thiểu để kết luận "yếu"

  const sigmoid = x => 1 / (1 + Math.exp(-x));
  const logit = p => Math.log(p / (1 - p));
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

  // ---- công thức (A2, A3) ----
  function bktUpdate(pL, y, p = P) {
    const post = y ? pL * (1 - p.S) / (pL * (1 - p.S) + (1 - pL) * p.G)
                   : pL * p.S / (pL * p.S + (1 - pL) * (1 - p.G));
    return post + (1 - post) * p.T;
  }
  const bktPredict = (pL, p = P) => pL * (1 - p.S) + (1 - pL) * p.G;
  function eloTheta(theta, b, y) { return clamp(theta + K * (y - sigmoid(theta - b)), -4, 4); }
  function predict(pL, b) { return sigmoid(logit(clamp(bktPredict(pL), 0.02, 0.98)) - b); }
  function fitScore(pL, b) { return Math.exp(-Math.pow(predict(pL, b) - TARGET, 2) / (2 * SIGMA * SIGMA)); }

  // ---- hồ sơ trên thiết bị ----
  const uid = () => { const u = (typeof AUTH !== 'undefined' && AUTH.getCurrentUser) ? AUTH.getCurrentUser() : null; return u ? String(u.id != null ? u.id : u.username) : 'guest'; };
  const key = () => 'olym63_ad_' + uid();
  const blank = () => ({ theta: 0, skills: {}, seen: {} });
  const load = () => { try { return JSON.parse(localStorage.getItem(key())) || blank(); } catch (e) { return blank(); } };
  const save = s => { try { localStorage.setItem(key(), JSON.stringify(s)); } catch (e) {} };

  // ---- độ khó từ máy chủ ----
  let model = null, modelAt = 0;
  async function getModel() {
    if (model && Date.now() - modelAt < MODEL_TTL) return model;
    try {
      const base = (CONFIG.ACCOUNTS_API_URL || '').replace(/\/+$/, '');
      const r = await fetch(base + '/research/model', { headers: { Authorization: 'Bearer ' + localStorage.getItem('olympia_token') } });
      if (r.ok) { model = (await r.json()).b || {}; modelAt = Date.now(); }
    } catch (e) {}
    return model || {};
  }

  // ---- ai được dùng nút gạt? ----
  function access() {
    const s = (typeof RESLOG !== 'undefined' && RESLOG.getStatus) ? RESLOG.getStatus() : null;
    if (!s || !s.consented || s.unlock) return { free: true };
    if (s.group_code === 'adaptive') return { free: false, on: true, msg: 'Đang được bật tự động trong thời gian nghiên cứu.' };
    return { free: false, on: false, msg: 'Tạm chưa mở cho tài khoản của bạn trong thời gian nghiên cứu.' };
  }
  const researchAdaptive = () => { const s = (typeof RESLOG !== 'undefined' && RESLOG.getStatus) ? RESLOG.getStatus() : null; return !!(s && s.consented && !s.unlock && s.group_code === 'adaptive'); };

  // ---- phân loại môn ----
  function level(sk) {
    if (!sk || sk.n < MIN_N) return 'unknown';
    const acc = sk.c / sk.n;
    if (sk.pL < 0.5 || acc < 0.5) return 'weak';
    if (sk.pL < 0.8 || acc < 0.7) return 'medium';
    return 'strong';
  }
  function weakList() {
    const sk = load().skills;
    return Object.keys(sk).filter(k => k !== '_').map(k => ({ subject: k, pL: sk[k].pL, n: sk[k].n, acc: sk[k].n ? sk[k].c / sk[k].n : null, level: level(sk[k]) }))
      .sort((a, b) => (a.level === 'unknown') - (b.level === 'unknown') || a.pL - b.pL);
  }
  // trọng số chọn môn: môn càng yếu càng cao; "strong" gấp rút theo bình phương
  function subjectWeight(skills, s, strong) {
    const sk = skills[s]; const pL = sk ? sk.pL : P.L0 + 0.2;     // môn chưa luyện: coi là hơi yếu, để thăm dò
    const need = 1 - pL;
    return strong ? need * need + 0.02 : W_NEED * need + 0.05;
  }

  // Chọn n câu từ pool. Trả null nếu không áp dụng (nơi gọi chọn ngẫu nhiên như cũ).
  async function pick(pool, n, opts) {
    try {
      opts = opts || {};
      const force = !!opts.force && access().free;
      if (!(force || researchAdaptive()) || !pool || pool.length <= n) return null;
      const strong = force;
      const st = load(), b = await getModel(), now = Date.now();
      const idx = pool.map((_, i) => i);
      for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
      const cands = idx.slice(0, Math.max(CAND, n * 5));
      const bySubj = {};
      for (const i of cands) {
        const q = pool[i], sj = q.subject || '_';
        const qid = await RESLOG.makeQid(q.question, q.answer);
        const sk = st.skills[sj] || { pL: P.L0 };
        const recent = st.seen[qid] && now - st.seen[qid] < RECENT_MS;
        (bySubj[sj] = bySubj[sj] || []).push({ q, s: fitScore(sk.pL, b[qid] || 0) - W_RECENT * (recent ? 1 : 0) });
      }
      for (const sj in bySubj) bySubj[sj].sort((x, y) => y.s - x.s);
      const out = [];
      while (out.length < n) {
        const subs = Object.keys(bySubj).filter(k => bySubj[k].length);
        if (!subs.length) break;
        const wts = subs.map(k => subjectWeight(st.skills, k, strong));
        let r = Math.random() * wts.reduce((x, y) => x + y, 0), si = 0;
        for (; si < subs.length - 1; si++) { r -= wts[si]; if (r <= 0) break; }
        const list = bySubj[subs[si]], top = list.slice(0, TOPK);
        const tot = top.reduce((x, t) => x + Math.max(t.s, 0.01), 0);
        let r2 = Math.random() * tot, k = 0;
        for (; k < top.length - 1; k++) { r2 -= Math.max(top[k].s, 0.01); if (r2 <= 0) break; }
        out.push(list.splice(k, 1)[0].q);
      }
      return out.length === n ? out : null;
    } catch (e) { return null; }
  }

  // Sắp xếp lại cả bộ câu (dùng cho Về Đích: các câu đầu bộ sẽ được lấy trước): xáo trộn có trọng số theo độ yếu của môn
  function order(pool, opts) {
    try {
      opts = opts || {};
      const force = !!opts.force && access().free;
      if (!(force || researchAdaptive()) || !pool || pool.length < 2) return null;
      const skills = load().skills;
      return pool.map(q => ({ q, k: -Math.log(Math.random() || 1e-9) / subjectWeight(skills, q.subject || '_', force) }))
        .sort((x, y) => x.k - y.k).map(x => x.q);
    } catch (e) { return null; }
  }

  // Cập nhật sau mỗi ván (chạy cho mọi tài khoản; dữ liệu nằm trên thiết bị)
  function applyOne(st, subject, qid, y, b, now) {
    const s = subject || '_';
    const sk = st.skills[s] || { pL: P.L0, n: 0, c: 0 };
    sk.pL = bktUpdate(sk.pL, y); sk.n++; sk.c += y; st.skills[s] = sk;
    st.theta = eloTheta(st.theta, b[qid] || 0, y);
    if (qid) st.seen[qid] = now;
  }
  async function update(answers, questions) {
    try {
      const subj = {}; (questions || []).forEach(q => { if (q && q.question) subj[q.question] = q.subject; });
      const st = load(), b = await getModel(), now = Date.now();
      for (const a of answers) {
        if (a.correct !== true && a.correct !== false) continue;
        const qid = await RESLOG.makeQid(a.question, a.correctAnswer);
        applyOne(st, subj[a.question], qid, a.correct ? 1 : 0, b, now);
      }
      const keys = Object.keys(st.seen);
      if (keys.length > SEEN_CAP) keys.sort((x, y) => st.seen[x] - st.seen[y]).slice(0, keys.length - SEEN_CAP).forEach(k => delete st.seen[k]);
      save(st);
    } catch (e) {}
  }
  // Đổi thiết bị: nếu hồ sơ trống mà máy chủ đã có lịch sử (học sinh đã đồng ý nghiên cứu) thì dựng lại
  async function rebuild(fetchMine) {
    try {
      const st = load(); if (Object.keys(st.skills).length) return;
      const rows = await fetchMine(); if (!rows || !rows.length) return;
      const fresh = blank(), b = await getModel();
      rows.forEach(r => applyOne(fresh, r.subject, r.qid, r.correct ? 1 : 0, b, Date.parse(r.ts) || Date.now()));
      save(fresh);
    } catch (e) {}
  }

  // ---- giao diện: thẻ "Môn học cần luyện" trong Hồ sơ ----
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const LV = { weak: ['Yếu', '#d93025'], medium: ['Trung bình', '#f9ab00'], strong: ['Tốt', '#188038'], unknown: ['Chưa đủ dữ liệu', '#9aa0a6'] };
  function renderWeakCard() {
    const el = document.getElementById('profile-weak-card'); if (!el) return;
    const L = weakList();
    if (!L.length) { el.innerHTML = '<div class="profile-card-title">Môn học cần luyện</div><div class="profile-info-note">Chơi vài ván Khởi Động hoặc Về Đích, hệ thống sẽ ghi lại môn nào bạn còn yếu.</div>'; return; }
    const weak = L.filter(x => x.level === 'weak');
    el.innerHTML = `<div class="profile-card-title">Môn học cần luyện</div>
      ${L.map(x => { const [t, c] = LV[x.level]; return `<div style="margin:8px 0"><div style="display:flex;justify-content:space-between;font-size:14px"><span>${esc(x.subject)}</span><span style="color:${c};font-weight:600">${t}</span></div>
        <div style="height:6px;border-radius:3px;background:rgba(128,128,128,.25);overflow:hidden;margin-top:3px"><div style="height:100%;width:${Math.round(x.pL * 100)}%;background:${c}"></div></div>
        <div style="font-size:11px;opacity:.7;margin-top:2px">${x.n} lượt · đúng ${Math.round(x.acc * 100)}% · mức nắm ước lượng ${Math.round(x.pL * 100)}%</div></div>`; }).join('')}
      <div class="profile-info-note" style="margin:8px 0">Ước lượng dựa trên các ván bạn đã chơi (cần ≥${MIN_N} lượt mỗi môn). Dữ liệu lưu trên thiết bị này${(typeof RESLOG !== 'undefined' && RESLOG.getStatus && RESLOG.getStatus() && RESLOG.getStatus().consented) ? ' và trong nghiên cứu bạn đã đồng ý tham gia' : ''}.</div>
      <button class="btn btn-primary" style="width:100%" onclick="startWeakPractice()" ${access().free ? '' : 'disabled'}>Luyện các môn còn yếu${weak.length ? ' (' + weak.length + ' môn)' : ''}</button>
      ${access().free ? '' : `<div class="profile-info-note" style="margin-top:6px">${esc(access().msg)}</div>`}`;
  }
  // Dòng nút gạt ở màn chọn bộ câu hỏi (do app.js gọi)
  function toggleHtml(weakOn, subject) {
    const a = access(), ws = weakList().filter(x => x.level === 'weak');
    const disabledByLock = !a.free, disabledBySubject = subject && subject !== 'ALL';
    const on = a.free ? weakOn && !disabledBySubject : a.on;
    const hint = disabledByLock ? a.msg : disabledBySubject ? 'Chọn "Tất cả các môn" để dùng tính năng này.'
      : ws.length ? 'Môn còn yếu: ' + ws.slice(0, 4).map(x => esc(x.subject) + ' (' + Math.round(x.acc * 100) + '%)').join(', ')
      : 'Chưa đủ dữ liệu để biết môn yếu — chơi thêm vài ván.';
    return `<div class="srcp-section"><div class="srcp-label"><span class="srcp-step">3</span>Chế độ luyện</div>
      <label style="display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:12px;border:1px solid rgba(128,128,128,.35);cursor:${disabledByLock || disabledBySubject ? 'not-allowed' : 'pointer'};opacity:${disabledByLock || disabledBySubject ? .6 : 1}" onclick="${disabledByLock || disabledBySubject ? '' : 'srcPickWeak()'}">
        <span style="width:46px;height:26px;border-radius:13px;background:${on ? '#188038' : 'rgba(128,128,128,.5)'};position:relative;flex-shrink:0;transition:.15s"><i style="position:absolute;top:3px;left:${on ? 23 : 3}px;width:20px;height:20px;border-radius:50%;background:#fff;transition:.15s"></i></span>
        <span style="flex:1"><b>Ưu tiên môn còn yếu</b><br><span style="font-size:12px;opacity:.75">${hint}</span></span></label></div>`;
  }

  return { pick, order, update, rebuild, access, weakList, renderWeakCard, toggleHtml, bktUpdate, bktPredict, eloTheta, predict, fitScore, load, params: P };
})();
