// ============================================================
// NB — "Sổ nghiên cứu" kiểu NotebookLM (Olym63)
//  • Nguồn: ván vừa chơi · tệp Word/PDF/TXT · link YouTube · văn bản dán vào · Wikipedia
//  • Giữa: hỏi đáp có trích dẫn [Nguồn n] · Phải (Studio): tóm tắt, flashcard, sơ đồ tư duy, cây tri thức,
//    bài thi Khởi Động / Về Đích / Xuất Phát, tìm tài liệu tham khảo
//  • Dữ liệu chỉ lưu TRONG TRÌNH DUYỆT của học sinh (localStorage). Nội dung nguồn được gửi tới Gemini (qua Worker proxy)
//    để phân tích. Không ghi vào nhật ký nghiên cứu / bảng xếp hạng.
//  • AI có thể sai: mọi bài thi sinh ra cho xem trước, xoá được câu sai trước khi chơi.
// ============================================================
const NB = (() => {
  const MAX_SRC_CHARS = 90000, MAX_SRCS = 10, CTX_BUDGET = 100000, MAX_ROUNDS = 8;
  const uid = () => { const u = (typeof AUTH !== 'undefined' && AUTH.getCurrentUser) ? AUTH.getCurrentUser() : null; return u ? String(u.id != null ? u.id : u.username) : 'guest'; };
  const K = () => 'olym63_nb1_' + uid(), KR = () => 'olym63_nbround_' + uid();
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const rid = () => Math.random().toString(36).slice(2, 10);
  const $ = id => document.getElementById(id);
  const toast = m => { try { showToast(m); } catch (e) { alert(m); } };

  let db = null, cur = null, pane = 'chat', busy = false;
  const loadDb = () => { if (db) return db; try { db = JSON.parse(localStorage.getItem(K())) || { nbs: [] }; } catch (e) { db = { nbs: [] }; } return db; };
  const saveDb = () => { try { localStorage.setItem(K(), JSON.stringify(db)); return true; } catch (e) { toast('⚠️ Bộ nhớ trình duyệt đầy — hãy xoá bớt sổ hoặc nguồn cũ.'); return false; } };
  const nbOf = id => loadDb().nbs.find(n => n.id === id);

  // ---------- ván vừa chơi (lưu tạm) ----------
  function saveRound(mode, answers, questions) {
    try {
      const subj = {}; (questions || []).forEach(q => { if (q && q.question) subj[q.question] = q.subject; });
      const items = (answers || []).filter(a => a && a.question).map(a => ({ q: a.question, a: a.correctAnswer || '', u: a.userAnswer || '', ok: a.correct === true, s: subj[a.question] || '' }));
      if (!items.length) return;
      let arr = []; try { arr = JSON.parse(localStorage.getItem(KR())) || []; } catch (e) {}
      arr.unshift({ id: rid(), ts: Date.now(), mode, items });
      localStorage.setItem(KR(), JSON.stringify(arr.slice(0, MAX_ROUNDS)));
    } catch (e) {}
  }
  const rounds = () => { try { return JSON.parse(localStorage.getItem(KR())) || []; } catch (e) { return []; } };
  const MODE_NAME = { khoi_dong: 'Khởi Động', ve_dich: 'Về Đích', xuat_phat: 'Xuất Phát', vcnv: 'VCNV', tang_toc: 'Tăng Tốc' };
  function roundToText(r) {
    return `Ván ${MODE_NAME[r.mode] || r.mode} ngày ${new Date(r.ts).toLocaleString('vi-VN')}. Mỗi dòng: câu hỏi | đáp án đúng | học sinh trả lời | kết quả.\n` +
      r.items.map((x, i) => `${i + 1}. ${x.q} | ĐÁP ÁN: ${x.a} | HS: ${x.u || '(bỏ qua)'} | ${x.ok ? 'ĐÚNG' : 'SAI'}${x.s ? ' | môn: ' + x.s : ''}`).join('\n');
  }

  // ---------- Gemini ----------
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function gem(parts, { maxTokens = 4096, temp = 0.3 } = {}) {
    const url = CONFIG.buildGeminiUrl(CONFIG.GEMINI_MODEL);
    const body = JSON.stringify({ contents: [{ parts: typeof parts === 'string' ? [{ text: parts }] : parts }], generationConfig: { temperature: temp, maxOutputTokens: maxTokens } });
    for (let a = 0; a <= 3; a++) {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      const data = await res.json().catch(() => ({}));
      if (data.error) {
        const msg = data.error.message || 'Gemini lỗi';
        if ((res.status === 429 || /quota|rate.?limit/i.test(msg)) && a < 3) { const m = msg.match(/retry in ([\d.]+)\s*s/i); await sleep(Math.min(m ? parseFloat(m[1]) : (a + 1) * 4, 25) * 1000 + 1000); continue; }
        throw new Error(msg);
      }
      const t = (((data.candidates || [])[0] || {}).content || {}).parts;
      return (t || []).map(p => p.text || '').join('');
    }
    throw new Error('Gemini đang quá tải, thử lại sau ít phút.');
  }
  function parseJson(txt) {
    let s = String(txt || '').replace(/```(?:json)?/gi, '').trim();
    const i = Math.min(...['[', '{'].map(c => { const k = s.indexOf(c); return k < 0 ? 1e9 : k; }));
    const j = Math.max(s.lastIndexOf(']'), s.lastIndexOf('}'));
    if (i >= 1e9 || j < i) throw new Error('AI trả về định dạng không đọc được, hãy thử lại.');
    return JSON.parse(s.slice(i, j + 1));
  }
  function ctx(nb, budget = CTX_BUDGET) {
    const srcs = nb.sources; if (!srcs.length) return '';
    const per = Math.floor(budget / srcs.length);
    return srcs.map((s, i) => `### [Nguồn ${i + 1}] ${s.name}\n${(s.text || '').slice(0, per)}`).join('\n\n');
  }

  // ---------- Wikipedia ----------
  const WIKI = 'https://vi.wikipedia.org/w/api.php';
  async function wikiSearch(q, n = 6) {
    const r = await fetch(`${WIKI}?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=${n}&format=json&origin=*`);
    const j = await r.json();
    return ((j.query || {}).search || []).map(x => ({ title: x.title, snippet: String(x.snippet || '').replace(/<[^>]+>/g, ''), url: 'https://vi.wikipedia.org/wiki/' + encodeURIComponent(x.title.replace(/ /g, '_')) }));
  }
  async function wikiText(title) {
    const r = await fetch(`${WIKI}?action=query&prop=extracts&explaintext=1&exlimit=1&redirects=1&titles=${encodeURIComponent(title)}&format=json&origin=*`);
    const j = await r.json(); const p = Object.values((j.query || {}).pages || {})[0];
    return (p && p.extract) || '';
  }

  // ---------- đọc tệp ----------
  const loadScript = (src) => new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error('Không tải được thư viện đọc tệp (cần Internet).')); document.head.appendChild(s); });
  async function readFile(f) {
    const n = f.name.toLowerCase();
    if (/\.(txt|md|csv)$/.test(n)) return await f.text();
    if (n.endsWith('.docx')) {
      if (!window.mammoth) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js');
      const r = await window.mammoth.extractRawText({ arrayBuffer: await f.arrayBuffer() }); return r.value;
    }
    if (n.endsWith('.pdf')) {
      if (!window.pdfjsLib) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      const pdf = await window.pdfjsLib.getDocument({ data: await f.arrayBuffer() }).promise; let out = '';
      for (let i = 1; i <= pdf.numPages && out.length < MAX_SRC_CHARS; i++) { const pg = await pdf.getPage(i); const c = await pg.getTextContent(); out += c.items.map(t => t.str).join(' ') + '\n\n'; }
      return out;
    }
    throw new Error('Chỉ hỗ trợ .docx, .pdf, .txt, .md (file .doc cũ: hãy lưu lại thành .docx).');
  }
  function ytId(u) { const m = String(u).match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/); return m ? m[1] : null; }

  // ---------- thao tác trên sổ ----------
  function addSource(nb, s) {
    if (nb.sources.length >= MAX_SRCS) { toast('Mỗi sổ tối đa ' + MAX_SRCS + ' nguồn.'); return false; }
    s.text = String(s.text || '').replace(/\s+\n/g, '\n').slice(0, MAX_SRC_CHARS);
    if (s.text.trim().length < 20) { toast('Nguồn quá ngắn hoặc không đọc được chữ (PDF scan ảnh chưa hỗ trợ).'); return false; }
    s.id = rid(); s.on = true; nb.sources.push(s); return saveDb();
  }
  function newNb(title) { const nb = { id: rid(), title: title || 'Sổ nghiên cứu mới', ts: Date.now(), sources: [], chat: [], arts: [] }; loadDb().nbs.unshift(nb); saveDb(); return nb; }

  // ============================================================
  // GIAO DIỆN
  // ============================================================
  function css() {
    if ($('nb-css')) return;
    const st = document.createElement('style'); st.id = 'nb-css';
    st.textContent = `
#nb-screen{justify-content:flex-start;align-items:stretch;padding:14px 14px 92px;background:var(--bg);overflow:hidden}
.nb-top{display:flex;align-items:center;gap:10px;padding:4px 6px 12px}
.nb-top h1{font:700 22px var(--font-display);margin:0;flex:1;letter-spacing:.3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nb-btn{border:1px solid var(--border);background:var(--bg2);color:var(--text);padding:8px 14px;border-radius:999px;font:600 14px var(--font-body);cursor:pointer}
.nb-btn:hover{box-shadow:var(--shadow)}.nb-btn.p{background:var(--accent);color:#fff;border-color:var(--accent)}.nb-btn[disabled]{opacity:.5;cursor:not-allowed}
.nb-grid{flex:1;min-height:0;display:grid;grid-template-columns:290px minmax(0,1fr) 310px;gap:12px}
.nb-col{background:var(--bg2);border-radius:18px;box-shadow:var(--shadow);display:flex;flex-direction:column;min-height:0;overflow:hidden}
.nb-col>h3{margin:0;padding:14px 16px 8px;font:700 16px var(--font-body);display:flex;align-items:center;gap:8px}
.nb-scroll{flex:1;min-height:0;overflow-y:auto;padding:6px 12px 12px}
.nb-src{display:flex;align-items:flex-start;gap:8px;padding:9px 8px;border-radius:12px;font-size:14px}.nb-src:hover{background:var(--bg3)}
.nb-src .t{flex:1;min-width:0;word-break:break-word}.nb-src small{display:block;color:var(--text-muted)}
.nb-x{border:0;background:none;cursor:pointer;color:var(--text-muted);font-size:15px}
.nb-msgs{flex:1;min-height:0;overflow-y:auto;padding:16px 20px}
.nb-m{max-width:88%;margin:0 0 14px;padding:11px 15px;border-radius:16px;line-height:1.6;font-size:15px;word-break:break-word}
.nb-m.u{margin-left:auto;background:var(--accent);color:#fff;border-bottom-right-radius:4px}.nb-m.a{background:var(--bg3);border-bottom-left-radius:4px}
.nb-m p{margin:0 0 8px}.nb-m ul,.nb-m ol{margin:4px 0 8px;padding-left:22px}.nb-m h4{margin:8px 0 4px}.nb-m code{background:rgba(0,0,0,.08);padding:1px 5px;border-radius:5px}
.nb-chips{display:flex;flex-wrap:wrap;gap:8px;padding:0 20px 10px}
.nb-chip{border:1px solid var(--border);background:var(--bg2);padding:7px 12px;border-radius:999px;font-size:13px;cursor:pointer;color:var(--text)}.nb-chip:hover{background:var(--bg3)}
.nb-inp{display:flex;gap:8px;margin:0 16px 14px;padding:8px 8px 8px 16px;border:1px solid var(--border);border-radius:999px;background:var(--bg2)}
.nb-inp input{flex:1;border:0;outline:0;background:none;font:15px var(--font-body);color:var(--text);min-width:0}
.nb-tools{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:6px 12px}
.nb-tool{display:flex;align-items:center;gap:8px;padding:11px 10px;border:1px solid var(--border);border-radius:14px;background:var(--bg2);cursor:pointer;font:600 13px var(--font-body);text-align:left;color:var(--text)}
.nb-tool:hover{background:var(--bg3)}.nb-tool[disabled]{opacity:.5}
.nb-art{display:flex;align-items:center;gap:8px;padding:9px 8px;border-radius:12px;cursor:pointer;font-size:14px}.nb-art:hover{background:var(--bg3)}
.nb-card{background:var(--bg2);border:1px solid var(--border);border-radius:16px;padding:16px;cursor:pointer;box-shadow:var(--shadow)}.nb-card:hover{box-shadow:var(--shadow-lg)}
.nb-list{overflow-y:auto;flex:1;display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:14px;align-content:start;padding:6px}
.nb-ov{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:400;display:flex;align-items:center;justify-content:center;padding:14px}
.nb-box{background:var(--bg2);color:var(--text);border-radius:20px;max-width:760px;width:100%;max-height:92vh;overflow:auto;padding:20px;box-shadow:var(--shadow-lg)}
.nb-box h2{margin:0 0 12px;font:700 20px var(--font-display)}
.nb-tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}.nb-tabs button{border:1px solid var(--border);background:var(--bg3);border-radius:999px;padding:7px 12px;font:600 13px var(--font-body);cursor:pointer;color:var(--text)}.nb-tabs button.on{background:var(--accent);color:#fff}
.nb-box input[type=text],.nb-box textarea,.nb-box select{width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid var(--border);border-radius:12px;font:14px var(--font-body);background:var(--bg);color:var(--text);margin:4px 0 8px}
.nb-box textarea{min-height:130px;resize:vertical}
.nb-note{font-size:12px;color:var(--text-muted);line-height:1.5}
.nb-fc{height:230px;perspective:900px;margin:10px 0}.nb-fc>div{position:relative;width:100%;height:100%;transition:transform .5s;transform-style:preserve-3d;cursor:pointer}
.nb-fc.f>div{transform:rotateY(180deg)}.nb-fc .s{position:absolute;inset:0;backface-visibility:hidden;display:flex;align-items:center;justify-content:center;text-align:center;padding:22px;border-radius:18px;background:var(--bg3);font-size:18px;line-height:1.5;overflow:auto}
.nb-fc .s.b{transform:rotateY(180deg);background:var(--accent);color:#fff}
.nb-tree{overflow:auto;border:1px solid var(--border);border-radius:14px;background:var(--bg);max-height:62vh}
.nb-q{display:flex;gap:8px;padding:8px;border-bottom:1px solid var(--border);font-size:14px}.nb-q .t{flex:1}.nb-q small{color:var(--text-muted);display:block}
.nb-sp{display:inline-block;width:14px;height:14px;border:2px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:nbsp .8s linear infinite;vertical-align:-2px}@keyframes nbsp{to{transform:rotate(360deg)}}
.nb-mob{display:none}
@media(max-width:900px){.nb-grid{grid-template-columns:1fr}.nb-col{display:none}.nb-col.show{display:flex}.nb-mob{display:flex;gap:6px;margin-bottom:8px}.nb-mob button{flex:1}.nb-m{max-width:96%}}
`;
    document.head.appendChild(st);
  }
  function mdLite(t) {
    let h = esc(t).replace(/```([\s\S]*?)```/g, '<pre>$1</pre>').replace(/`([^`\n]+)`/g, '<code>$1</code>').replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>')
      .replace(/\[(https?:\/\/[^\s\]]+)\]/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
      .replace(/(^|\s)(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
    const out = []; let list = null;
    for (const line of h.split('\n')) {
      let m;
      if ((m = line.match(/^\s*[-*•]\s+(.*)/))) { if (list !== 'ul') { if (list) out.push('</' + list + '>'); out.push('<ul>'); list = 'ul'; } out.push('<li>' + m[1] + '</li>'); }
      else if ((m = line.match(/^\s*\d+[.)]\s+(.*)/))) { if (list !== 'ol') { if (list) out.push('</' + list + '>'); out.push('<ol>'); list = 'ol'; } out.push('<li>' + m[1] + '</li>'); }
      else { if (list) { out.push('</' + list + '>'); list = null; } if ((m = line.match(/^#{1,4}\s+(.*)/))) out.push('<h4>' + m[1] + '</h4>'); else if (line.trim()) out.push('<p>' + line + '</p>'); }
    }
    if (list) out.push('</' + list + '>');
    return out.join('');
  }
  const showPane = p => { pane = p; document.querySelectorAll('#nb-screen .nb-col').forEach(c => c.classList.toggle('show', c.dataset.p === p)); document.querySelectorAll('#nb-screen .nb-mob button').forEach(b => b.classList.toggle('p', b.dataset.p === p)); };

  function open() { css(); loadDb(); cur = null; showScreen('nb-screen'); renderList(); }
  function renderList() {
    const nbs = loadDb().nbs, rs = rounds();
    $('nb-screen').innerHTML = `
      <div class="nb-top"><h1>📓 Sổ nghiên cứu</h1>
        ${rs.length ? `<button class="nb-btn" onclick="NB.fromRound()">🎮 Nghiên cứu ván vừa chơi</button>` : ''}
        <button class="nb-btn p" onclick="NB.create()">＋ Tạo sổ mới</button></div>
      <div class="nb-list">
        <div class="nb-card" onclick="NB.create()" style="display:flex;align-items:center;justify-content:center;min-height:130px;font-size:40px;color:var(--accent)">＋</div>
        ${nbs.map(n => `<div class="nb-card" onclick="NB.openNb('${n.id}')"><div style="font-size:28px">📔</div><div style="font:700 17px var(--font-body);margin:6px 0">${esc(n.title)}</div>
          <div class="nb-note">${n.sources.length} nguồn · ${n.arts.length} mục Studio<br>${new Date(n.ts).toLocaleDateString('vi-VN')}</div>
          <button class="nb-x" style="float:right;margin-top:-20px" title="Xoá sổ" onclick="event.stopPropagation();NB.del('${n.id}')">🗑</button></div>`).join('')}
        ${!nbs.length ? `<div class="nb-note" style="grid-column:1/-1;padding:10px">Bấm ＋ để tạo sổ. Bạn có thể nạp ván vừa chơi, tài liệu Word/PDF, link YouTube hoặc bài Wikipedia, rồi hỏi AI, tạo flashcard, sơ đồ cây tri thức và bài thi.</div>` : ''}
      </div>
      <div class="nb-note" style="padding:8px 12px">Dữ liệu chỉ lưu trong trình duyệt này. Nội dung nguồn được gửi cho Gemini để phân tích. AI có thể mắc sai sót — hãy đối chiếu với tài liệu gốc.</div>`;
  }
  function del(id) { if (!confirm('Xoá sổ này cùng toàn bộ nguồn và kết quả AI?')) return; db.nbs = db.nbs.filter(n => n.id !== id); saveDb(); renderList(); }
  function create() { askModal('Tạo sổ nghiên cứu', 'Tên sổ (ví dụ: Quang hợp, Chiến tranh Việt Nam…)', t => { const nb = newNb(t); openNb(nb.id); addDialog(); }); }

  function openNb(id) {
    cur = nbOf(id); if (!cur) return renderList();
    showScreen('nb-screen'); const nb = cur;
    const chips = nb.sources.length ? ['Tóm tắt các ý chính', 'Giải thích dễ hiểu cho học sinh lớp 11', 'Đưa ra 5 câu hỏi dễ nhầm lẫn', nb.sources.some(s => s.kind === 'round') ? 'Giải thích chi tiết các câu tôi làm sai' : 'Các mốc/số liệu quan trọng cần nhớ'] : [];
    $('nb-screen').innerHTML = `
      <div class="nb-top"><button class="nb-btn" onclick="NB.open()">← Sổ của tôi</button><h1 title="Đổi tên" onclick="NB.rename()" style="cursor:text">${esc(nb.title)}</h1></div>
      <div class="nb-mob"><button class="nb-btn" data-p="src" onclick="NB.pane('src')">Nguồn</button><button class="nb-btn p" data-p="chat" onclick="NB.pane('chat')">Hỏi đáp</button><button class="nb-btn" data-p="studio" onclick="NB.pane('studio')">Studio</button></div>
      <div class="nb-grid">
        <div class="nb-col" data-p="src"><h3>Nguồn <span style="flex:1"></span><button class="nb-btn p" onclick="NB.addDialog()">＋</button></h3>
          <div class="nb-scroll">${nb.sources.length ? nb.sources.map(s => `<div class="nb-src"><input type="checkbox" ${s.on ? 'checked' : ''} onchange="NB.toggleSrc('${s.id}')"><div class="t">${{ round: '🎮', file: '📄', yt: '▶️', text: '📋', wiki: '🌐' }[s.kind] || '📄'} ${esc(s.name)}<small>${Math.round(s.text.length / 100) / 10}k ký tự</small></div><button class="nb-x" onclick="NB.delSrc('${s.id}')">✕</button></div>`).join('') : '<div class="nb-note" style="padding:10px">Chưa có nguồn. Bấm ＋ để thêm ván đã chơi, tệp, link YouTube, Wikipedia…</div>'}</div></div>
        <div class="nb-col show" data-p="chat"><h3>Hỏi đáp</h3>
          <div class="nb-msgs" id="nb-msgs">${nb.chat.map(m => `<div class="nb-m ${m.r}">${m.r === 'a' ? mdLite(m.t) : esc(m.t)}</div>`).join('') || `<div class="nb-note" style="text-align:center;padding:40px 10px">${nb.sources.length ? 'Hỏi bất cứ điều gì về nguồn của bạn.' : 'Thêm nguồn ở cột bên trái để bắt đầu.'}</div>`}</div>
          <div class="nb-chips">${chips.map(c => `<button class="nb-chip" onclick="NB.ask(this.textContent)">${esc(c)}</button>`).join('')}</div>
          <div class="nb-inp"><input id="nb-in" placeholder="Đặt câu hỏi về nguồn…  (${nb.sources.filter(s => s.on).length} nguồn)" onkeydown="if(event.key==='Enter')NB.ask()"><button class="nb-btn p" onclick="NB.ask()">Gửi</button></div></div>
        <div class="nb-col" data-p="studio"><h3>Studio</h3>
          <div class="nb-tools">
            ${[['summary', '📝', 'Tóm tắt'], ['flash', '🗂️', 'Flashcard'], ['mind', '🧠', 'Sơ đồ tư duy'], ['tree', '🌳', 'Cây tri thức'], ['kd', '⚡', 'Thi Khởi Động'], ['vd', '🏁', 'Thi Về Đích'], ['xp', '🚀', 'Thi Xuất Phát'], ['links', '🔗', 'Tìm tài liệu']].map(t => `<button class="nb-tool" onclick="NB.tool('${t[0]}')">${t[1]} ${t[2]}</button>`).join('')}
            <button class="nb-tool" disabled title="Chưa có luật chơi Vinh Quang trong web">🏆 Vinh Quang (sắp có)</button>
          </div>
          <h3 style="font-size:14px;padding-top:14px">Đã tạo</h3>
          <div class="nb-scroll">${nb.arts.length ? nb.arts.map(a => `<div class="nb-art" onclick="NB.openArt('${a.id}')"><span>${a.icon}</span><span style="flex:1;min-width:0">${esc(a.title)}<br><small class="nb-note">${new Date(a.ts).toLocaleString('vi-VN')}</small></span><button class="nb-x" onclick="event.stopPropagation();NB.delArt('${a.id}')">✕</button></div>`).join('') : '<div class="nb-note" style="padding:8px">Kết quả AI tạo ra sẽ hiện ở đây.</div>'}</div></div>
      </div>`;
    showPane(pane === 'src' || pane === 'studio' ? pane : 'chat');
    const m = $('nb-msgs'); if (m) m.scrollTop = m.scrollHeight;
  }
  function rename() { askModal('Đổi tên sổ', 'Tên mới', t => { cur.title = t; saveDb(); openNb(cur.id); }, cur.title); }
  function toggleSrc(id) { const s = cur.sources.find(x => x.id === id); s.on = !s.on; saveDb(); openNb(cur.id); }
  function delSrc(id) { cur.sources = cur.sources.filter(x => x.id !== id); saveDb(); openNb(cur.id); }
  function delArt(id) { cur.arts = cur.arts.filter(x => x.id !== id); saveDb(); openNb(cur.id); }

  // ---------- hộp thoại ----------
  function modal(html) { closeModal(); const d = document.createElement('div'); d.className = 'nb-ov'; d.id = 'nb-ov'; d.innerHTML = `<div class="nb-box">${html}</div>`; d.addEventListener('mousedown', e => { if (e.target === d) closeModal(); }); document.body.appendChild(d); return d; }
  function closeModal() { const d = $('nb-ov'); if (d) d.remove(); }
  function askModal(title, label, cb, val) {
    modal(`<h2>${esc(title)}</h2><input type="text" id="nb-ask" placeholder="${esc(label)}" value="${esc(val || '')}"><div style="text-align:right"><button class="nb-btn" onclick="NB.closeModal()">Huỷ</button> <button class="nb-btn p" id="nb-ask-ok">OK</button></div>`);
    const go = () => { const v = $('nb-ask').value.trim(); if (!v) return; closeModal(); cb(v); };
    $('nb-ask-ok').onclick = go; $('nb-ask').onkeydown = e => { if (e.key === 'Enter') go(); }; $('nb-ask').focus();
  }
  let addTab = 'file';
  function addDialog(tab) {
    if (tab) addTab = tab; if (!cur) return;
    const rs = rounds();
    const T = [['file', '📄 Tệp'], ['yt', '▶️ YouTube'], ['text', '📋 Dán văn bản'], ['wiki', '🌐 Wikipedia'], ['round', '🎮 Ván đã chơi']];
    let body = '';
    if (addTab === 'file') body = `<input type="file" id="nb-f" multiple accept=".docx,.pdf,.txt,.md"><div class="nb-note">Hỗ trợ Word (.docx), PDF có chữ, TXT. PDF dạng ảnh scan chưa đọc được. Giữ tối đa ~${MAX_SRC_CHARS / 1000}k ký tự mỗi nguồn.</div><button class="nb-btn p" onclick="NB.addFile()">Thêm</button>`;
    if (addTab === 'yt') body = `<input type="text" id="nb-yt" placeholder="https://www.youtube.com/watch?v=…"><div class="nb-note">Gemini sẽ xem video công khai và ghi lại nội dung. Có thể không được với video dài/riêng tư/không có phụ đề; khi đó hãy dán bản chép lời vào mục "Dán văn bản".</div><button class="nb-btn p" onclick="NB.addYt()">Thêm</button>`;
    if (addTab === 'text') body = `<input type="text" id="nb-tn" placeholder="Tên nguồn (tuỳ chọn)"><textarea id="nb-tt" placeholder="Dán nội dung bài học, ghi chú…"></textarea><button class="nb-btn p" onclick="NB.addText()">Thêm</button>`;
    if (addTab === 'wiki') body = `<div style="display:flex;gap:6px"><input type="text" id="nb-wq" placeholder="Từ khoá (vd: Quang hợp)" onkeydown="if(event.key==='Enter')NB.wikiFind()"><button class="nb-btn p" onclick="NB.wikiFind()" style="height:40px;margin-top:4px">Tìm</button></div><div id="nb-wr"></div>`;
    if (addTab === 'round') body = rs.length ? rs.map((r, i) => `<div class="nb-art" onclick="NB.addRound(${i})">🎮 <span style="flex:1">${MODE_NAME[r.mode] || r.mode} · ${new Date(r.ts).toLocaleString('vi-VN')}<br><small class="nb-note">${r.items.length} câu · đúng ${r.items.filter(x => x.ok).length}</small></span></div>`).join('') : '<div class="nb-note">Chưa có ván nào được lưu. Hãy chơi Khởi Động hoặc Về Đích trước.</div>';
    modal(`<h2>Thêm nguồn</h2><div class="nb-tabs">${T.map(t => `<button class="${t[0] === addTab ? 'on' : ''}" onclick="NB.addDialog('${t[0]}')">${t[1]}</button>`).join('')}</div>${body}<div id="nb-st" class="nb-note" style="margin-top:8px"></div>`);
  }
  const st = (m, spin) => { const e = $('nb-st'); if (e) e.innerHTML = (spin ? '<span class="nb-sp"></span> ' : '') + esc(m); };
  async function addFile() {
    const fs = Array.from(($('nb-f') || {}).files || []); if (!fs.length) return st('Hãy chọn tệp.');
    for (const f of fs) { try { st('Đang đọc ' + f.name + '…', 1); const t = await readFile(f); addSource(cur, { kind: 'file', name: f.name, text: t }); } catch (e) { st('Lỗi: ' + e.message); return; } }
    closeModal(); openNb(cur.id);
  }
  async function addYt() {
    const u = ($('nb-yt') || {}).value || ''; const id = ytId(u); if (!id) return st('Link YouTube chưa đúng.');
    try {
      st('Gemini đang xem video… (có thể mất 30–60 giây)', 1);
      const url = 'https://www.youtube.com/watch?v=' + id;
      const t = await gem([{ fileData: { fileUri: url } }, { text: 'Hãy ghi lại ĐẦY ĐỦ nội dung của video này bằng tiếng Việt, theo từng phần có tiêu đề: các khái niệm, số liệu, ví dụ, kết luận. Không bịa; nếu không xem được video, chỉ trả lời đúng cụm: KHONG_XEM_DUOC' }], { maxTokens: 8192, temp: 0.1 });
      if (/KHONG_XEM_DUOC/.test(t) || t.trim().length < 80) throw new Error('Gemini không xem được video này.');
      addSource(cur, { kind: 'yt', name: 'YouTube ' + id, url, text: t }); closeModal(); openNb(cur.id);
    } catch (e) { st('Không thêm được: ' + e.message + ' → hãy dán bản chép lời ở mục "Dán văn bản".'); }
  }
  function addText() { const t = ($('nb-tt') || {}).value || '', n = ($('nb-tn') || {}).value || 'Văn bản dán vào'; if (addSource(cur, { kind: 'text', name: n, text: t })) { closeModal(); openNb(cur.id); } }
  async function wikiFind() {
    const q = ($('nb-wq') || {}).value || ''; if (!q.trim()) return; const box = $('nb-wr'); box.innerHTML = '<span class="nb-sp"></span>';
    try { const r = await wikiSearch(q); box.innerHTML = r.length ? r.map((x, i) => `<div class="nb-art" onclick="NB.addWiki(${i})"><span>🌐</span><span style="flex:1"><b>${esc(x.title)}</b><br><small class="nb-note">${esc(x.snippet)}</small></span></div>`).join('') : 'Không thấy kết quả.'; window._nbW = r; }
    catch (e) { box.textContent = 'Lỗi tìm Wikipedia: ' + e.message; }
  }
  async function addWiki(i) {
    const w = (window._nbW || [])[i]; if (!w) return; st('Đang tải bài Wikipedia…', 1);
    try { const t = await wikiText(w.title); if (addSource(cur, { kind: 'wiki', name: 'Wikipedia: ' + w.title, url: w.url, text: t })) { closeModal(); openNb(cur.id); } } catch (e) { st('Lỗi: ' + e.message); }
  }
  function addRound(i) { const r = rounds()[i]; if (addSource(cur, { kind: 'round', name: `Ván ${MODE_NAME[r.mode] || r.mode} ${new Date(r.ts).toLocaleDateString('vi-VN')}`, text: roundToText(r) })) { closeModal(); openNb(cur.id); } }
  function fromRound() {
    const rs = rounds(); if (!rs.length) return toast('Chưa có ván nào được lưu — hãy chơi một ván trước.');
    const r = rs[0]; const nb = newNb(`Nghiên cứu ${MODE_NAME[r.mode] || r.mode} ${new Date(r.ts).toLocaleDateString('vi-VN')}`);
    addSource(nb, { kind: 'round', name: `Ván ${MODE_NAME[r.mode] || r.mode} ${new Date(r.ts).toLocaleString('vi-VN')}`, text: roundToText(r) });
    css(); openNb(nb.id);
  }

  // ---------- hỏi đáp ----------
  async function ask(text) {
    const inp = $('nb-in'); const q = (text || (inp && inp.value) || '').trim(); if (!q || busy) return;
    if (!cur.sources.some(s => s.on)) return toast('Hãy thêm ít nhất một nguồn (và bật dấu ✓).');
    busy = true; if (inp) inp.value = '';
    const nb = cur; nb.chat.push({ r: 'u', t: q }); openNb(nb.id);
    const box = $('nb-msgs'); box.insertAdjacentHTML('beforeend', '<div class="nb-m a" id="nb-wait"><span class="nb-sp"></span> Đang đọc nguồn…</div>'); box.scrollTop = box.scrollHeight;
    try {
      const hist = nb.chat.slice(-9, -1).map(m => (m.r === 'u' ? 'Học sinh: ' : 'Trợ lý: ') + m.t.slice(0, 600)).join('\n');
      const prompt = `Bạn là gia sư thân thiện cho học sinh THPT Việt Nam đang ôn thi Đường lên đỉnh Olympia. Trả lời bằng tiếng Việt, rõ ràng, ngắn gọn, dùng gạch đầu dòng khi cần.
QUY TẮC: Ưu tiên dựa trên NGUỒN bên dưới và ghi trích dẫn dạng [Nguồn n] sau ý tương ứng. Nếu nguồn không có thông tin, nói rõ "Nguồn không đề cập", rồi mới bổ sung kiến thức chung và đánh dấu "(ngoài tài liệu)". Không bịa số liệu, ngày tháng, đường link.
${ctx({ sources: nb.sources.filter(s => s.on) })}

LỊCH SỬ:\n${hist}

CÂU HỎI: ${q}`;
      const ans = await gem(prompt, { maxTokens: 3000, temp: 0.3 });
      nb.chat.push({ r: 'a', t: ans || '(Không có phản hồi)' });
    } catch (e) { nb.chat.push({ r: 'a', t: '⚠️ ' + e.message }); }
    busy = false; saveDb(); if (cur && cur.id === nb.id) openNb(nb.id);
  }

  // ---------- Studio ----------
  const QMODE = { kd: ['khoi_dong', 'Khởi Động', 12], vd: ['ve_dich', 'Về Đích', 10], xp: ['xuat_phat', 'Xuất Phát', 10] };
  function tool(t) {
    if (!cur.sources.some(s => s.on)) return toast('Hãy thêm nguồn trước.');
    if (QMODE[t]) return quizDialog(t);
    const nb = cur;
    run(t === 'summary' ? 'Đang tóm tắt…' : 'Đang tạo…', async () => {
      const C = ctx({ sources: nb.sources.filter(s => s.on) });
      if (t === 'summary') { const x = await gem(`Tóm tắt tài liệu sau cho học sinh THPT bằng tiếng Việt: (1) 5–8 ý chính, (2) thuật ngữ/số liệu quan trọng, (3) 3 điểm dễ nhầm. Ghi [Nguồn n] khi trích. Chỉ dùng nội dung trong nguồn.\n\n${C}`, { maxTokens: 3000 }); return art(nb, 'summary', '📝', 'Tóm tắt', x); }
      if (t === 'flash') { const j = parseJson(await gem(`Tạo 15 flashcard ôn tập từ tài liệu. Chỉ dùng nội dung trong nguồn. Trả về DUY NHẤT một mảng JSON: [{"front":"câu hỏi/khái niệm","back":"đáp án ngắn gọn"}]\n\n${C}`, { maxTokens: 6000 })); return art(nb, 'flash', '🗂️', 'Flashcard', j.filter(x => x.front && x.back)); }
      if (t === 'mind' || t === 'tree') {
        const kind = t === 'mind' ? 'sơ đồ tư duy (nhánh chính là các chủ đề lớn, nhánh con là ý chi tiết)' : 'cây tri thức (phân cấp từ khái niệm tổng quát đến cụ thể; mỗi nút có định nghĩa ngắn)';
        const j = parseJson(await gem(`Xây dựng ${kind} từ tài liệu. Chỉ dùng nội dung trong nguồn. Tối đa 3 cấp, mỗi nút tối đa 7 con, tên nút ≤ 8 từ. Trả về DUY NHẤT một đối tượng JSON: {"t":"tên gốc","d":"mô tả ngắn","c":[{"t":"...","d":"...","c":[...]}]}\n\n${C}`, { maxTokens: 6000 }));
        return art(nb, t, t === 'mind' ? '🧠' : '🌳', t === 'mind' ? 'Sơ đồ tư duy' : 'Cây tri thức', j);
      }
      if (t === 'links') return findLinks(nb, C);
    });
  }
  async function run(msg, fn) {
    if (busy) return toast('Đang xử lý, vui lòng đợi…'); busy = true;
    const ov = modal(`<div style="text-align:center;padding:30px"><span class="nb-sp" style="width:28px;height:28px"></span><div style="margin-top:12px">${esc(msg)}</div></div>`);
    try { const a = await fn(); busy = false; closeModal(); if (a) { openNb(cur.id); openArt(a.id); } } catch (e) { busy = false; closeModal(); toast('⚠️ ' + e.message); }
  }
  function art(nb, type, icon, title, data) { const a = { id: rid(), type, icon, title: title + ' · ' + new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }), ts: Date.now(), data }; nb.arts.unshift(a); saveDb(); return a; }
  async function findLinks(nb, C) {
    const terms = parseJson(await gem(`Từ tài liệu sau, nêu 4 cụm từ khoá tìm kiếm tiếng Việt (2–4 từ) đại diện cho nội dung chính. Trả về DUY NHẤT mảng JSON các chuỗi.\n\n${C.slice(0, 20000)}`, { maxTokens: 400, temp: 0 })).filter(x => typeof x === 'string').slice(0, 4);
    const items = [];
    for (const t of terms) {
      let w = []; try { w = await wikiSearch(t, 3); } catch (e) {}
      items.push({ term: t, wiki: w, g: 'https://www.google.com/search?q=' + encodeURIComponent(t), sc: 'https://scholar.google.com/scholar?q=' + encodeURIComponent(t), yt: 'https://www.youtube.com/results?search_query=' + encodeURIComponent(t) });
    }
    return art(nb, 'links', '🔗', 'Tài liệu tham khảo', items);
  }
  function quizDialog(t) {
    const [mode, name, def] = QMODE[t];
    modal(`<h2>Tạo bài thi ${name}</h2>
      <label class="nb-note">Số câu</label><input type="text" id="nb-qn" value="${def}">
      <label class="nb-note">Độ khó</label><select id="nb-qd"><option>Cơ bản</option><option selected>Trung bình</option><option>Khó (kiểu Olympia)</option></select>
      <label class="nb-note"><input type="checkbox" id="nb-qw" checked> Bổ sung kiến thức từ Wikipedia (khi tài liệu chưa đủ)</label>
      <div class="nb-note" style="margin:8px 0">Câu hỏi được ưu tiên lấy từ tài liệu của bạn. Đáp án ngắn (1–5 từ) để hệ thống chấm được. Bạn sẽ xem lại và xoá câu sai trước khi chơi.</div>
      <div style="text-align:right"><button class="nb-btn" onclick="NB.closeModal()">Huỷ</button> <button class="nb-btn p" onclick="NB.genQuiz('${t}')">Tạo bài thi</button></div>`);
  }
  async function genQuiz(t) {
    const [mode, name] = QMODE[t]; const n = Math.max(3, Math.min(30, parseInt($('nb-qn').value, 10) || 10)), diff = $('nb-qd').value, useW = $('nb-qw').checked;
    const nb = cur;
    run('Đang soạn câu hỏi…', async () => {
      let C = ctx({ sources: nb.sources.filter(s => s.on) }, 70000);
      if (useW) { try { const w = await wikiSearch(nb.title, 2); for (const x of w) { const tx = await wikiText(x.title); if (tx) C += `\n\n### [Wikipedia] ${x.title} (${x.url})\n${tx.slice(0, 9000)}`; } } catch (e) {} }
      const fmt = mode === 've_dich' ? '{"q":"câu hỏi","a":"đáp án ngắn","pts":20 hoặc 30,"src":"Nguồn n / Wikipedia"}  (pts=20: vận dụng; pts=30: khó, suy luận)' : '{"q":"câu hỏi","a":"đáp án ngắn","src":"Nguồn n / Wikipedia"}';
      const j = parseJson(await gem(`Bạn là người ra đề Đường lên đỉnh Olympia. Hãy ra đúng ${n} câu hỏi phần ${name}, độ khó: ${diff}, tiếng Việt.
QUY TẮC: (1) ƯU TIÊN lấy kiến thức từ các "Nguồn" của học sinh; chỉ dùng "Wikipedia" khi nguồn thiếu. (2) Mỗi câu có MỘT đáp án duy nhất, ngắn (1–5 từ, hoặc con số), không mơ hồ. (3) Câu hỏi tự đủ nghĩa, không viết "theo tài liệu". (4) Không bịa; nếu không chắc thì bỏ câu đó. (5) Không trùng ý.
Trả về DUY NHẤT mảng JSON, mỗi phần tử: ${fmt}\n\n${C}`, { maxTokens: 8000, temp: 0.4 }));
      const items = j.filter(x => x.q && x.a).slice(0, n).map(x => ({ q: String(x.q), a: String(x.a), src: String(x.src || ''), pts: mode === 've_dich' ? (Number(x.pts) === 30 ? 30 : 20) : undefined }));
      if (!items.length) throw new Error('AI chưa tạo được câu hỏi hợp lệ, hãy thử lại.');
      return art(nb, 'quiz', '🎯', 'Bài thi ' + name, { mode, items });
    });
  }

  // ---------- xem kết quả ----------
  function openArt(id) {
    const a = cur.arts.find(x => x.id === id); if (!a) return;
    if (a.type === 'summary') modal(`<h2>${a.icon} ${esc(a.title)}</h2><div>${mdLite(a.data)}</div>${closeBtn()}`);
    else if (a.type === 'flash') { window._fc = { a, i: 0 }; fcRender(); }
    else if (a.type === 'mind' || a.type === 'tree') { modal(`<h2>${a.icon} ${esc(a.title)}</h2><div class="nb-tree" id="nb-tr"></div><div id="nb-trd" class="nb-note" style="margin-top:8px;font-size:14px">Bấm vào một nút để xem mô tả hoặc thu gọn/mở rộng.</div>${closeBtn()}`); treeDraw(a.data); }
    else if (a.type === 'links') modal(`<h2>${a.icon} ${esc(a.title)}</h2><div class="nb-note">Kết quả Wikipedia là bài thật; các nút Google/Scholar/YouTube mở trang tìm kiếm cho từ khoá đó.</div>${a.data.map(it => `<div style="margin:12px 0"><b>${esc(it.term)}</b><br>${it.wiki.map(w => `<div>🌐 <a href="${w.url}" target="_blank" rel="noopener">${esc(w.title)}</a> <span class="nb-note">— ${esc(w.snippet.slice(0, 110))}…</span></div>`).join('')}<a href="${it.g}" target="_blank" rel="noopener">🔍 Google</a> · <a href="${it.sc}" target="_blank" rel="noopener">🎓 Scholar</a> · <a href="${it.yt}" target="_blank" rel="noopener">▶️ YouTube</a></div>`).join('')}${closeBtn()}`);
    else if (a.type === 'quiz') quizView(a);
  }
  const closeBtn = () => `<div style="text-align:right;margin-top:12px"><button class="nb-btn" onclick="NB.closeModal()">Đóng</button></div>`;
  function fcRender(flip) {
    const { a, i } = window._fc, c = a.data[i];
    modal(`<h2>${a.icon} ${esc(a.title)} <small class="nb-note">${i + 1}/${a.data.length}</small></h2><div class="nb-fc ${flip ? 'f' : ''}" onclick="this.classList.toggle('f')"><div><div class="s">${esc(c.front)}</div><div class="s b">${esc(c.back)}</div></div></div>
      <div style="display:flex;justify-content:space-between"><button class="nb-btn" onclick="NB.fc(-1)">←</button><button class="nb-btn" onclick="NB.closeModal()">Đóng</button><button class="nb-btn" onclick="NB.fc(1)">→</button></div>`);
  }
  function fc(d) { const f = window._fc; f.i = (f.i + d + f.a.data.length) % f.a.data.length; fcRender(); }

  // cây: bố cục trái → phải, bấm để thu gọn
  function treeDraw(root) {
    const open = new Set(); const NW = 170, NH = 34, GX = 46, GY = 10; let sel = null;
    (function init(n, d) { n._k = rid(); if (d < 1) open.add(n._k); (n.c || []).forEach(x => init(x, d + 1)); })(root, 0);
    function draw() {
      let y = 0; const nodes = [], edges = [];
      (function lay(n, d) { const kids = open.has(n._k) ? (n.c || []) : []; let y0;
        if (!kids.length) { y0 = y; y += NH + GY; } else { const ys = kids.map(k => lay(k, d + 1)); y0 = (ys[0] + ys[ys.length - 1]) / 2; kids.forEach((k, i) => edges.push([d, y0, d + 1, ys[i]])); }
        nodes.push({ n, d, y: y0 }); return y0; })(root, 0);
      const W = (Math.max(...nodes.map(x => x.d)) + 1) * (NW + GX), H = Math.max(y, 60);
      const acc = getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#0A2E6B';
      $('nb-tr').innerHTML = `<svg width="${W + 20}" height="${H + 10}" style="display:block;margin:6px">` +
        edges.map(e => { const x1 = e[0] * (NW + GX) + NW, y1 = e[1] + NH / 2, x2 = e[2] * (NW + GX), y2 = e[3] + NH / 2; return `<path d="M${x1} ${y1}C${x1 + GX / 2} ${y1},${x2 - GX / 2} ${y2},${x2} ${y2}" fill="none" stroke="#9aa" stroke-width="1.5"/>`; }).join('') +
        nodes.map((o, i) => { const x = o.d * (NW + GX), has = (o.n.c || []).length; const t = String(o.n.t || ''); return `<g data-i="${i}" style="cursor:pointer"><rect x="${x}" y="${o.y}" width="${NW}" height="${NH}" rx="10" fill="${o.d === 0 ? acc : (sel === o.n._k ? '#fde68a' : '#fff')}" stroke="${acc}" stroke-width="1.5"/><text x="${x + 10}" y="${o.y + 21}" font-size="13" fill="${o.d === 0 ? '#fff' : '#222'}" font-family="Barlow,sans-serif">${esc(t.length > 22 ? t.slice(0, 21) + '…' : t)}${has ? (open.has(o.n._k) ? ' −' : ' +') : ''}</text><title>${esc(t)}</title></g>`; }).join('') + '</svg>';
      $('nb-tr').querySelectorAll('g').forEach(g => g.onclick = () => { const o = nodes[+g.dataset.i]; sel = o.n._k; if ((o.n.c || []).length) { open.has(o.n._k) ? open.delete(o.n._k) : open.add(o.n._k); } $('nb-trd').innerHTML = `<b>${esc(o.n.t)}</b>${o.n.d ? ' — ' + esc(o.n.d) : ''}`; draw(); });
    }
    draw();
  }

  // ---------- xem trước + chơi bài thi ----------
  function quizView(a, keep) {
    const d = a.data;
    modal(`<h2>${a.icon} ${esc(a.title)} <small class="nb-note">${d.items.length} câu</small></h2>
      <div class="nb-note" style="margin-bottom:8px">AI có thể sai. Hãy đối chiếu đáp án với tài liệu và xoá câu không ổn trước khi chơi. Ván chơi bằng đề này KHÔNG tính vào bảng xếp hạng và dữ liệu nghiên cứu.</div>
      ${d.items.map((x, i) => `<div class="nb-q"><div class="t">${i + 1}. ${esc(x.q)}${x.pts ? ` <b>(${x.pts}đ)</b>` : ''}<small>Đáp án: <b>${esc(x.a)}</b>${x.src ? ' · ' + esc(x.src) : ''}</small></div><button class="nb-x" title="Xoá câu" onclick="NB.qdel('${a.id}',${i})">🗑</button></div>`).join('')}
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px"><button class="nb-btn" onclick="NB.closeModal()">Đóng</button><button class="nb-btn p" onclick="NB.play('${a.id}')">▶ Chơi ngay</button></div>`);
  }
  function qdel(id, i) { const a = cur.arts.find(x => x.id === id); a.data.items.splice(i, 1); saveDb(); quizView(a); }
  function play(id) {
    const a = cur.arts.find(x => x.id === id); if (!a || !a.data.items.length) return; closeModal();
    startGame(a.data.mode, { custom: a.data.items.map(x => ({ question: x.q, answer: x.a, points: x.pts, subject: '' })), fromNb: cur.id });
  }
  // app.js gọi hàm này thay cho loader câu hỏi từ Google Sheets
  function buildPlay(mode, items) {
    const sh = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    if (mode === 've_dich') {
      const pools = { 20: sh(items.filter(x => x.points !== 30)), 30: sh(items.filter(x => x.points === 30)) };
      return { success: true, questions: [...pools[20], ...pools[30]], pools };
    }
    return { success: true, questions: sh(items).map(x => ({ question: x.question, answer: x.answer, subject: '' })) };
  }
  function back(fromNb) { if (fromNb && nbOf(fromNb)) { css(); cur = nbOf(fromNb); openNb(fromNb); } else open(); }

  return { open, create, openNb, del, rename, pane: showPane, addDialog, closeModal, toggleSrc, delSrc, delArt, addFile, addYt, addText, wikiFind, addWiki, addRound, fromRound, ask, tool, genQuiz, openArt, fc, qdel, play, saveRound, buildPlay, back };
})();
