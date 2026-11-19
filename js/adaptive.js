// ============================================================
// ADAPT — luyện tập thích ứng (Olym63 v2, bước 2)  [ĐANG THỬ NGHIỆM]
//  • BKT theo môn (kỹ năng = môn học): ước lượng xác suất đã nắm môn
//  • Độ khó câu hỏi b (thang logit) lấy từ dữ liệu: b = ln((1-p)/p), p = tỉ lệ đúng đã làm mượt
//  • Chọn câu: vừa sức (~75% đúng) + môn còn yếu + không lặp lại câu mới làm
//  • CHỈ áp dụng cho học sinh đã đồng ý và được phân vào nhóm "adaptive"; nhóm "random" vẫn chọn ngẫu nhiên
//  • Mọi lỗi đều quay về chọn ngẫu nhiên — không làm hỏng luồng chơi
// Tham số là GIẢ ĐỊNH ban đầu (xem tài liệu thiết kế A3, A6), chưa được hiệu chuẩn bằng dữ liệu thật.
// ============================================================
const ADAPT = (() => {
  const P = { L0: 0.3, T: 0.1, S: 0.1, G: 0.1 };          // tham số BKT (giả định)
  const TARGET = 0.75, SIGMA = 0.15;                        // xác suất đúng mục tiêu
  const W = { need: 0.4, recent: 0.1 };                     // trọng số (giả định). Chọn môn theo 'need', chọn câu theo 'vừa sức'
  const CAND = 300;                                         // số ứng viên chấm điểm mỗi lượt
  const TOPK = 5, RECENT_MS = 7 * 24 * 3600 * 1000, SEEN_CAP = 3000;
  const MODEL_TTL = 3600 * 1000;
  const K = 0.4;                                            // hệ số Elo cho năng lực θ

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
  // dự đoán xác suất đúng của câu có độ khó b khi mức nắm môn là pL
  function predict(pL, b) { return sigmoid(logit(clamp(bktPredict(pL), 0.02, 0.98)) - b); }
  // mức "vừa sức" của câu: gần 1 khi xác suất đúng dự đoán ≈ TARGET (A6, bản chưa có KG và Leitner)
  function fitScore(pL, b) { return Math.exp(-Math.pow(predict(pL, b) - TARGET, 2) / (2 * SIGMA * SIGMA)); }

  // ---- lưu trạng thái theo tài khoản (localStorage) ----
  const uid = () => { const u = (typeof AUTH !== 'undefined' && AUTH.getCurrentUser) ? AUTH.getCurrentUser() : null; return u ? String(u.id != null ? u.id : u.username) : 'guest'; };
  const key = () => 'olym63_ad_' + uid();
  const load = () => { try { return JSON.parse(localStorage.getItem(key())) || { theta: 0, skills: {}, seen: {} }; } catch (e) { return { theta: 0, skills: {}, seen: {} }; } };
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

  const isAdaptive = () => typeof RESLOG !== 'undefined' && RESLOG.getStatus && RESLOG.getStatus() &&
    RESLOG.getStatus().consented && RESLOG.getStatus().group_code === 'adaptive';

  // Chọn n câu từ pool. Trả null nếu không áp dụng (để nơi gọi chọn ngẫu nhiên như cũ).
  async function pick(pool, n) {
    try {
      if (!isAdaptive() || !pool || pool.length <= n) return null;
      const st = load(), b = await getModel(), now = Date.now();
      // lấy ngẫu nhiên CAND ứng viên rồi chấm điểm (tránh tính SHA-256 cho cả ngân hàng)
      const idx = pool.map((_, i) => i);
      for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
      const cands = idx.slice(0, Math.max(CAND, n * 5));
      // Bước 1: chấm điểm "vừa sức" của từng câu và gom theo môn
      const bySubj = {};
      for (const i of cands) {
        const q = pool[i], sj = q.subject || '_';
        const qid = await RESLOG.makeQid(q.question, q.answer);
        const sk = st.skills[sj] || { pL: P.L0 };
        const recent = st.seen[qid] && now - st.seen[qid] < RECENT_MS;
        const s = fitScore(sk.pL, b[qid] || 0) - W.recent * (recent ? 1 : 0);
        (bySubj[sj] = bySubj[sj] || []).push({ q, s });
      }
      for (const sj in bySubj) bySubj[sj].sort((x, y) => y.s - x.s);
      // Bước 2: mỗi lượt chọn MÔN với xác suất tỉ lệ mức "còn yếu" (1 - pL), rồi chọn câu vừa sức nhất trong môn
      const out = [];
      while (out.length < n) {
        const subs = Object.keys(bySubj).filter(k => bySubj[k].length);
        if (!subs.length) break;
        const wts = subs.map(k => W.need * (1 - (st.skills[k] ? st.skills[k].pL : P.L0)) + 0.05);
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

  // Cập nhật sau mỗi ván: answers = STATE.answers, questions = STATE.questions (để lấy môn)
  async function update(answers, questions) {
    try {
      if (typeof RESLOG === 'undefined' || !RESLOG.getStatus() || !RESLOG.getStatus().consented) return;
      const subj = {}; (questions || []).forEach(q => { if (q && q.question) subj[q.question] = q.subject; });
      const st = load(), b = await getModel(), now = Date.now();
      for (const a of answers) {
        if (a.correct !== true && a.correct !== false) continue;
        const y = a.correct ? 1 : 0, s = subj[a.question] || '_';
        const qid = await RESLOG.makeQid(a.question, a.correctAnswer);
        const sk = st.skills[s] || { pL: P.L0, n: 0 };
        sk.pL = bktUpdate(sk.pL, y); sk.n++; st.skills[s] = sk;
        st.theta = eloTheta(st.theta, b[qid] || 0, y);
        st.seen[qid] = now;
      }
      const keys = Object.keys(st.seen);                      // giữ tối đa SEEN_CAP câu gần nhất
      if (keys.length > SEEN_CAP) keys.sort((x, y) => st.seen[x] - st.seen[y]).slice(0, keys.length - SEEN_CAP).forEach(k => delete st.seen[k]);
      save(st);
    } catch (e) {}
  }

  return { pick, update, bktUpdate, bktPredict, eloTheta, predict, fitScore, load, params: P };
})();
