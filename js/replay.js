// ============================================================
// REPLAY — "Chơi lại các câu đã luyện tập" (mỗi phần thi một nút gạt)
//  • Câu đã luyện và trạng thái nút gạt được LƯU THEO TÀI KHOẢN trên máy chủ (đăng nhập máy nào cũng có).
//  • Bản lưu trên thiết bị chỉ là bộ nhớ đệm cho nhanh; dữ liệu cũ trên máy sẽ tự được đẩy lên máy chủ.
//  • Bật nút gạt ở phần thi nào thì phần đó chỉ lấy NGẪU NHIÊN trong số các câu đã luyện.
//  • Lúc đang bật: câu nào được lấy ra chơi lại sẽ bị TRỪ KHỎI kho (không lưu/làm mới nữa) — chơi lại bao nhiêu, kho vơi bấy nhiêu.
//  • Tắt nút gạt thì mới tiếp tục ghi nhớ câu mới như bình thường.
// ============================================================
const REPLAY = (() => {
  const MODES = ['khoi_dong', 'xuat_phat', 've_dich', 'vcnv', 'tang_toc'];
  const CAP = 5000;
  const uid = () => { const u = (typeof AUTH !== 'undefined' && AUTH.getCurrentUser) ? AUTH.getCurrentUser() : null; return u ? String(u.id != null ? u.id : u.username) : 'guest'; };
  const kSeen = () => 'olym63_rp_' + uid();
  const kOn = m => 'olym63_rp_on_' + uid() + '_' + m;
  const rd = () => { try { return JSON.parse(localStorage.getItem(kSeen())) || {}; } catch (e) { return {}; } };
  const wr = s => { try { localStorage.setItem(kSeen(), JSON.stringify(s)); } catch (e) {} };
  const api = (p, o) => AUTH.apiFetch(p, o);
  const loggedIn = () => { try { return !!(AUTH.getCurrentUser && AUTH.getCurrentUser() && AUTH.backendReady()); } catch (e) { return false; } };
  let syncedAt = 0, syncing = null;

  async function qid(q, a) {
    try { return await RESLOG.makeQid(q, a); } catch (e) {}
    const b = new TextEncoder().encode(String(q || '').toLowerCase().trim() + '|' + String(a || '').toLowerCase().trim());
    const h = await crypto.subtle.digest('SHA-256', b);
    return Array.from(new Uint8Array(h)).slice(0, 8).map(x => x.toString(16).padStart(2, '0')).join('');
  }
  async function push(mode, ids) {
    if (!loggedIn() || !ids.length) return;
    for (let i = 0; i < ids.length; i += 300) { try { await api('/replay', { method: 'POST', body: JSON.stringify({ mode, qids: ids.slice(i, i + 300) }) }); } catch (e) {} }
  }
  async function pushDelete(mode, ids) {
    if (!loggedIn() || !ids.length) return;
    for (let i = 0; i < ids.length; i += 300) { try { await api('/replay', { method: 'DELETE', body: JSON.stringify({ mode, qids: ids.slice(i, i + 300) }) }); } catch (e) {} }
  }

  // Nhập các câu đã làm từ hồ sơ luyện tập cũ trên máy (trước khi có tính năng này), chỉ làm 1 lần
  function importLegacy() {
    try {
      const flag = 'olym63_rp_legacy_' + uid();
      if (localStorage.getItem(flag)) return;
      const ad = JSON.parse(localStorage.getItem('olym63_ad_' + uid()) || 'null');
      const ids = ad && ad.seen ? Object.keys(ad.seen) : [];
      localStorage.setItem(flag, '1');
      if (!ids.length) return;
      const s = rd();
      ['khoi_dong', 've_dich'].forEach(m => { const t = s[m] = s[m] || {}; ids.forEach(id => { if (!t[id]) t[id] = ad.seen[id] || 1; }); });
      wr(s);
    } catch (e) {}
  }

  // Kéo dữ liệu từ máy chủ về (gộp với bản trên máy, đẩy phần còn thiếu lên máy chủ)
  function sync(force) {
    if (!loggedIn()) return Promise.resolve(false);
    if (syncing) return syncing;
    if (!force && Date.now() - syncedAt < 60000) return Promise.resolve(false);
    syncing = (async () => {
      let changed = false;
      importLegacy();
      try {
        const d = await api('/replay');
        const s = rd(), srv = d.seen || {};
        for (const m of MODES) {
          const have = new Set(srv[m] || []), loc = s[m] || {}, add = [];
          const merged = s[m] = s[m] || {};
          (srv[m] || []).forEach(id => { if (!merged[id]) { merged[id] = 1; changed = true; } });
          Object.keys(loc).forEach(id => { if (!have.has(id)) add.push(id); });
          if (add.length) await push(m, add);
          if (m in (d.on || {})) { const v = d.on[m] ? '1' : '0'; try { if (localStorage.getItem(kOn(m)) !== v) { localStorage.setItem(kOn(m), v); changed = true; } } catch (e) {} }
        }
        wr(s); syncedAt = Date.now();
      } catch (e) {}
      syncing = null; return changed;
    })();
    return syncing;
  }

  const count = mode => Object.keys(rd()[mode] || {}).length;
  const flagOn = mode => { try { return localStorage.getItem(kOn(mode)) === '1'; } catch (e) { return false; } };
  const isOn = mode => flagOn(mode) && count(mode) > 0;

  async function record(mode, answers) {
    try {
      if (!mode || !answers || !answers.length) return;
      const ids = [];
      for (const a of answers) { if (a && a.question) ids.push(await qid(a.question, a.correctAnswer)); }
      if (!ids.length) return;
      const s = rd(), m = s[mode] || {};
      if (flagOn(mode)) {
        // Đang bật "chơi lại": câu vừa chơi bị trừ khỏi kho, không lưu/làm mới lại
        let changed = false;
        ids.forEach(id => { if (id in m) { delete m[id]; changed = true; } });
        if (changed) { s[mode] = m; wr(s); }
        pushDelete(mode, ids);
        return;
      }
      const now = Date.now(), fresh = [];
      ids.forEach(id => { if (!m[id]) fresh.push(id); m[id] = now; });
      const ks = Object.keys(m);
      if (ks.length > CAP) ks.sort((x, y) => m[x] - m[y]).slice(0, ks.length - CAP).forEach(k => delete m[k]);
      s[mode] = m; wr(s);
      push(mode, fresh);
    } catch (e) {}
  }
  function set(mode, v) {
    try { localStorage.setItem(kOn(mode), v ? '1' : '0'); } catch (e) {}
    if (loggedIn()) api('/replay', { method: 'POST', body: JSON.stringify({ mode, on: !!v }) }).catch(() => {});
    try { if (typeof PORTAL !== 'undefined') PORTAL.renderPractice(); } catch (e) {}
  }
  // Lọc cả bộ câu hỏi: chỉ giữ câu đã luyện (nếu nút gạt của phần này đang bật)
  async function filter(mode, questions) {
    await sync(false);
    if (!isOn(mode)) return questions;
    const seen = rd()[mode] || {}, out = [];
    for (const q of questions) { if (seen[await qid(q.question, q.answer)]) out.push(q); }
    return out;
  }
  return { record, count, isOn, flagOn, set, filter, sync };
})();
