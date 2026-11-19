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
        ov.remove(); flush();
      } catch (e) { ov.querySelector('#rc-err').textContent = 'Chưa gửi được: ' + e.message; }
    };
  }

  async function init() {
    if (!enabled() || !token()) return;
    try {
      status = await api('/research/status');
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

  window.addEventListener('online', () => { flush(); });
  return { init, recordRound, flush, withdraw, makeQid, norm, getStatus: () => status };
})();
