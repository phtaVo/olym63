// ============================================================
// RESEARCH — nhật ký làm bài phục vụ nghiên cứu (Olym63 v2, bước 1)
//  • CHỈ chạy khi CONFIG.RESEARCH_ENABLED === true (mặc định tắt)
//  • Chỉ ghi sau khi học sinh bấm "Đồng ý tham gia"
//  • Mỗi lượt trả lời có attempt_id (UUID) → gửi lại nhiều lần vẫn không bị ghi trùng
//  • Hàng đợi lưu trong localStorage; mất mạng thì gửi lại sau
//  • Không bao giờ làm hỏng luồng chơi: mọi lỗi đều bị bỏ qua
// ============================================================
const RESLOG = (() => {
  const CONSENT_VERSION = 'v0';
  const CHUNK = 40;
  let status = null;       // { consented, group_code }
  let flushing = false;

  const enabled = () => typeof CONFIG !== 'undefined' && CONFIG.RESEARCH_ENABLED === true;
  const base = () => ((typeof CONFIG !== 'undefined' && CONFIG.ACCOUNTS_API_URL) || '').replace(/\/+$/, '');
  const token = () => { try { return localStorage.getItem('olympia_token'); } catch (e) { return null; } };
  const uid = () => {
    const u = (typeof AUTH !== 'undefined' && AUTH.getCurrentUser) ? AUTH.getCurrentUser() : null;
    return u ? String(u.id != null ? u.id : u.username) : 'guest';
  };
  const qKey = () => 'olym63_rq_' + uid();
  const dismissKey = () => 'olym63_rdismiss_' + uid();
  const readQ = () => { try { return JSON.parse(localStorage.getItem(qKey())) || []; } catch (e) { return []; } };
  const writeQ = q => { try { localStorage.setItem(qKey(), JSON.stringify(q)); } catch (e) {} };

  async function api(path, opts = {}) {
    const res = await fetch(base() + path, {
      method: opts.method || 'GET',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token() },
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
    return data;
  }

  // Chuẩn hóa như thiết kế A1: NFC, chữ thường, bỏ dấu câu thừa, gộp khoảng trắng
  function norm(s) {
    return String(s || '').normalize('NFC').toLowerCase()
      .replace(/[.,;:!?"'“”‘’()\[\]{}…]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  async function makeQid(question, answer) {
    const bytes = new TextEncoder().encode(norm(question) + '|' + norm(answer));
    const buf = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(buf)).slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));

  // ---------- hộp thoại xin đồng ý ----------
  function showConsent() {
    if (document.getElementById('research-consent')) return;
    const ov = document.createElement('div');
    ov.id = 'research-consent'; ov.className = 'modal-overlay show';
    ov.innerHTML = `
      <div class="modal-box" style="max-width:520px;text-align:left;max-height:90vh;overflow:auto">
        <div class="modal-title" style="font-size:20px">Tham gia nghiên cứu</div>
        <div class="modal-sub" style="font-size:14px;margin-bottom:12px">
          Olym63 đang được nhóm tác giả dùng trong một đề tài khoa học kỹ thuật (hướng luyện tập thích ứng).
          Nếu đồng ý, hệ thống sẽ ghi lại: <b>câu nào bạn đã làm, đúng/sai, thời điểm</b>.
          Hệ thống <b>không ghi</b> đáp án bạn gõ, mật khẩu hay thông tin liên lạc vào dữ liệu nghiên cứu.
          Dữ liệu được gắn mã ẩn danh, chỉ dùng cho nghiên cứu, báo cáo chỉ nêu số liệu tổng hợp.
          Bạn có thể rút lui và yêu cầu xóa dữ liệu bất cứ lúc nào; không tham gia thì vẫn dùng Olym63 bình thường.
        </div>
        <div class="modal-sub" style="font-size:13px;margin-bottom:16px">
          Phiên bản thông tin: ${CONSENT_VERSION}. Người phụ trách: {{tên giáo viên hướng dẫn / nhóm tác giả}}.
        </div>
        <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap">
          <button class="btn btn-secondary" id="rc-no">Để sau</button>
          <button class="btn btn-primary" id="rc-yes">Tôi đồng ý tham gia</button>
        </div>
        <div id="rc-err" style="color:#c00;font-size:13px;margin-top:8px"></div>
      </div>`;
    document.body.appendChild(ov);
    ov.querySelector('#rc-no').onclick = () => {
      try { localStorage.setItem(dismissKey(), String(Date.now())); } catch (e) {}
      ov.remove();
    };
    ov.querySelector('#rc-yes').onclick = async () => {
      try {
        const r = await api('/research/consent', { method: 'POST', body: { agree: true, version: CONSENT_VERSION } });
        status = { consented: true, group_code: r.group_code };
        ov.remove(); flush(); renderProfileCard();
      } catch (e) { ov.querySelector('#rc-err').textContent = 'Chưa gửi được: ' + e.message; }
    };
  }

  async function init() {
    if (!enabled() || !token()) return;
    try {
      status = await api('/research/status'); renderProfileCard();
      if (!status.consented) {
        let last = 0; try { last = Number(localStorage.getItem(dismissKey())) || 0; } catch (e) {}
        if (Date.now() - last > 3 * 24 * 3600 * 1000) showConsent();   // hỏi lại sau 3 ngày nếu "Để sau"
      } else flush();
    } catch (e) { /* offline hoặc Worker cũ: bỏ qua */ }
  }

  // ---------- ghi nhật ký ----------
  async function recordRound(mode, answers) {
    if (!enabled() || !status || !status.consented || !answers || !answers.length) return;
    const roundId = uuid(), now = Date.now();
    const rows = [];
    for (let i = 0; i < answers.length; i++) {
      const a = answers[i];
      if (a.correct !== true && a.correct !== false) continue;     // chưa chấm xong thì bỏ
      rows.push({
        id: uuid(), qid: await makeQid(a.question, a.correctAnswer),
        ts: new Date(now - (answers.length - i)).toISOString(),   // giữ thứ tự trong ván (chưa có giờ riêng từng câu)
        correct: a.correct ? 1 : 0, skipped: a.userAnswer ? 0 : 1
      });
    }
    if (!rows.length) return;
    const q = readQ(); q.push({ mode, round_id: roundId, rows }); writeQ(q);
    flush();
  }

  async function flush() {
    if (flushing || !enabled() || !status || !status.consented) return;
    flushing = true;
    try {
      let q = readQ();
      while (q.length) {
        const job = q[0];
        while (job.rows.length) {
          const part = job.rows.slice(0, CHUNK);
          await api('/research/log', { method: 'POST', body: { mode: job.mode, round_id: job.round_id, attempts: part } });
          job.rows = job.rows.slice(CHUNK); writeQ(q);
        }
        q.shift(); writeQ(q);
      }
    } catch (e) { /* giữ lại hàng đợi, thử lại lần sau */ }
    flushing = false;
  }

  async function withdraw(deleteData) {
    await api('/research/withdraw', { method: 'POST', body: { deleteData: !!deleteData } });
    status = { consented: false, group_code: status ? status.group_code : 'none' };
    writeQ([]);
  }

  // Thẻ "Nghiên cứu" trong Hồ sơ: xem trạng thái, tham gia, rút lui (giữ hoặc xóa dữ liệu đã ghi)
  function renderProfileCard() {
    const el = document.getElementById('profile-research-card');
    if (!el || !enabled()) { if (el) el.style.display = 'none'; return; }
    if (!status) { el.style.display = 'none'; return; }
    el.style.display = '';
    if (status.consented) {
      el.innerHTML = `<div class="profile-card-title">🔬 Tham gia nghiên cứu</div>
        <div class="profile-info-note" style="margin-bottom:10px">Bạn đang tham gia. Hệ thống ghi mã câu hỏi, đúng/sai và thời điểm làm bài (ẩn danh). Bạn có thể rút lui bất cứ lúc nào.</div>
        ${status.test_open && status.test_open.pre && !(status.test_done && status.test_done.pre) ? '<button class="btn btn-primary" id="rp-pre" style="width:100%;margin-bottom:8px">📝 Làm bài kiểm tra đầu vào</button>' : ''}
        ${status.test_open && status.test_open.post && !(status.test_done && status.test_done.post) ? '<button class="btn btn-primary" id="rp-post" style="width:100%;margin-bottom:8px">📝 Làm bài kiểm tra đầu ra</button>' : ''}
        <button class="btn btn-outline" id="rp-out" style="width:100%;margin-bottom:8px">Rút lui (giữ dữ liệu đã ghi)</button>
        <button class="btn btn-outline" id="rp-del" style="width:100%">Rút lui và xóa dữ liệu của tôi</button>`;
      const run = async (del) => {
        if (!confirm(del ? 'Rút lui và XÓA toàn bộ dữ liệu nghiên cứu đã ghi của bạn? Không thể khôi phục.' : 'Rút lui khỏi nghiên cứu? Dữ liệu đã ghi vẫn được giữ.')) return;
        try { await withdraw(del); renderProfileCard(); } catch (e) { alert('Chưa thực hiện được: ' + e.message); }
      };
      const bp = el.querySelector('#rp-pre'), bq = el.querySelector('#rp-post');
      if (bp) bp.onclick = () => runTest('pre'); if (bq) bq.onclick = () => runTest('post');
      el.querySelector('#rp-out').onclick = () => run(false);
      el.querySelector('#rp-del').onclick = () => run(true);
    } else {
      el.innerHTML = `<div class="profile-card-title">🔬 Tham gia nghiên cứu</div>
        <div class="profile-info-note" style="margin-bottom:10px">Bạn chưa tham gia. Không tham gia vẫn dùng Olym63 bình thường.</div>
        <button class="btn btn-primary" id="rp-join" style="width:100%">Tìm hiểu và tham gia</button>`;
      el.querySelector('#rp-join').onclick = () => { try { localStorage.removeItem(dismissKey()); } catch (e) {} showConsent(); };
    }
  }


  // ================= BÀI KIỂM TRA TRƯỚC / SAU =================
  // Đề cố định (qid lưu ở D1, nội dung lấy từ Google Sheets). Làm không giới hạn thời gian, không báo đúng/sai.
  // Chấm bằng so khớp chuẩn hóa như lớp chấm nội bộ của web (exactMatch / simpleCompare), KHÔNG dùng AI.
  async function loadPoolMap() {
    const r = await loadKhoiDong({ scope: 'ALL', subject: 'ALL' }, true);
    if (!r.success) throw new Error(r.error || 'Không tải được ngân hàng câu hỏi.');
    const map = new Map();
    for (let i = 0; i < r.questions.length; i += 400) {
      const part = r.questions.slice(i, i + 400);
      const ids = await Promise.all(part.map(q => makeQid(q.question, q.answer)));
      part.forEach((q, k) => { if (!map.has(ids[k])) map.set(ids[k], q); });
    }
    return { map, questions: r.questions };
  }
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  async function runTest(phase) {
    const label = phase === 'pre' ? 'đầu vào' : 'đầu ra';
    const ov = document.createElement('div');
    ov.className = 'modal-overlay show'; ov.id = 'research-test';
    ov.innerHTML = '<div class="modal-box" style="max-width:560px;text-align:left"><div class="modal-sub" id="rt-body">Đang chuẩn bị bài kiểm tra…</div></div>';
    document.body.appendChild(ov);
    const body = () => ov.querySelector('#rt-body');
    try {
      const form = await api('/research/test?phase=' + phase);
      const { map } = await loadPoolMap();
      const items = form.qids.map(id => ({ qid: id, q: map.get(id) }));
      if (items.some(i => !i.q)) throw new Error('Một số câu của đề không còn trong ngân hàng câu hỏi. Hãy báo quản trị viên.');
      for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [items[i], items[j]] = [items[j], items[i]]; }
      const result = []; let idx = 0;
      const show = () => {
        const it = items[idx];
        body().innerHTML = `<div class="modal-title" style="font-size:18px">Bài kiểm tra ${label} · Câu ${idx + 1}/${items.length}</div>
          <div style="margin:12px 0;font-size:16px;line-height:1.5">${esc(it.q.question)}</div>
          <input type="text" id="rt-ans" class="answer-input" placeholder="Nhập câu trả lời…" autocomplete="off" spellcheck="false" style="width:100%;box-sizing:border-box">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px">
            <span style="font-size:12px;opacity:.7">Không giới hạn thời gian. Hệ thống không báo đúng/sai trong lúc làm bài.</span>
            <button class="btn btn-primary" id="rt-next">${idx === items.length - 1 ? 'Nộp bài' : 'Câu tiếp'}</button>
          </div>`;
        const inp = body().querySelector('#rt-ans'); inp.focus();
        const next = () => {
          const u = inp.value || '', c = it.q.answer || '';
          const ok = !!u.trim() && (exactMatch(u, c) || simpleCompare(u, c));
          result.push({ qid: it.qid, correct: ok ? 1 : 0 }); idx++;
          if (idx < items.length) show(); else submit();
        };
        body().querySelector('#rt-next').onclick = next;
        inp.onkeydown = e => { if (e.key === 'Enter') next(); };
      };
      const submit = async () => {
        body().innerHTML = 'Đang nộp bài…';
        try {
          await api('/research/test', { method: 'POST', body: { phase, items: result } });
          status.test_done = Object.assign({}, status.test_done, { [phase]: true });
          body().innerHTML = '<div class="modal-title" style="font-size:20px">Đã nộp bài ✅</div><div style="margin:12px 0">Cảm ơn bạn đã tham gia. Kết quả được ghi nhận cho nghiên cứu.</div><button class="btn btn-primary" id="rt-close">Đóng</button>';
          body().querySelector('#rt-close').onclick = () => { ov.remove(); renderProfileCard(); };
        } catch (e) {
          body().innerHTML = `<div style="color:#c00;margin-bottom:12px">Chưa nộp được: ${esc(e.message)}</div><button class="btn btn-primary" id="rt-retry">Thử nộp lại</button>`;
          body().querySelector('#rt-retry').onclick = submit;
        }
      };
      show();
    } catch (e) {
      body().innerHTML = `<div style="color:#c00;margin-bottom:12px">${esc(e.message)}</div><button class="btn btn-outline" id="rt-x">Đóng</button>`;
      body().querySelector('#rt-x').onclick = () => ov.remove();
    }
  }

  // ================= QUẢN TRỊ NGHIÊN CỨU (chỉ admin) =================
  async function adminCsv(path, name) {
    const res = await fetch(base() + path, { headers: { Authorization: 'Bearer ' + token() } });
    if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || ('HTTP ' + res.status)); }
    const a = document.createElement('a'); a.href = URL.createObjectURL(await res.blob()); a.download = name; a.click();
  }
  async function adminBuildForms(nPer) {
    const { questions } = await loadPoolMap();
    const bySub = {};
    const seen = new Set();
    for (const q of questions) { const id = await makeQid(q.question, q.answer); if (seen.has(id)) continue; seen.add(id); q._id = id; (bySub[q.subject || '_'] = bySub[q.subject || '_'] || []).push(q); }
    for (const k in bySub) { const a = bySub[k]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } }
    const keys = Object.keys(bySub), taken = [];
    let guard = 0;
    while (taken.length < nPer * 2 && guard++ < 10000) { const k = keys[taken.length % keys.length]; if (bySub[k].length) taken.push(bySub[k].pop()._id); }
    const A = taken.filter((_, i) => i % 2 === 0), B = taken.filter((_, i) => i % 2 === 1);
    return api('/admin/research/form', { method: 'POST', body: { A, B } });
  }
  function fmtSummary(s) {
    const L = [];
    L.push('Người đã đồng ý: ' + ((s.learners || []).map(r => `${r.group_code}=${r.n}`).join(', ') || 'chưa có'));
    L.push('Luyện tập: ' + ((s.practice || []).map(r => `${r.group_code}: ${r.learners} người, ${r.attempts} lượt, đúng ${Math.round(r.accuracy * 100)}%`).join(' | ') || 'chưa có'));
    L.push('Số lượt theo ngày: ' + ((s.per_day || []).map(r => `${r.day.slice(5)}:${r.attempts}`).join(', ') || 'chưa có'));
    if (s.tests_note) L.push(s.tests_note);
    else {
      L.push('Đề kiểm tra: ' + ((s.forms || []).map(r => `${r.form_id}=${r.n_items} câu`).join(', ') || 'chưa tạo'));
      L.push('Mở: đầu vào=' + ((s.config || {}).open_pre === '1' ? 'có' : 'không') + ', đầu ra=' + ((s.config || {}).open_post === '1' ? 'có' : 'không'));
      L.push('Điểm kiểm tra: ' + ((s.tests || []).map(r => `${r.group_code}/${r.phase}: n=${r.n}, TB ${Math.round(r.mean_score * 100)}%`).join(' | ') || 'chưa có'));
    }
    return L.join('\n');
  }
  function renderAdminCard() {
    const el = document.getElementById('admin-research-card');
    if (!el || !enabled()) { if (el) el.style.display = 'none'; return; }
    el.style.display = '';
    el.innerHTML = `<div class="profile-card-title">🔬 Nghiên cứu (admin)</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px">
        <button class="btn btn-outline btn-sm" data-a="sum">Tổng quan</button>
        <button class="btn btn-outline btn-sm" data-a="forms">Tạo 2 đề kiểm tra</button>
        <button class="btn btn-outline btn-sm" data-a="open_pre">Mở/đóng bài đầu vào</button>
        <button class="btn btn-outline btn-sm" data-a="open_post">Mở/đóng bài đầu ra</button>
        <button class="btn btn-outline btn-sm" data-a="csv_a">Tải CSV nhật ký</button>
        <button class="btn btn-outline btn-sm" data-a="csv_t">Tải CSV điểm</button>
      </div>
      <pre id="admin-research-out" style="white-space:pre-wrap;font-size:12px;margin:0"></pre>`;
    const out = el.querySelector('#admin-research-out');
    const say = t => { out.textContent = t; };
    el.onclick = async (e) => {
      const a = e.target && e.target.dataset && e.target.dataset.a; if (!a) return;
      try {
        if (a === 'sum') say(fmtSummary(await api('/admin/research/summary')));
        else if (a === 'forms') {
          const n = parseInt(prompt('Số câu mỗi đề (A và B), khuyến nghị 15:', '15'), 10); if (!n || n < 5) return;
          if (!confirm('Tạo lại 2 đề kiểm tra? (Không đổi được sau khi đã có học sinh làm bài.)')) return;
          say('Đang tạo đề…'); const r = await adminBuildForms(n); say(`Đã tạo đề A (${r.A} câu) và B (${r.B} câu).`);
        } else if (a === 'open_pre' || a === 'open_post') {
          const s = await api('/admin/research/summary'); const cur = (s.config || {})[a] === '1';
          await api('/admin/research/config', { method: 'POST', body: { [a]: !cur } });
          say((a === 'open_pre' ? 'Bài đầu vào: ' : 'Bài đầu ra: ') + (!cur ? 'ĐÃ MỞ' : 'ĐÃ ĐÓNG'));
        } else if (a === 'csv_a') await adminCsv('/admin/research/export', 'attempts.csv');
        else if (a === 'csv_t') await adminCsv('/admin/research/export?table=test', 'tests.csv');
      } catch (err) { say('Lỗi: ' + err.message); }
    };
  }

  window.addEventListener('online', () => { flush(); });
  return { init, renderProfileCard, renderAdminCard, runTest, recordRound, flush, withdraw, makeQid, norm, getStatus: () => status };
})();
