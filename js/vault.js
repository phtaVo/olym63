// ============================================================
// VAULT — "Kho dữ liệu của tôi": thư mục + tệp + ghi chú + liên kết kiểu Google Drive
//  • Tệp nằm ở Cloudflare R2, trình duyệt tải THẲNG lên bằng link ký sẵn (Worker không phải gánh dữ liệu)
//  • Không nhận video (dán link YouTube/Drive vào mục Liên kết)
//  • VAULT.mount(elId, {pick}) dùng lại trình duyệt thư mục nhỏ trong Sổ nghiên cứu
//  • VAULT.token() xin mã cho extension "Lưu về Olym63"
// ============================================================
const VAULT = (() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const api = (p, o) => AUTH.apiFetch(p, o);
  const post = (p, b) => api(p, { method: 'POST', body: JSON.stringify(b || {}) });
  const toast = m => { try { showToast(m); } catch (e) { alert(m); } };
  const VIDEO = /\.(mp4|mov|avi|mkv|webm|flv|wmv|m4v|mpg|mpeg|3gp)$/i;
  const MAX_PAR = 2; let uid = 0;
  const S = { parent: '', nodes: [], crumbs: [], used: 0, quota: 0, q: '', view: 'grid', busy: false, ups: [], menu: null };

  function size(n) { n = Number(n) || 0; if (n < 1024) return n + ' B'; if (n < 1048576) return (n / 1024).toFixed(0) + ' KB'; if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MB'; return (n / 1073741824).toFixed(2) + ' GB'; }
  function kindOf(n) {
    if (n.kind === 'folder') return ['folder', 'Thư mục', 'folder'];
    if (n.kind === 'note') return ['text', 'Ghi chú', 'note'];
    if (n.kind === 'link') return ['link', 'Liên kết', 'link'];
    const x = (n.name.split('.').pop() || '').toLowerCase();
    if (x === 'pdf') return ['file', 'PDF', 'pdf']; if (/^docx?$/.test(x)) return ['file', 'Word', 'word']; if (/^pptx?$/.test(x)) return ['file', 'PowerPoint', 'ppt'];
    if (/^(xlsx?|csv)$/.test(x)) return ['file', 'Excel', 'xls']; if (/^(png|jpe?g|webp|gif|bmp|svg)$/.test(x) || /^image\//.test(n.mime || '')) return ['image', 'Hình ảnh', 'img'];
    return ['file', x ? x.toUpperCase() : 'Tệp', 'oth'];
  }
  const when = t => { const d = new Date(t); return d.toLocaleDateString('vi-VN') ; };

  // ---------- gọi dữ liệu ----------
  async function load(parent) {
    S.busy = true; draw();
    try {
      const r = S.q ? await api('/vault/search?q=' + encodeURIComponent(S.q)) : await api('/vault/list?parent=' + encodeURIComponent(parent == null ? S.parent : parent));
      if (!S.q) { S.parent = parent == null ? S.parent : parent; S.crumbs = r.crumbs || []; S.used = r.used; S.quota = r.quota; }
      S.nodes = r.nodes || [];
    } catch (e) { S.nodes = []; toast(e.message); }
    S.busy = false; draw();
  }

  // ---------- màn hình chính ----------
  function open() {
    showScreen('vault-screen'); const el = $('vault-screen'); if (!el) return;
    if (!el.dataset.ready) { el.dataset.ready = 1; bindDrop(el); document.addEventListener('click', e => { if (S.menu && !e.target.closest('.vt-menu,.vt-more')) { S.menu = null; draw(); } }); }
    S.q = ''; load(S.parent);
  }
  function draw() {
    const el = $('vault-screen'); if (!el || el.classList.contains('hidden')) return;
    const pct = S.quota ? Math.min(100, Math.round(S.used / S.quota * 100)) : 0;
    const crumbs = `<button class="vt-crumb" onclick="VAULT.go('')">${IC('vault')} Kho của tôi</button>${S.crumbs.map(c => `<span class="vt-sep">/</span><button class="vt-crumb" onclick="VAULT.go('${c.id}')">${esc(c.name)}</button>`).join('')}`;
    const keepQ = ($('vt-q') || {}).value;
    el.innerHTML = `<div class="page vt">
      <div class="page-head rv in"><div style="flex:1"><h1>Kho dữ liệu của tôi</h1><p>Nơi gom tài liệu, ghi chú, hình ảnh bạn thu thập khi học và nghiên cứu. Mọi thứ tải lên đây đều có thể đưa vào Sổ nghiên cứu.</p></div>
        <div class="vt-quota glass"><b>${size(S.used)}</b> / ${size(S.quota)}<div class="vt-bar"><i style="width:${pct}%"></i></div></div></div>
      <div class="vt-tools glass">
        <button class="pbtn p" onclick="VAULT.pick()">${IC('upload')} Tải tệp lên</button>
        <button class="pbtn" onclick="VAULT.newFolder()">${IC('folder')} Thư mục mới</button>
        <button class="pbtn" onclick="VAULT.note()">${IC('text')} Ghi chú</button>
        <button class="pbtn" onclick="VAULT.link()">${IC('link')} Liên kết</button>
        <button class="pbtn" onclick="VAULT.extHelp()">${IC('external')} Cài extension</button>
        <div class="search vt-search">${IC('search')}<input id="vt-q" placeholder="Tìm tên tệp hoặc nội dung ghi chú…" value="${esc(keepQ == null ? S.q : keepQ)}" onkeydown="if(event.key==='Enter')VAULT.search(this.value)"></div>
        <div class="seg vt-view"><button class="${S.view === 'grid' ? 'on' : ''}" onclick="VAULT.setView('grid')" aria-label="Dạng lưới">▦</button><button class="${S.view === 'list' ? 'on' : ''}" onclick="VAULT.setView('list')" aria-label="Dạng danh sách">☰</button></div>
        <input type="file" id="vt-file" multiple hidden onchange="VAULT.upload(this.files);this.value=''">
      </div>
      <div class="vt-crumbs">${S.q ? `<button class="vt-crumb" onclick="VAULT.search('')">← Thoát tìm kiếm “${esc(S.q)}”</button>` : crumbs}</div>
      <div class="vt-dz glass" id="vt-dz">${S.busy && !S.nodes.length ? '<div class="nb-note" style="padding:40px;text-align:center">Đang tải…</div>' : body()}</div>
      ${S.ups.length ? `<div class="vt-ups glass">${S.ups.map(u => `<div class="vt-up" id="vu-${u.id}"><span class="n">${esc(u.name)}</span><span class="s">${u.err ? esc(u.err) : u.done ? 'Xong' : u.pct + '%'}</span><div class="vt-bar"><i style="width:${u.done ? 100 : u.pct}%;${u.err ? 'background:#c0392b' : ''}"></i></div></div>`).join('')}</div>` : ''}
    </div>`;
    if (keepQ != null && document.activeElement === document.body) { /* giữ nguyên */ }
  }
  function body() {
    if (!S.nodes.length) return `<div class="vt-empty">${IC('folder')}<h3>${S.q ? 'Không tìm thấy' : 'Thư mục này đang trống'}</h3><p>${S.q ? 'Thử từ khóa khác.' : 'Kéo thả tệp vào đây, hoặc bấm “Tải tệp lên”. Hỗ trợ Word, PDF, PowerPoint, Excel, hình ảnh, ghi chú và liên kết (không nhận video).'}</p></div>`;
    return `<div class="vt-grid ${S.view}">${S.nodes.map(n => {
      const k = kindOf(n); const menu = S.menu === n.id;
      return `<div class="vt-item k-${k[2]}" ondblclick="VAULT.openNode('${n.id}')" onclick="if(window.matchMedia('(hover:none)').matches)VAULT.openNode('${n.id}')">
        <div class="vt-ic">${IC(k[0])}</div>
        <div class="vt-meta"><b title="${esc(n.name)}">${esc(n.name)}</b><small>${k[1]}${n.kind === 'file' ? ' · ' + size(n.size) : ''}${n.kind === 'note' && n.tlen ? ' · ' + n.tlen.toLocaleString('vi-VN') + ' ký tự' : ''} · ${when(n.updated)}</small></div>
        <button class="vt-more" aria-label="Thao tác" onclick="event.stopPropagation();VAULT.menu('${n.id}')">${IC('more')}</button>
        ${menu ? `<div class="vt-menu glass" onclick="event.stopPropagation()">
          <button onclick="VAULT.openNode('${n.id}')">${IC('external')} Mở</button>
          ${n.kind === 'file' ? `<button onclick="VAULT.download('${n.id}')">${IC('download')} Tải về</button>` : ''}
          ${n.kind === 'note' ? `<button onclick="VAULT.note('${n.id}')">${IC('edit')} Sửa ghi chú</button>` : ''}
          <button onclick="VAULT.rename('${n.id}')">${IC('edit')} Đổi tên</button>
          <button onclick="VAULT.moveDlg('${n.id}')">${IC('move')} Di chuyển</button>
          <button class="dg" onclick="VAULT.del('${n.id}')">${IC('trash')} Xóa</button></div>` : ''}
      </div>`;
    }).join('')}</div>`;
  }
  function bindDrop(el) {
    ['dragenter', 'dragover'].forEach(e => el.addEventListener(e, ev => { if (ev.dataTransfer && [...ev.dataTransfer.types].includes('Files')) { ev.preventDefault(); const d = $('vt-dz'); if (d) d.classList.add('over'); } }));
    ['dragleave', 'drop'].forEach(e => el.addEventListener(e, ev => { const d = $('vt-dz'); if (d && (e === 'drop' || !el.contains(ev.relatedTarget))) d.classList.remove('over'); }));
    el.addEventListener('drop', ev => { if (ev.dataTransfer && ev.dataTransfer.files.length) { ev.preventDefault(); upload(ev.dataTransfer.files); } });
  }

  // ---------- thao tác ----------
  const go = id => { S.q = ''; S.menu = null; load(id); };
  const search = q => { S.q = String(q || '').trim(); S.menu = null; load(); };
  const setView = v => { S.view = v; draw(); };
  const menu = id => { S.menu = S.menu === id ? null : id; draw(); };
  const find = id => S.nodes.find(n => n.id === id);
  function pick() { const f = $('vt-file'); if (f) f.click(); }

  function dlg(html, wide) {
    close(); const d = document.createElement('div'); d.className = 'vt-ov'; d.id = 'vt-ov';
    d.innerHTML = `<div class="vt-box glass ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">${html}</div>`;
    d.addEventListener('mousedown', e => { if (e.target === d) close(); }); document.body.appendChild(d);
    const i = d.querySelector('input,textarea'); if (i) setTimeout(() => i.focus(), 30);
  }
  function close() { const d = $('vt-ov'); if (d) d.remove(); }
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

  function newFolder() {
    dlg(`<h2>Thư mục mới</h2><input id="vt-n" placeholder="Tên thư mục (vd: Sinh 12 – Di truyền)" onkeydown="if(event.key==='Enter')VAULT.doFolder()"><div class="vt-act"><button class="pbtn" onclick="VAULT.close()">Hủy</button><button class="pbtn p" onclick="VAULT.doFolder()">Tạo</button></div>`);
  }
  async function doFolder() { const n = ($('vt-n') || {}).value; if (!n || !n.trim()) return; try { await post('/vault/folder', { name: n, parent: S.parent }); close(); load(); } catch (e) { toast(e.message); } }

  async function note(id) {
    let n = { name: '', text: '' };
    if (id) { try { n = (await api('/vault/node?id=' + id)).node; } catch (e) { return toast(e.message); } }
    dlg(`<h2>${id ? 'Sửa ghi chú' : 'Ghi chú mới'}</h2><input id="vt-n" placeholder="Tiêu đề" value="${esc(n.name)}"><textarea id="vt-t" placeholder="Viết hoặc dán nội dung… (AI trong Sổ nghiên cứu có thể đọc ghi chú này)">${esc(n.text || '')}</textarea>
      <div class="vt-act"><button class="pbtn" onclick="VAULT.close()">Hủy</button><button class="pbtn p" onclick="VAULT.doNote('${id || ''}')">Lưu</button></div>`, 1);
  }
  async function doNote(id) {
    const name = ($('vt-n') || {}).value || 'Ghi chú', text = ($('vt-t') || {}).value || '';
    if (!text.trim()) return toast('Ghi chú đang trống.');
    try { await post('/vault/note', { id: id || undefined, parent: S.parent, name, text }); close(); load(); } catch (e) { toast(e.message); }
  }
  function link() {
    dlg(`<h2>Thêm liên kết</h2><input id="vt-n" placeholder="Tên hiển thị"><input id="vt-u" placeholder="https://… (Google Docs, bài báo, YouTube, trang web bất kỳ)" onkeydown="if(event.key==='Enter')VAULT.doLink()"><div class="vt-act"><button class="pbtn" onclick="VAULT.close()">Hủy</button><button class="pbtn p" onclick="VAULT.doLink()">Thêm</button></div>`);
  }
  async function doLink() {
    let u = (($('vt-u') || {}).value || '').trim(); if (!u) return; if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    const name = (($('vt-n') || {}).value || '').trim() || u.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60);
    try { await post('/vault/link', { parent: S.parent, name, url: u }); close(); load(); } catch (e) { toast(e.message); }
  }
  function rename(id) { const n = find(id); if (!n) return; S.menu = null; draw(); dlg(`<h2>Đổi tên</h2><input id="vt-n" value="${esc(n.name)}" onkeydown="if(event.key==='Enter')VAULT.doRename('${id}')"><div class="vt-act"><button class="pbtn" onclick="VAULT.close()">Hủy</button><button class="pbtn p" onclick="VAULT.doRename('${id}')">Lưu</button></div>`); }
  async function doRename(id) { try { await post('/vault/rename', { id, name: ($('vt-n') || {}).value }); close(); load(); } catch (e) { toast(e.message); } }
  async function del(id) {
    const n = find(id); if (!n) return; S.menu = null; draw();
    dlg(`<h2>Xóa “${esc(n.name)}”?</h2><p class="nb-note">${n.kind === 'folder' ? 'Toàn bộ nội dung trong thư mục cũng bị xóa.' : 'Không thể hoàn tác.'}</p><div class="vt-act"><button class="pbtn" onclick="VAULT.close()">Hủy</button><button class="pbtn p dg" onclick="VAULT.doDel('${id}')">Xóa</button></div>`);
  }
  async function doDel(id) { try { await api('/vault/node?id=' + id, { method: 'DELETE' }); close(); load(); } catch (e) { toast(e.message); } }
  async function moveDlg(id) {
    const n = find(id); if (!n) return; S.menu = null; draw();
    let fs = []; try { fs = (await api('/vault/tree')).folders; } catch (e) { return toast(e.message); }
    const kids = {}; fs.forEach(f => (kids[f.parent_id || ''] = kids[f.parent_id || ''] || []).push(f));
    const walk = (p, d) => (kids[p] || []).filter(f => f.id !== id).map(f => `<button class="vt-pick" style="padding-left:${12 + d * 18}px" onclick="VAULT.doMove('${id}','${f.id}')">${IC('folder')} ${esc(f.name)}</button>${walk(f.id, d + 1)}`).join('');
    dlg(`<h2>Di chuyển “${esc(n.name)}” tới…</h2><div class="vt-tree"><button class="vt-pick" onclick="VAULT.doMove('${id}','')">${IC('vault')} Kho của tôi (gốc)</button>${walk('', 1)}</div><div class="vt-act"><button class="pbtn" onclick="VAULT.close()">Hủy</button></div>`);
  }
  async function doMove(id, parent) { try { await post('/vault/move', { id, parent }); close(); load(); } catch (e) { toast(e.message); } }

  // ---------- mở / tải ----------
  async function fileUrl(id, dl) { return api('/vault/file?id=' + id + (dl ? '&dl=1' : '')); }
  async function openNode(id) {
    const n = find(id); if (!n) return; S.menu = null;
    if (n.kind === 'folder') return go(id);
    if (n.kind === 'link') return window.open(n.url, '_blank', 'noopener');
    if (n.kind === 'note') {
      try { const r = (await api('/vault/node?id=' + id)).node; let meta = {}; try { meta = JSON.parse(r.meta || '{}'); } catch (e) {} const src = r.url || meta.url;
        dlg(`<h2>${esc(r.name)}</h2>${src ? `<div class="nb-note" style="margin-bottom:8px">Nguồn: <a href="${esc(src)}" target="_blank" rel="noopener noreferrer">${esc(src.slice(0, 80))}</a></div>` : ''}<div class="vt-read">${esc(r.text || '')}</div><div class="vt-act"><button class="pbtn" onclick="VAULT.close()">Đóng</button><button class="pbtn p" onclick="VAULT.note('${id}')">Sửa</button></div>`, 1);
      } catch (e) { toast(e.message); } return;
    }
    const k = kindOf(n)[2];
    try { const r = await fileUrl(id, !(k === 'pdf' || k === 'img')); window.open(r.url, '_blank', 'noopener'); } catch (e) { toast(e.message); }
  }
  async function download(id) { S.menu = null; draw(); try { const r = await fileUrl(id, true); const a = document.createElement('a'); a.href = r.url; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); } catch (e) { toast(e.message); } }

  // ---------- tải lên (thẳng lên R2, có tiến trình) ----------
  function upload(files) {
    const fs = Array.from(files || []); if (!fs.length) return;
    fs.forEach(f => { if (VIDEO.test(f.name) || /^video\//.test(f.type)) { toast('Không nhận video: ' + f.name + '. Hãy dán link vào mục Liên kết.'); return; } S.ups.push({ id: ++uid, f, name: f.name, pct: 0, parent: S.parent }); });
    pump(); draw();
  }
  function pump() {
    const running = S.ups.filter(u => u.run && !u.done && !u.err).length;
    S.ups.filter(u => !u.run && !u.done && !u.err).slice(0, Math.max(0, MAX_PAR - running)).forEach(runUp);
    if (S.ups.length && S.ups.every(u => u.done || u.err)) setTimeout(() => { S.ups = S.ups.filter(u => u.err); load(); }, 900);
  }
  async function runUp(u) {
    u.run = 1;
    try {
      const init = await post('/vault/upload-init', { name: u.f.name, size: u.f.size, mime: u.f.type, parent: u.parent });
      await new Promise((ok, no) => {
        const x = new XMLHttpRequest(); x.open('PUT', init.url);
        x.upload.onprogress = e => { if (e.lengthComputable) { u.pct = Math.round(e.loaded / e.total * 100); const r = $('vu-' + u.id); if (r) { r.querySelector('.s').textContent = u.pct + '%'; r.querySelector('i').style.width = u.pct + '%'; } } };
        x.onload = () => x.status < 300 ? ok() : no(new Error('R2 từ chối tải lên (' + x.status + '). Kiểm tra CORS của bucket.'));
        x.onerror = () => no(new Error('Không tải được lên R2 — kiểm tra mạng hoặc CORS của bucket.'));
        x.send(u.f);
      });
      await post('/vault/upload-done', { id: init.id }); u.done = 1;
    } catch (e) { u.err = e.message; }
    draw(); pump();
  }

  // ---------- extension ----------
  async function token() { return (await post('/vault/ext-token')).token; }
  async function extHelp() {
    let t = ''; try { t = await token(); } catch (e) { return toast(e.message); }
    const api0 = (CONFIG.ACCOUNTS_API_URL || '').replace(/\/+$/, '');
    dlg(`<h2>Extension “Lưu về Olym63”</h2>
      <ol class="vt-steps"><li>Tải thư mục <b>olym63-extension</b> (kèm hướng dẫn) và giải nén.</li><li>Mở <b>chrome://extensions</b> → bật “Chế độ nhà phát triển” → “Tải tiện ích đã giải nén” → chọn thư mục đó.</li><li>Bấm biểu tượng Olym63 trên thanh công cụ → dán mã kết nối bên dưới → Lưu.</li></ol>
      <label class="nb-note">Địa chỉ máy chủ</label><input readonly value="${esc(api0)}" onclick="this.select()">
      <label class="nb-note">Mã kết nối (riêng tư — đừng gửi cho người khác)</label><textarea readonly rows="3" onclick="this.select()">${esc(t)}</textarea>
      <div class="nb-note">Dùng: bôi đen chữ trên trang web → bấm “Lưu về Olym63” → chọn thư mục. Chụp màn hình: nhấn <b>Ctrl + =</b>.</div>
      <div class="vt-act"><button class="pbtn" onclick="navigator.clipboard.writeText('${esc(t)}').then(()=>showToast('Đã chép mã'))">Chép mã</button><button class="pbtn p" onclick="VAULT.close()">Xong</button></div>`, 1);
  }

  // ---------- dùng lại trong Sổ nghiên cứu: trình duyệt thư mục nhỏ ----------
  const M = {};   // trạng thái từng mount
  async function mount(elId, opt) {
    const el = $(elId); if (!el) return; const m = M[elId] = M[elId] || { parent: '' }; m.opt = opt || {};
    el.innerHTML = '<div class="nb-note">Đang tải Kho dữ liệu…</div>';
    try {
      const r = await api('/vault/list?parent=' + encodeURIComponent(m.parent));
      const crumbs = `<button class="vt-crumb" onclick="VAULT._m('${elId}','')">Kho</button>${(r.crumbs || []).map(c => `<span class="vt-sep">/</span><button class="vt-crumb" onclick="VAULT._m('${elId}','${c.id}')">${esc(c.name)}</button>`).join('')}`;
      el.innerHTML = `<div class="vt-crumbs" style="margin-bottom:8px">${crumbs}</div>${r.nodes.length ? r.nodes.map(n => { const k = kindOf(n); const can = n.kind === 'file' || n.kind === 'note' || (n.kind === 'link' && /youtu/.test(n.url || ''));
        return `<div class="vt-mini">${n.kind === 'folder' ? `<button class="vt-mini-main" onclick="VAULT._m('${elId}','${n.id}')">${IC('folder')}<span>${esc(n.name)}</span></button>` : `<div class="vt-mini-main">${IC(k[0])}<span>${esc(n.name)}<small>${k[1]}${n.kind === 'file' ? ' · ' + size(n.size) : ''}</small></span></div>${can ? `<button class="pbtn" onclick="VAULT._pick('${elId}','${n.id}')">Thêm</button>` : `<small class="nb-note">không đọc được</small>`}`}</div>`; }).join('') : '<div class="nb-note" style="padding:14px 4px">Thư mục trống. Vào tab “Kho dữ liệu của tôi” để tải tài liệu lên, hoặc dùng extension để lưu từ web.</div>'}`;
      m.nodes = r.nodes;
    } catch (e) { el.innerHTML = `<div class="nb-note">${esc(e.message)}</div>`; }
  }
  const _m = (elId, p) => { (M[elId] = M[elId] || {}).parent = p; mount(elId, M[elId].opt); };
  const _pick = (elId, id) => { const m = M[elId]; const n = (m.nodes || []).find(x => x.id === id); if (n && m.opt.pick) m.opt.pick(n); };
  // lấy nội dung để nghiên cứu: ghi chú → chữ; tệp → File (để NB đọc docx/pdf/pptx/xlsx/ảnh)
  async function content(n) {
    if (n.kind === 'note') { const r = (await api('/vault/node?id=' + n.id)).node; return { text: r.text || '', name: r.name }; }
    if (n.kind === 'link') return { url: n.url, name: n.name };
    const r = await fileUrl(n.id, true); const res = await fetch(r.url);
    if (!res.ok) throw new Error('Không tải được tệp từ Kho (' + res.status + '). Kiểm tra CORS của bucket R2.');
    const b = await res.blob(); return { file: new File([b], n.name, { type: n.mime || b.type }), name: n.name };
  }

  return { open, go, search, setView, menu, pick, upload, newFolder, doFolder, note, doNote, link, doLink, rename, doRename, del, doDel, moveDlg, doMove, openNode, download, extHelp, close, token, mount, content, _m, _pick, draw };
})();
