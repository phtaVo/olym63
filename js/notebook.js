// ============================================================
// NB — "Sổ nghiên cứu" v2 (kiểu NotebookLM, kính)
//  • Nguồn: ván vừa chơi · Word/PDF/TXT · HÌNH ẢNH · YouTube · văn bản · Wikipedia
//  • Hỏi đáp: chỉ gửi các ĐOẠN LIÊN QUAN (BM25) thay vì toàn bộ tài liệu → tiết kiệm lượt/token AI
//  • Nhớ ngữ cảnh: biết sổ đã tạo gì (flashcard, đề, sơ đồ…) và hội thoại trước
//  • Link bấm được, trích dẫn [Nguồn n] bấm để nhảy tới nguồn
//  • Wikipedia/tài liệu gợi ý được lọc theo độ liên quan với nội dung nguồn
//  • Hạn mức lượt AI mỗi ngày (Worker) + dùng lại kết quả đã tạo
//  Dữ liệu lưu trong trình duyệt (localStorage). Nội dung nguồn được gửi cho Gemini để phân tích.
// ============================================================
const NB = (() => {
  const MAX_SRC_CHARS = 90000, MAX_SRCS = 12, MAX_ROUNDS = 8;
  const CHAT_BUDGET = 9000, TOOL_BUDGET = 22000, FULL_IF_UNDER = 14000;
  const $ = id => document.getElementById(id);
  const uid = () => { const u = (typeof AUTH !== 'undefined' && AUTH.getCurrentUser) ? AUTH.getCurrentUser() : null; return u ? String(u.id != null ? u.id : u.username) : 'guest'; };
  const K = () => 'olym63_nb1_' + uid(), KR = () => 'olym63_nbround_' + uid(), KQ = () => 'olym63_nbq_' + uid();
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const rid = () => Math.random().toString(36).slice(2, 10);
  const toast = m => { try { showToast(m); } catch (e) { alert(m); } };
  const KIND_IC = { round: 'target', file: 'file', yt: 'youtube', text: 'text', wiki: 'globe', image: 'image' };
  const ART_IC = { summary: 'text', flash: 'cards', mind: 'mind', tree: 'tree', quiz: 'quiz', links: 'link', note: 'note' };

  let db = null, cur = null, pane = 'chat', busy = false, pend = [], col = { l: false, r: false }, _idx = {};
  const loadDb = () => { if (db) return db; try { db = JSON.parse(localStorage.getItem(K())) || { nbs: [] }; } catch (e) { db = { nbs: [] }; } return db; };
  const saveDb = () => { try { localStorage.setItem(K(), JSON.stringify(db)); return true; } catch (e) { toast('Bộ nhớ trình duyệt đầy. Hãy xóa bớt sổ, nguồn hoặc ảnh cũ.'); return false; } };
  const nbOf = id => loadDb().nbs.find(n => n.id === id);

  // ============================================================ ván vừa chơi
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
  const roundToText = r => `Ván ${MODE_NAME[r.mode] || r.mode} ngày ${new Date(r.ts).toLocaleString('vi-VN')}. Mỗi dòng: câu hỏi | đáp án đúng | học sinh trả lời | kết quả.\n` +
    r.items.map((x, i) => `${i + 1}. ${x.q} | ĐÁP ÁN: ${x.a} | HS: ${x.u || '(bỏ qua)'} | ${x.ok ? 'ĐÚNG' : 'SAI'}${x.s ? ' | môn: ' + x.s : ''}`).join('\n');

  // ============================================================ hạn mức lượt AI
  const dayKey = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  let quota = { used: 0, limit: 60 };
  async function useAi(units, kind) {
    units = units || 1;
    try {
      if (typeof AUTH !== 'undefined' && AUTH.backendReady && AUTH.backendReady() && AUTH.getCurrentUser()) {
        const r = await AUTH.apiFetch('/ai/use', { method: 'POST', body: JSON.stringify({ units, kind: kind || '' }) });
        quota = { used: r.used, limit: r.limit }; paintQuota();
        if (!r.ok) throw new Error(`Bạn đã dùng hết ${r.limit} lượt AI hôm nay. Hạn mức đặt lại vào ngày mai (giúp tránh quá tải và tốn kém).`);
        return true;
      }
    } catch (e) { if (/hết .* lượt AI/.test(e.message)) throw e; /* Worker chưa có /ai/use → dùng đếm cục bộ */ }
    let q = {}; try { q = JSON.parse(localStorage.getItem(KQ())) || {}; } catch (e) {}
    if (q.d !== dayKey()) q = { d: dayKey(), n: 0 };
    if (q.n + units > quota.limit) throw new Error(`Bạn đã dùng hết ${quota.limit} lượt AI hôm nay.`);
    q.n += units; try { localStorage.setItem(KQ(), JSON.stringify(q)); } catch (e) {}
    quota.used = q.n; paintQuota(); return true;
  }
  function paintQuota() { const e = $('nb-quota'); if (e) e.innerHTML = `Lượt AI hôm nay <i><b style="width:${Math.min(100, Math.round(quota.used / quota.limit * 100))}%"></b></i> ${quota.used}/${quota.limit}`; }

  // ============================================================ Gemini
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function gem(parts, { maxTokens = 3000, temp = 0.3 } = {}) {
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
    const s = String(txt || '').replace(/```(?:json)?/gi, '').trim();
    const i = Math.min(...['[', '{'].map(c => { const k = s.indexOf(c); return k < 0 ? 1e9 : k; }));
    const j = Math.max(s.lastIndexOf(']'), s.lastIndexOf('}'));
    if (i >= 1e9 || j < i) throw new Error('AI trả về định dạng không đọc được, hãy thử lại.');
    return JSON.parse(s.slice(i, j + 1));
  }

  // ============================================================ tìm đoạn liên quan (BM25, chạy trên trình duyệt, không tốn AI)
  const STOP = new Set('và là của có cho được một những các này đó trong với để khi thì mà như về từ tại ra vào không cũng đã sẽ rất nhiều hay hoặc nên bị do bởi nếu tôi bạn em gì nào sao thế hãy ở lại còn đang theo trên dưới giữa sau trước nhưng vì cần phải thể người việc the of and a to in is on for'.split(' '));
  const toks = s => (String(s).toLowerCase().normalize('NFC').match(/[\p{L}\p{N}]+/gu) || []);
  function feats(s) {
    const t = toks(s), f = new Map(), add = (k, w) => f.set(k, (f.get(k) || 0) + w);
    for (let i = 0; i < t.length; i++) {
      const a = t[i], sa = STOP.has(a);
      if (!sa && (a.length > 1 || /\d/.test(a))) add(a, 1);
      if (i + 1 < t.length && !sa && !STOP.has(t[i + 1])) add(a + ' ' + t[i + 1], 1.6);
    }
    return f;
  }
  function chunkText(text, size = 700) {
    const paras = String(text).split(/\n+/).map(x => x.trim()).filter(Boolean), out = []; let buf = '';
    const push = () => { if (buf.trim()) out.push(buf.trim()); buf = ''; };
    for (let p of paras) {
      while (p.length > size * 1.6) { const cut = p.lastIndexOf('. ', size) > size * .5 ? p.lastIndexOf('. ', size) + 1 : size; if (buf) push(); out.push(p.slice(0, cut).trim()); p = p.slice(cut).trim(); }
      if ((buf + ' ' + p).length > size) push(); buf += (buf ? '\n' : '') + p;
    }
    push(); return out;
  }
  function index(nb) {
    const srcs = nb.sources.filter(s => s.on), sig = srcs.map(s => s.id + ':' + s.text.length).join('|');
    if (_idx[nb.id] && _idx[nb.id].sig === sig) return _idx[nb.id];
    const chunks = [], df = new Map(); let tot = 0;
    srcs.forEach((s, si) => chunkText(s.text).forEach((tx, pos) => { const f = feats(tx); let len = 0; f.forEach(v => len += v); chunks.push({ si, pos, tx, f, len }); tot += len; f.forEach((_, k) => df.set(k, (df.get(k) || 0) + 1)); }));
    return _idx[nb.id] = { sig, chunks, df, avg: tot / Math.max(1, chunks.length), srcs };
  }
  function rank(ix, query) {
    const q = feats(query), N = ix.chunks.length, k1 = 1.4, b = .75;
    return ix.chunks.map(c => { let sc = 0; q.forEach((w, term) => { const tf = c.f.get(term); if (!tf) return; const d = ix.df.get(term) || 0; sc += Math.log(1 + (N - d + .5) / (d + .5)) * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * c.len / ix.avg)) * w; }); return { c, sc }; }).sort((a, b) => b.sc - a.sc);
  }
  const label = (ix, si) => '[Nguồn ' + (nbSrcIndex(si, ix) + 1) + ']';
  function nbSrcIndex(si, ix) { return cur.sources.indexOf(ix.srcs[si]); }
  function contextFor(nb, query, budget) {
    const ix = index(nb); if (!ix.chunks.length) return '';
    const total = ix.srcs.reduce((a, s) => a + s.text.length, 0);
    if (total <= Math.min(FULL_IF_UNDER, budget * 1.6)) return ix.srcs.map(s => `### [Nguồn ${nb.sources.indexOf(s) + 1}] ${s.name}\n${s.text}`).join('\n\n');
    const ranked = rank(ix, query), pick = new Set(), seen = new Set(); let used = 0;
    for (const r of ranked) { if (r.sc > 0 && !seen.has(r.c.si)) { seen.add(r.c.si); pick.add(r.c); used += r.c.tx.length; } }   // ít nhất 1 đoạn tốt nhất mỗi nguồn
    for (const r of ranked) { if (used >= budget) break; if (r.sc <= 0 && pick.size >= 3) break; if (!pick.has(r.c)) { pick.add(r.c); used += r.c.tx.length; } }
    if (!pick.size) ranked.slice(0, 4).forEach(r => pick.add(r.c));
    const arr = [...pick].sort((a, b) => a.si - b.si || a.pos - b.pos);
    return arr.map(c => `### ${label(ix, c.si)} ${ix.srcs[c.si].name}\n${c.tx}`).join('\n\n');
  }
  function sampleFor(nb, budget, focus) {
    const ix = index(nb); if (!ix.chunks.length) return '';
    const total = ix.srcs.reduce((a, s) => a + s.text.length, 0);
    if (total <= budget) return ix.srcs.map(s => `### [Nguồn ${nb.sources.indexOf(s) + 1}] ${s.name}\n${s.text}`).join('\n\n');
    const share = budget / ix.srcs.length, out = [];
    ix.srcs.forEach((s, si) => {
      const cs = ix.chunks.filter(c => c.si === si); let take;
      if (focus) take = rank({ ...ix, chunks: cs }, focus).slice(0, Math.max(2, Math.floor(share / 700))).map(r => r.c).sort((a, b) => a.pos - b.pos);
      else { const n = Math.max(1, Math.floor(share / 700)), step = cs.length / n; take = Array.from({ length: Math.min(n, cs.length) }, (_, i) => cs[Math.floor(i * step)]); }
      out.push(`### [Nguồn ${nb.sources.indexOf(s) + 1}] ${s.name}\n${take.map(c => c.tx).join('\n')}`);
    });
    return out.join('\n\n');
  }
  // từ khóa đại diện của sổ (cụm 2 âm tiết hay gặp, không tốn AI)
  function keyPhrases(nb, n) {
    const ix = index(nb), cnt = new Map();
    ix.chunks.forEach(c => c.f.forEach((v, k) => { if (k.includes(' ')) cnt.set(k, (cnt.get(k) || 0) + 1); }));
    return [...cnt.entries()].filter(e => e[1] >= 2).sort((a, b) => b[1] - a[1]).slice(0, n).map(e => e[0]);
  }

  // ============================================================ Wikipedia (lọc theo độ liên quan)
  const WIKI = 'https://vi.wikipedia.org/w/api.php';
  async function wikiSearch(q, n = 6) {
    const r = await fetch(`${WIKI}?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=${n}&format=json&origin=*`);
    const j = await r.json();
    return ((j.query || {}).search || []).map(x => ({ title: x.title, snippet: String(x.snippet || '').replace(/<[^>]+>/g, ''), url: 'https://vi.wikipedia.org/wiki/' + encodeURIComponent(x.title.replace(/ /g, '_')) }));
  }
  async function wikiText(title) {
    const r = await fetch(`${WIKI}?action=query&prop=extracts&explaintext=1&exlimit=1&redirects=1&titles=${encodeURIComponent(title)}&format=json&origin=*`);
    const j = await r.json(); const p = Object.values((j.query || {}).pages || {})[0]; return (p && p.extract) || '';
  }
  function relScore(w, vocab, lowerText) {
    const tt = toks(w.title.replace(/\s*\(.*\)\s*$/, '')).filter(x => !STOP.has(x));
    if (!tt.length) return 0;
    const hit = tt.filter(x => vocab.has(x)).length / tt.length;
    const plain = w.title.toLowerCase().replace(/\s*\(.*\)\s*$/, '');
    const exact = lowerText.includes(plain) ? 1 : 0;
    const sn = new Set(toks(w.snippet).filter(x => !STOP.has(x) && vocab.has(x))).size;
    return hit * .55 + exact * .35 + Math.min(sn, 8) / 8 * .10;
  }
  async function wikiRelevant(nb, queries, { min = .5, max = 8 } = {}) {
    const ix = index(nb), vocab = new Set(), lower = ix.srcs.map(s => s.text.toLowerCase()).join('\n').slice(0, 400000);
    ix.chunks.forEach(c => c.f.forEach((_, k) => { if (!k.includes(' ')) vocab.add(k); }));
    const seen = new Map();
    const res = await Promise.all(queries.slice(0, 6).map(q => wikiSearch(q, 5).catch(() => [])));
    res.flat().forEach(w => { if (!seen.has(w.title)) seen.set(w.title, w); });
    return [...seen.values()].map(w => ({ ...w, score: relScore(w, vocab, lower) })).filter(w => w.score >= min).sort((a, b) => b.score - a.score).slice(0, max);
  }

  // ============================================================ đọc tệp / ảnh
  const loadScript = src => new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error('Không tải được thư viện đọc tệp (cần Internet).')); document.head.appendChild(s); });
  const b64 = buf => { let s = '', a = new Uint8Array(buf); for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); };
  function loadImg(file) { return new Promise((ok, no) => { const u = URL.createObjectURL(file), i = new Image(); i.onload = () => { URL.revokeObjectURL(u); ok(i); }; i.onerror = () => no(new Error('Không đọc được ảnh (định dạng chưa hỗ trợ).')); i.src = u; }); }
  async function prepImage(file) {
    const i = await loadImg(file), mk = (max, q) => { const sc = Math.min(1, max / Math.max(i.width, i.height)), c = document.createElement('canvas'); c.width = Math.round(i.width * sc); c.height = Math.round(i.height * sc); c.getContext('2d').drawImage(i, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', q); };
    return { data: mk(1600, .82).split(',')[1], thumb: mk(180, .6) };
  }
  async function readFile(f) {
    const n = f.name.toLowerCase();
    if (/\.(txt|md|csv)$/.test(n)) return { text: await f.text() };
    if (n.endsWith('.docx')) { if (!window.mammoth) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js'); return { text: (await window.mammoth.extractRawText({ arrayBuffer: await f.arrayBuffer() })).value }; }
    if (n.endsWith('.pdf')) {
      const buf = await f.arrayBuffer(); let out = '';
      try {
        if (!window.pdfjsLib) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        const pdf = await window.pdfjsLib.getDocument({ data: buf.slice(0) }).promise;
        for (let i = 1; i <= pdf.numPages && out.length < MAX_SRC_CHARS; i++) { const c = await (await pdf.getPage(i)).getTextContent(); out += c.items.map(t => t.str).join(' ') + '\n\n'; }
      } catch (e) { if (!/Internet/.test(e.message)) out = ''; else throw e; }
      if (out.replace(/\s/g, '').length < 200) {   // PDF scan → nhờ Gemini đọc (tốn 3 lượt)
        if (buf.byteLength > 9 * 1024 * 1024) throw new Error('PDF scan lớn hơn 9 MB, chưa đọc được. Hãy tách nhỏ hoặc chụp từng trang thành ảnh.');
        await useAi(3, 'pdf-ocr');
        out = await gem([{ inlineData: { mimeType: 'application/pdf', data: b64(buf) } }, { text: 'Chép lại ĐẦY ĐỦ chữ trong tài liệu PDF này (tiếng Việt, giữ tiêu đề, bảng, công thức). Không bịa, không bình luận.' }], { maxTokens: 8192, temp: 0 });
      }
      return { text: out };
    }
    if (/^image\//.test(f.type) || /\.(png|jpe?g|webp|gif|bmp)$/.test(n)) {
      const im = await prepImage(f); await useAi(2, 'image');
      const text = await gem([{ inlineData: { mimeType: 'image/jpeg', data: im.data } }, { text: 'Hãy mô tả chi tiết hình này bằng tiếng Việt và chép lại TOÀN BỘ chữ nhìn thấy (giữ cấu trúc bảng, công thức). Nếu là sơ đồ/biểu đồ, nêu rõ các thành phần và quan hệ giữa chúng. Không bịa điều không thấy.' }], { maxTokens: 3000, temp: 0.1 });
      return { text, thumb: im.thumb, kind: 'image' };
    }
    throw new Error('Chỉ hỗ trợ .docx, .pdf, .txt, .md và ảnh (.png, .jpg, .webp). File .doc cũ: hãy lưu lại thành .docx.');
  }
  const ytId = u => { const m = String(u).match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/); return m ? m[1] : null; };

  // ============================================================ thao tác trên sổ
  function addSource(nb, s) {
    if (nb.sources.length >= MAX_SRCS) { toast('Mỗi sổ tối đa ' + MAX_SRCS + ' nguồn.'); return false; }
    s.text = String(s.text || '').replace(/[ \t]+\n/g, '\n').slice(0, MAX_SRC_CHARS);
    if (s.text.trim().length < 20) { toast('Nguồn quá ngắn hoặc không đọc được chữ.'); return false; }
    s.id = rid(); s.on = true; nb.sources.push(s); delete _idx[nb.id]; return saveDb();
  }
  function newNb(title) { const nb = { id: rid(), title: title || 'Sổ nghiên cứu mới', ts: Date.now(), sources: [], chat: [], arts: [] }; loadDb().nbs.unshift(nb); saveDb(); return nb; }

  // ============================================================ markdown → HTML (link bấm được, bảng, trích dẫn)
  const aTag = (u, t) => `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(t)}</a>`;
  function md(text) {
    const keep = []; const K0 = h => { keep.push(h); return '\u0000' + (keep.length - 1) + '\u0000'; };
    let t = NOEMOJI(text).replace(/\r/g, '');
    t = t.replace(/```[\w-]*\n?([\s\S]*?)```/g, (m, c) => K0('<pre>' + esc(c.replace(/\n$/, '')) + '</pre>'));
    t = t.replace(/`([^`\n]+)`/g, (m, c) => K0('<code>' + esc(c) + '</code>'));
    t = t.replace(/\[([^\]\n]+)\]\(\s*<?(https?:\/\/[^\s)>]+(?:\([^\s)]*\)[^\s)>]*)*)>?\s*\)/g, (m, tx, u) => K0(aTag(u, tx.replace(/\*\*/g, ''))));
    t = t.replace(/\[(https?:\/\/[^\s\]]+)\]/g, (m, u) => K0(aTag(u, u)));
    t = t.replace(/(^|[\s(>])(https?:\/\/[^\s<>)\]]*[^\s<>)\].,;:!?'"])/g, (m, p, u) => p + K0(aTag(u, u)));
    t = t.replace(/\[Nguồn\s*([\d\s,;và]+)\]/gi, (m, ns) => K0((ns.match(/\d+/g) || []).map(n => `<button class="cite" onclick="NB.cite(${+n})" title="Đi tới nguồn ${+n}">${+n}</button>`).join('')));
    t = esc(t);
    const inl = s => s.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<i>$2</i>');
    const lines = t.split('\n'), out = []; let stack = [];
    const closeAll = n => { while (stack.length > n) out.push('</' + stack.pop().t + '>'); };
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i]; let m;
      if (/^\s*\|.*\|\s*$/.test(ln) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
        closeAll(0); const row = (l, tg) => '<tr>' + l.trim().replace(/^\||\|$/g, '').split('|').map(c => `<${tg}>${inl(c.trim())}</${tg}>`).join('') + '</tr>';
        let h = '<table>' + row(ln, 'th'); i += 2; while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { h += row(lines[i], 'td'); i++; } i--; out.push(h + '</table>'); continue;
      }
      if ((m = ln.match(/^(\s*)([-*•]|\d+[.)])\s+(.*)/))) {
        const lvl = Math.floor(m[1].length / 2) + 1, tg = /\d/.test(m[2]) ? 'ol' : 'ul';
        while (stack.length > lvl) out.push('</' + stack.pop().t + '>');
        while (stack.length < lvl) { out.push('<' + tg + '>'); stack.push({ t: tg }); }
        out.push('<li>' + inl(m[3]) + '</li>'); continue;
      }
      closeAll(0);
      if ((m = ln.match(/^\s*#{1,6}\s+(.*)/))) out.push('<h4>' + inl(m[1]) + '</h4>');
      else if (/^\s*([-*_]\s*){3,}$/.test(ln)) out.push('<hr>');
      else if ((m = ln.match(/^\s*&gt;\s?(.*)/))) out.push('<blockquote>' + inl(m[1]) + '</blockquote>');
      else if (ln.trim()) out.push('<p>' + inl(ln) + '</p>');
    }
    closeAll(0);
    return out.join('').replace(/\u0000(\d+)\u0000/g, (m, i) => keep[+i]);
  }

  // ============================================================ GIAO DIỆN
  function open() { loadDb(); cur = null; pend = []; showScreen('nb-screen'); renderList(); }
  function renderList() {
    const nbs = loadDb().nbs, rs = rounds();
    $('nb-screen').innerHTML = `<div class="page">
      <div class="nb-top"><h1>Nghiên cứu</h1><span class="nb-quota" id="nb-quota"></span>
        ${rs.length ? `<button class="pbtn" onclick="NB.fromRound()">${IC('target')} Nghiên cứu ván vừa chơi</button>` : ''}
        <button class="pbtn p" onclick="NB.create()">${IC('plus')} Sổ mới</button></div>
      <div class="nb-list">
        <div class="nb-card glass" onclick="NB.create()" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;min-height:150px;color:var(--accent)"><div class="ico" style="width:52px;height:52px;border-radius:50%;background:var(--accent-soft);display:grid;place-items:center">${IC('plus')}</div><b>Tạo sổ mới</b></div>
        ${nbs.map(n => `<div class="nb-card glass" onclick="NB.openNb('${n.id}')"><div class="nb-art" style="padding:0;cursor:pointer"><span class="kind">${IC('notebook')}</span></div><div style="font:700 17px var(--font-display);margin:12px 0 6px;letter-spacing:-.01em">${esc(n.title)}</div>
          <div class="nb-note">${n.sources.length} nguồn · ${n.arts.length} mục Studio<br>${new Date(n.ts).toLocaleDateString('vi-VN')}</div>
          <button class="nb-x" style="position:absolute;right:12px;top:12px" title="Xóa sổ" onclick="event.stopPropagation();NB.del('${n.id}')">${IC('trash')}</button></div>`).join('')}
      </div>
      ${!nbs.length ? `<div class="nb-note" style="padding:14px 6px">Bấm "Sổ mới" để bắt đầu. Bạn có thể nạp ván vừa chơi, tài liệu Word/PDF, hình ảnh, link YouTube hoặc bài Wikipedia, rồi hỏi AI, tạo flashcard, sơ đồ cây tri thức và bài thi.</div>` : ''}
      <div class="nb-note" style="padding:12px 6px">Dữ liệu chỉ lưu trong trình duyệt này. Nội dung nguồn được gửi cho Gemini để phân tích. AI có thể sai, hãy đối chiếu với tài liệu gốc.</div></div>`;
    paintQuota(); refreshQuota();
  }
  async function refreshQuota() { try { if (AUTH.backendReady() && AUTH.getCurrentUser()) { const r = await AUTH.apiFetch('/ai/usage'); quota = { used: r.used, limit: r.limit }; paintQuota(); } } catch (e) {} }
  function del(id) { if (!confirm('Xóa sổ này cùng toàn bộ nguồn và kết quả AI?')) return; db.nbs = db.nbs.filter(n => n.id !== id); saveDb(); renderList(); }
  function createNb() { askModal('Tạo sổ nghiên cứu', 'Tên sổ (ví dụ: Quang hợp, Chiến tranh Việt Nam…)', t => { const nb = newNb(t); openNb(nb.id); addDialog('file'); }); }

  function openNb(id, keepScroll) {
    cur = nbOf(id); if (!cur) return renderList();
    showScreen('nb-screen'); const nb = cur; const on = nb.sources.filter(s => s.on).length;
    const hasRound = nb.sources.some(s => s.kind === 'round');
    const chips = (nb.sources.length && !nb.chat.length) ? ['Tóm tắt các ý chính', 'Giải thích dễ hiểu cho học sinh lớp 11', 'Đưa ra 5 điểm dễ nhầm lẫn', hasRound ? 'Giải thích chi tiết các câu tôi làm sai' : 'Các mốc, số liệu cần nhớ'] : [];
    const old = $('nb-msgs'), st = old ? old.scrollTop : 0;
    $('nb-screen').innerHTML = `<div class="page">
      <div class="nb-top"><button class="pbtn sm" onclick="NB.open()">${IC('chevron', 'flip')} Sổ của tôi</button><h1 title="Bấm để đổi tên" onclick="NB.rename()" style="cursor:text">${esc(nb.title)}</h1><span class="nb-quota" id="nb-quota"></span></div>
      <div class="nb-mob"><button class="pbtn sm" data-p="src" onclick="NB.pane('src')">Nguồn</button><button class="pbtn sm p" data-p="chat" onclick="NB.pane('chat')">Hỏi đáp</button><button class="pbtn sm" data-p="studio" onclick="NB.pane('studio')">Studio</button></div>
      <div class="nb-grid ${col.l ? 'c1' : ''} ${col.r ? 'c3' : ''}" id="nb-grid">
        <div class="nb-col glass ${col.l ? 'mini' : ''}" data-p="src"><h3><span class="t" style="flex:1">Nguồn</span>${col.l ? '' : `<button class="nb-x" title="Thêm nguồn" onclick="NB.addDialog()">${IC('plus')}</button>`}<button class="nb-x" title="Thu gọn / mở rộng" onclick="NB.colToggle('l')">${IC('panel')}</button></h3>
          <div class="nb-scroll" id="nb-srcs">${nb.sources.length ? nb.sources.map((s, i) => `<div class="nb-src" id="nbs-${i + 1}"><input class="nb-chk" type="checkbox" ${s.on ? 'checked' : ''} onchange="NB.toggleSrc('${s.id}')" title="Dùng nguồn này khi trả lời"><div class="t" style="cursor:pointer" onclick="NB.preview('${s.id}')"><b style="font-weight:600">${i + 1}.</b> ${esc(s.name)}<small>${s.kind === 'image' ? 'Hình ảnh · ' : ''}${Math.round(s.text.length / 100) / 10}k ký tự</small></div>${s.thumb ? `<img class="th" src="${s.thumb}" alt="">` : `<span class="kind">${IC(KIND_IC[s.kind] || 'file')}</span>`}<button class="nb-x" title="Xóa nguồn" onclick="NB.delSrc('${s.id}')">${IC('close')}</button></div>`).join('') : `<div class="nb-note" style="padding:12px">Chưa có nguồn. Bấm dấu + để thêm ván đã chơi, tệp, ảnh, link YouTube, Wikipedia…</div>`}</div></div>
        <div class="nb-col glass show" data-p="chat"><h3><span class="t" style="flex:1">Hỏi đáp</span><span class="nb-note" style="font-weight:400">${on} nguồn đang bật</span></h3>
          <div class="nb-msgs" id="nb-msgs">${nb.chat.map(msgHtml).join('') || `<div class="nb-note" style="text-align:center;padding:60px 10px">${nb.sources.length ? 'Hỏi bất cứ điều gì về nguồn của bạn, hoặc yêu cầu "tạo flashcard", "tạo bài thi Khởi Động 10 câu"…' : 'Thêm nguồn ở cột bên trái để bắt đầu.'}</div>`}</div>
          <div class="nb-chips">${chips.map(c => `<button class="nb-chip" onclick="NB.ask(this.textContent)">${esc(c)}</button>`).join('')}</div>
          <div class="nb-att" id="nb-att"></div>
          <div class="nb-inp"><button class="nb-x" title="Đính kèm hình ảnh" onclick="document.getElementById('nb-imgin').click()" style="width:38px;height:38px">${IC('paperclip')}</button><input type="file" id="nb-imgin" accept="image/*" multiple hidden onchange="NB.attach(this.files);this.value=''">
            <textarea id="nb-in" rows="1" placeholder="Đặt câu hỏi, dán hoặc đính kèm hình ảnh…" oninput="this.style.height='auto';this.style.height=Math.min(this.scrollHeight,140)+'px'" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();NB.ask()}" onpaste="NB.paste(event)"></textarea>
            <button class="pbtn p" onclick="NB.ask()" style="width:42px;height:42px;padding:0">${IC('send')}</button></div></div>
        <div class="nb-col glass ${col.r ? 'mini' : ''}" data-p="studio"><h3><button class="nb-x" title="Thu gọn / mở rộng" onclick="NB.colToggle('r')">${IC('panel')}</button><span class="t">Studio</span></h3>
          <div class="nb-tools">
            ${[['summary', 'text', 'Tóm tắt'], ['flash', 'cards', 'Flashcard'], ['mind', 'mind', 'Sơ đồ tư duy'], ['tree', 'tree', 'Cây tri thức'], ['kd', 'bolt', 'Thi Khởi Động'], ['vd', 'trophy', 'Thi Về Đích'], ['xp', 'flag', 'Thi Xuất Phát'], ['links', 'link', 'Tìm tài liệu'], ['note', 'note', 'Ghi chú mới']].map(t => `<button class="nb-tool" onclick="NB.tool('${t[0]}')">${IC(t[1])} ${t[2]}</button>`).join('')}
            <button class="nb-tool" disabled title="Chưa có luật chơi Vinh Quang trong web">${IC('crown')} Vinh Quang</button></div>
          <div class="nb-sub">Đã tạo</div>
          <div class="nb-scroll">${nb.arts.length ? nb.arts.map(a => `<div class="nb-art" onclick="NB.openArt('${a.id}')"><span class="kind">${IC(ART_IC[a.type] || 'file')}</span><span style="flex:1;min-width:0">${esc(a.title)}<br><small class="nb-note">${new Date(a.ts).toLocaleString('vi-VN')}</small></span><button class="nb-x" onclick="event.stopPropagation();NB.delArt('${a.id}')">${IC('trash')}</button></div>`).join('') : '<div class="nb-note" style="padding:10px">Kết quả AI tạo ra sẽ hiện ở đây.</div>'}</div></div>
      </div></div>`;
    showPane(pane === 'src' || pane === 'studio' ? pane : 'chat'); paintQuota(); drawAtt();
    const m = $('nb-msgs'); if (m) { m.style.scrollBehavior = 'auto'; m.scrollTop = keepScroll ? st : m.scrollHeight; m.style.scrollBehavior = ''; }
  }
  function msgHtml(m, i) {
    if (m.r === 'u') return `<div class="nb-m u">${m.img ? `<img class="q" src="${m.img}" alt="">` : ''}${esc(m.t)}</div>`;
    const acts = (m.acts || []).map(a => `<button class="hi" onclick="NB.act('${a.a}','${a.id || ''}')">${IC('arrow')} ${esc(a.l)}</button>`).join('');
    const tools = m.plain ? '' : `<button onclick="NB.copyMsg(${i})">${IC('copy')} Sao chép</button><button onclick="NB.msgNote(${i})">${IC('note')} Lưu ghi chú</button><button onclick="NB.msgFlash(${i})">${IC('cards')} Tạo flashcard</button>`;
    return `<div class="nb-m a"><div class="bd">${md(m.t)}</div><div class="nb-acts">${acts}${tools}</div></div>`;
  }
  function pushMsg(m) { cur.chat.push(m); const box = $('nb-msgs'); if (box) { const empty = box.querySelector('.nb-note'); if (empty && box.children.length === 1) box.innerHTML = ''; box.insertAdjacentHTML('beforeend', msgHtml(m, cur.chat.length - 1)); box.scrollTop = box.scrollHeight; } }
  const showPane = p => { pane = p; document.querySelectorAll('#nb-screen .nb-col').forEach(c => c.classList.toggle('show', c.dataset.p === p)); document.querySelectorAll('#nb-screen .nb-mob button').forEach(b => b.classList.toggle('p', b.dataset.p === p)); };
  function colToggle(w) { col[w] = !col[w]; $('nb-grid').classList.toggle(w === 'l' ? 'c1' : 'c3', col[w]); openNb(cur.id, true); }
  function rename() { askModal('Đổi tên sổ', 'Tên mới', t => { cur.title = t; saveDb(); openNb(cur.id, true); }, cur.title); }
  function toggleSrc(id) { const s = cur.sources.find(x => x.id === id); s.on = !s.on; delete _idx[cur.id]; saveDb(); openNb(cur.id, true); }
  function delSrc(id) { cur.sources = cur.sources.filter(x => x.id !== id); delete _idx[cur.id]; saveDb(); openNb(cur.id, true); }
  function delArt(id) { cur.arts = cur.arts.filter(x => x.id !== id); saveDb(); openNb(cur.id, true); }
  function cite(n) {
    if (col.l) { col.l = false; openNb(cur.id, true); } showPane('src'); if (matchMedia('(min-width:1021px)').matches) showPane('chat');
    const el = $('nbs-' + n); if (!el) return toast('Không tìm thấy nguồn ' + n);
    if (!matchMedia('(min-width:1021px)').matches) showPane('src');
    el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1800);
  }
  function preview(id) { const s = cur.sources.find(x => x.id === id); if (!s) return; modal(`<h2>${IC(KIND_IC[s.kind] || 'file')} ${esc(s.name)}</h2>${s.url ? `<div class="nb-note" style="margin-bottom:8px"><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer" style="color:var(--accent)">Mở trang gốc</a></div>` : ''}${s.thumb ? `<img src="${s.thumb}" style="border-radius:12px;margin-bottom:10px">` : ''}<div style="white-space:pre-wrap;line-height:1.65;font-size:14px;max-height:56vh;overflow:auto">${esc(s.text.slice(0, 12000))}${s.text.length > 12000 ? '\n…' : ''}</div>${closeBtn()}`); }

  // ============================================================ hộp thoại
  function modal(html) { closeModal(); const d = document.createElement('div'); d.className = 'nb-ov'; d.id = 'nb-ov'; d.innerHTML = `<div class="nb-box">${html}</div>`; d.addEventListener('mousedown', e => { if (e.target === d) closeModal(); }); document.body.appendChild(d); return d; }
  function closeModal() { const d = $('nb-ov'); if (d) d.remove(); }
  const closeBtn = () => `<div style="text-align:right;margin-top:16px"><button class="pbtn" onclick="NB.closeModal()">Đóng</button></div>`;
  function askModal(title, label, cb, val) {
    modal(`<h2>${esc(title)}</h2><input type="text" id="nb-ask" placeholder="${esc(label)}" value="${esc(val || '')}"><div style="text-align:right"><button class="pbtn" onclick="NB.closeModal()">Hủy</button> <button class="pbtn p" id="nb-ask-ok">OK</button></div>`);
    const go = () => { const v = $('nb-ask').value.trim(); if (!v) return; closeModal(); cb(v); };
    $('nb-ask-ok').onclick = go; $('nb-ask').onkeydown = e => { if (e.key === 'Enter') go(); }; $('nb-ask').focus();
  }
  function choose(title, msg, labels) {
    return new Promise(res => { modal(`<h2>${esc(title)}</h2><p style="line-height:1.6;color:var(--text-muted)">${esc(msg)}</p><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;flex-wrap:wrap">${labels.map((l, i) => `<button class="pbtn ${i === 0 ? 'p' : ''}" data-i="${i}">${esc(l)}</button>`).join('')}</div>`); $('nb-ov').querySelectorAll('button[data-i]').forEach(b => b.onclick = () => { closeModal(); res(+b.dataset.i); }); });
  }
  let addTab = 'file';
  function addDialog(tab) {
    if (tab) addTab = tab; if (!cur) return; const rs = rounds();
    const T = [['file', 'upload', 'Tệp & ảnh'], ['yt', 'youtube', 'YouTube'], ['text', 'text', 'Dán văn bản'], ['wiki', 'globe', 'Wikipedia'], ['round', 'target', 'Ván đã chơi']];
    let body = '';
    if (addTab === 'file') body = `<label class="drop" id="nb-drop">${IC('upload')}<b>Kéo thả hoặc bấm để chọn tệp</b><div class="nb-note">Word (.docx), PDF, TXT và hình ảnh (.png, .jpg, .webp). PDF scan và hình ảnh được Gemini đọc chữ (tốn thêm lượt AI).</div><input type="file" id="nb-f" multiple accept=".docx,.pdf,.txt,.md,image/*" hidden onchange="NB.addFiles(this.files)"></label>`;
    if (addTab === 'yt') body = `<input type="text" id="nb-yt" placeholder="https://www.youtube.com/watch?v=…"><div class="nb-note">Gemini sẽ xem video công khai và ghi lại nội dung (tốn 3 lượt AI). Có thể không được với video dài hoặc riêng tư; khi đó hãy dán bản chép lời vào mục "Dán văn bản".</div><div style="margin-top:12px"><button class="pbtn p" onclick="NB.addYt()">Thêm video</button></div>`;
    if (addTab === 'text') body = `<input type="text" id="nb-tn" placeholder="Tên nguồn (tùy chọn)"><textarea id="nb-tt" placeholder="Dán nội dung bài học, ghi chú…"></textarea><button class="pbtn p" onclick="NB.addText()">Thêm</button>`;
    if (addTab === 'wiki') { const kp = cur.sources.length ? keyPhrases(cur, 5) : []; body = `<div style="display:flex;gap:8px"><input type="text" id="nb-wq" placeholder="Từ khóa (vd: Quang hợp)" value="${esc(cur.sources.length ? cur.title : '')}" onkeydown="if(event.key==='Enter')NB.wikiFind()"><button class="pbtn p" onclick="NB.wikiFind()" style="height:46px;margin-top:4px">Tìm</button></div>${kp.length ? `<div class="nb-note" style="margin:4px 0 8px">Gợi ý từ nội dung nguồn: ${kp.map(k => `<a href="#" onclick="document.getElementById('nb-wq').value='${esc(k)}';NB.wikiFind();return false" style="color:var(--accent)">${esc(k)}</a>`).join(' · ')}</div>` : ''}<div id="nb-wr"></div>`; }
    if (addTab === 'round') body = rs.length ? rs.map((r, i) => `<div class="nb-art" onclick="NB.addRound(${i})"><span class="kind">${IC('target')}</span><span style="flex:1">${MODE_NAME[r.mode] || r.mode} · ${new Date(r.ts).toLocaleString('vi-VN')}<br><small class="nb-note">${r.items.length} câu · đúng ${r.items.filter(x => x.ok).length}</small></span></div>`).join('') : '<div class="nb-note">Chưa có ván nào được lưu. Hãy chơi Khởi Động hoặc Về Đích trước.</div>';
    modal(`<h2>Thêm nguồn</h2><div class="nb-tabs">${T.map(t => `<button class="${t[0] === addTab ? 'on' : ''}" onclick="NB.addDialog('${t[0]}')">${IC(t[1])} ${t[2]}</button>`).join('')}</div>${body}<div id="nb-st" class="nb-note" style="margin-top:10px"></div>`);
    const dz = $('nb-drop'); if (dz) { ['dragover', 'dragenter'].forEach(e => dz.addEventListener(e, ev => { ev.preventDefault(); dz.classList.add('over'); })); ['dragleave', 'drop'].forEach(e => dz.addEventListener(e, ev => { ev.preventDefault(); dz.classList.remove('over'); })); dz.addEventListener('drop', ev => addFiles(ev.dataTransfer.files)); }
  }
  const st = (m, spin) => { const e = $('nb-st'); if (e) e.innerHTML = (spin ? '<span class="nb-sp"></span> ' : '') + esc(m); };
  async function addFiles(fl) {
    const fs = Array.from(fl || []); if (!fs.length) return;
    for (const f of fs) {
      try { st('Đang đọc ' + f.name + '…', 1); const r = await readFile(f); if (!addSource(cur, { kind: r.kind || 'file', name: f.name, text: r.text, thumb: r.thumb })) return; }
      catch (e) { st('Lỗi: ' + e.message); return; }
    }
    closeModal(); openNb(cur.id, true);
  }
  async function addYt() {
    const u = ($('nb-yt') || {}).value || '', id = ytId(u); if (!id) return st('Link YouTube chưa đúng.');
    try {
      await useAi(3, 'youtube'); st('Gemini đang xem video… (có thể mất 30–60 giây)', 1);
      const url = 'https://www.youtube.com/watch?v=' + id;
      const t = await gem([{ fileData: { fileUri: url } }, { text: 'Hãy ghi lại ĐẦY ĐỦ nội dung của video này bằng tiếng Việt, theo từng phần có tiêu đề: các khái niệm, số liệu, ví dụ, kết luận. Không bịa; nếu không xem được video, chỉ trả lời đúng cụm: KHONG_XEM_DUOC' }], { maxTokens: 8192, temp: 0.1 });
      if (/KHONG_XEM_DUOC/.test(t) || t.trim().length < 80) throw new Error('Gemini không xem được video này.');
      addSource(cur, { kind: 'yt', name: 'YouTube ' + id, url, text: t }); closeModal(); openNb(cur.id, true);
    } catch (e) { st('Không thêm được: ' + e.message + (/lượt AI/.test(e.message) ? '' : ' → hãy dán bản chép lời ở mục "Dán văn bản".')); }
  }
  function addText() { const t = ($('nb-tt') || {}).value || '', n = ($('nb-tn') || {}).value || 'Văn bản dán vào'; if (addSource(cur, { kind: 'text', name: n, text: t })) { closeModal(); openNb(cur.id, true); } }
  async function wikiFind() {
    const q = ($('nb-wq') || {}).value || ''; if (!q.trim()) return; const box = $('nb-wr'); box.innerHTML = '<span class="nb-sp"></span>';
    try {
      let r = cur.sources.length ? await wikiRelevant(cur, [q, ...keyPhrases(cur, 3).map(k => q + ' ' + k)], { min: .25, max: 8 }) : [];
      if (!r.length) r = (await wikiSearch(q)).map(x => ({ ...x, score: null }));
      window._nbW = r;
      box.innerHTML = r.length ? r.map((x, i) => `<div class="nb-art" onclick="NB.addWiki(${i})"><span class="kind">${IC('globe')}</span><span style="flex:1"><b>${esc(x.title)}</b>${x.score != null ? ` <span class="chip" style="padding:2px 8px">${Math.round(x.score * 100)}% liên quan</span>` : ''}<br><small class="nb-note">${esc(x.snippet)}</small></span></div>`).join('') : 'Không thấy kết quả.';
    } catch (e) { box.textContent = 'Lỗi tìm Wikipedia: ' + e.message; }
  }
  async function addWiki(i) {
    const w = (window._nbW || [])[i]; if (!w) return; st('Đang tải bài Wikipedia…', 1);
    try { const t = await wikiText(w.title); if (addSource(cur, { kind: 'wiki', name: 'Wikipedia: ' + w.title, url: w.url, text: t })) { closeModal(); openNb(cur.id, true); } } catch (e) { st('Lỗi: ' + e.message); }
  }
  function addRound(i) { const r = rounds()[i]; if (addSource(cur, { kind: 'round', name: `Ván ${MODE_NAME[r.mode] || r.mode} ${new Date(r.ts).toLocaleDateString('vi-VN')}`, text: roundToText(r) })) { closeModal(); openNb(cur.id, true); } }
  function fromRound() {
    const rs = rounds(); if (!rs.length) return toast('Chưa có ván nào được lưu. Hãy chơi một ván trước.');
    const r = rs[0], nb = newNb(`Nghiên cứu ${MODE_NAME[r.mode] || r.mode} ${new Date(r.ts).toLocaleDateString('vi-VN')}`);
    addSource(nb, { kind: 'round', name: `Ván ${MODE_NAME[r.mode] || r.mode} ${new Date(r.ts).toLocaleString('vi-VN')}`, text: roundToText(r) }); openNb(nb.id);
  }

  // ============================================================ đính kèm ảnh trong khung chat
  async function attach(fl) {
    for (const f of Array.from(fl || [])) { if (!/^image\//.test(f.type)) continue; if (pend.length >= 3) { toast('Tối đa 3 ảnh mỗi câu hỏi.'); break; } try { pend.push(await prepImage(f)); } catch (e) { toast(e.message); } }
    drawAtt();
  }
  function paste(e) { const fs = Array.from((e.clipboardData || {}).files || []).filter(f => /^image\//.test(f.type)); if (fs.length) { e.preventDefault(); attach(fs); } }
  function drawAtt() { const el = $('nb-att'); if (!el) return; el.innerHTML = pend.map((p, i) => `<div class="a"><img src="${p.thumb}" alt=""><button onclick="NB.unatt(${i})" title="Bỏ ảnh">${IC('close')}</button></div>`).join(''); }
  function unatt(i) { pend.splice(i, 1); drawAtt(); }

  // ============================================================ bộ nhớ ngữ cảnh: sổ đã làm gì
  function memory(nb) {
    const L = [];
    L.push('NGUỒN: ' + (nb.sources.map((s, i) => `${i + 1}) ${s.name}${s.on ? '' : ' (đang tắt)'}`).join('; ') || '(chưa có)'));
    const arts = nb.arts.slice(0, 8);
    if (arts.length) {
      L.push('ĐÃ TẠO TRONG SỔ (mới nhất trước):');
      arts.forEach(a => {
        const d = a.data; let b = '';
        if (a.type === 'summary' || a.type === 'note') b = String(d.text || d).slice(0, 320);
        else if (a.type === 'flash') b = d.slice(0, 10).map((c, i) => `${i + 1}. ${c.front} → ${c.back}`).join(' | ');
        else if (a.type === 'mind' || a.type === 'tree') b = 'gốc "' + d.t + '", nhánh: ' + (d.c || []).map(x => x.t).join(', ');
        else if (a.type === 'quiz') b = `(${(MODE_NAME[d.mode] || d.mode)}) ` + d.items.slice(0, 14).map((x, i) => `Câu ${i + 1}: ${x.q} → ${x.a}`).join(' | ');
        else if (a.type === 'links') b = d.map(x => x.term).join(', ');
        L.push(`- [${a.type}] ${a.title}: ${b}`);
      });
    }
    const h = nb.chat.slice(-9, -1);
    if (h.length) { L.push('HỘI THOẠI GẦN ĐÂY:'); h.forEach(m => L.push((m.r === 'u' ? 'Học sinh: ' : 'Trợ lý: ') + String(m.t).slice(0, 450))); }
    return L.join('\n').slice(0, 6500);
  }

  // ============================================================ hỏi đáp
  const noDia = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
  function intent(q) {
    const s = noDia(q); if (!/^\W*(?:(?:hay|vui long|giup|cho|minh|toi|em|ban|nhe)\s+){0,3}(?:tao|lam|xay dung|soan|ve)\b/.test(s)) return null;
    if (/flashcard|the ghi nho/.test(s)) return { t: 'flash' };
    if (/so do tu duy|mindmap|mind map/.test(s)) return { t: 'mind' };
    if (/cay tri thuc/.test(s)) return { t: 'tree' };
    if (/\b(bai thi|de thi|bai kiem tra|de kiem tra|de|bai)\b/.test(s) && /khoi dong|ve dich|xuat phat/.test(s)) { const m = s.match(/(\d+)\s*cau/); return { t: /khoi dong/.test(s) ? 'kd' : /ve dich/.test(s) ? 'vd' : 'xp', n: m ? +m[1] : null }; }
    if (/tom tat (toan bo|tai lieu|nguon|het)/.test(s)) return { t: 'summary' };
    return null;
  }
  async function ask(text) {
    const inp = $('nb-in'); const q = (text || (inp && inp.value) || '').trim(); if ((!q && !pend.length) || busy) return;
    if (!cur.sources.some(s => s.on) && !pend.length) return toast('Hãy thêm ít nhất một nguồn và bật dấu chọn.');
    const nb = cur, imgs = pend.slice(); pend = []; if (inp) { inp.value = ''; inp.style.height = 'auto'; } drawAtt();
    const it = !imgs.length && intent(q);
    pushMsg({ r: 'u', t: q || '(hình ảnh)', img: imgs[0] && imgs[0].thumb });
    busy = true; const box = $('nb-msgs'); box.insertAdjacentHTML('beforeend', '<div class="nb-m a" id="nb-wait"><div class="nb-dots"><span></span><span></span><span></span></div></div>'); box.scrollTop = box.scrollHeight;
    try {
      if (it) {
        busy = false; $('nb-wait') && $('nb-wait').remove();
        if (it.t === 'kd' || it.t === 'vd' || it.t === 'xp') { pushMsg({ r: 'a', plain: 1, t: 'Mình mở bảng tạo bài thi cho bạn, hãy chỉnh số câu và độ khó rồi bấm Tạo.' }); saveDb(); quizDialog(it.t, it.n); return; }
        const a = await runBusy('Đang tạo…', () => create(it.t)); pushMsg({ r: 'a', plain: 1, t: `Đã tạo **${a.title}** từ các nguồn đang bật.`, acts: [{ l: 'Mở ' + a.title, a: 'art', id: a.id }] }); saveDb(); openNb(nb.id); return;
      }
      await useAi(imgs.length ? 2 : 1, 'chat');
      const hist = q.length > 0 ? q : 'hình ảnh';
      const prevQ = [...nb.chat].reverse().find((m, i) => m.r === 'u' && i > 0);
      const query = (toks(q).length < 7 && prevQ ? prevQ.t + ' ' : '') + q;
      const ctx = contextFor(nb, query, CHAT_BUDGET);
      let links = '';
      try { const ws = await wikiRelevant(nb, [q.length > 3 ? q : nb.title], { min: .45, max: 3 }); links = ws.map(w => `- [${w.title}](${w.url}) — ${w.snippet.slice(0, 100)}`).join('\n'); } catch (e) {}
      const srcLinks = nb.sources.filter(s => s.url && s.on).map(s => `- [${s.name}](${s.url})`).join('\n');
      const prompt = `Bạn là gia sư thân thiện cho học sinh THPT Việt Nam đang ôn thi Đường lên đỉnh Olympia. Trả lời bằng tiếng Việt, rõ ràng, đi thẳng vào vấn đề, dùng Markdown (gạch đầu dòng, bảng khi so sánh).
QUY TẮC:
1. Ưu tiên dựa trên TƯ LIỆU bên dưới và ghi trích dẫn dạng [Nguồn n] sau ý tương ứng. Nếu TƯ LIỆU không có thông tin, nói "Nguồn không đề cập", rồi mới bổ sung kiến thức chung và đánh dấu "(ngoài tài liệu)".
2. Bạn phải NHỚ những gì đã làm trong sổ (mục TRẠNG THÁI SỔ): các flashcard, bài thi, sơ đồ đã tạo và hội thoại trước. Khi học sinh nói "câu 3", "bài vừa tạo", "ở trên", "cái đó"… hãy hiểu theo TRẠNG THÁI SỔ.
3. LINK: chỉ dùng link có trong TƯ LIỆU hoặc LINK THAM KHẢO, viết đúng dạng [văn bản mô tả](https://đường-dẫn-đầy-đủ). Tuyệt đối không viết "nhấp vào đây" mà không có link thật, không tự bịa URL. Nếu không có link phù hợp thì không nhắc link.
4. Nếu hợp lý, gợi ý học sinh có thể yêu cầu "tạo flashcard", "tạo sơ đồ", "tạo bài thi Khởi Động" từ nội dung này.
5. Không bịa số liệu, ngày tháng.

TRẠNG THÁI SỔ:
${memory(nb)}

TƯ LIỆU (các đoạn liên quan nhất):
${ctx || '(không có nguồn, chỉ dựa vào hình ảnh đính kèm)'}

LINK THAM KHẢO:
${[srcLinks, links].filter(Boolean).join('\n') || '(không có)'}

CÂU HỎI HIỆN TẠI: ${q || 'Hãy phân tích hình ảnh đính kèm.'}`;
      const parts = imgs.map(p => ({ inlineData: { mimeType: 'image/jpeg', data: p.data } })).concat([{ text: prompt }]);
      const ans = await gem(parts, { maxTokens: 3000, temp: 0.3 });
      $('nb-wait') && $('nb-wait').remove(); pushMsg({ r: 'a', t: ans || '(Không có phản hồi)' });
    } catch (e) { $('nb-wait') && $('nb-wait').remove(); pushMsg({ r: 'a', plain: 1, t: 'Có lỗi: ' + e.message }); }
    busy = false; saveDb();
  }
  function copyMsg(i) { const t = cur.chat[i].t; (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast('Đã sao chép.'), () => toast('Không sao chép được.')); }
  function msgNote(i) { const a = art(cur, 'note', 'Ghi chú', { text: cur.chat[i].t }); toast('Đã lưu vào ghi chú.'); openNb(cur.id, true); }
  async function msgFlash(i) { try { const a = await runBusy('Đang tạo flashcard từ câu trả lời…', () => create('flash', { focus: cur.chat[i].t })); openNb(cur.id, true); openArt(a.id); } catch (e) { toast(e.message); } }
  function act(a, id) { if (a === 'art') openArt(id); }

  // ============================================================ Studio
  const QMODE = { kd: ['khoi_dong', 'Khởi Động', 12], vd: ['ve_dich', 'Về Đích', 10], xp: ['xuat_phat', 'Xuất Phát', 10] };
  const sigOf = nb => nb.sources.filter(s => s.on).map(s => s.id + ':' + s.text.length).join('|');
  function art(nb, type, title, data, key) { const a = { id: rid(), type, title: title + ' · ' + new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }), ts: Date.now(), data, key: key || '' }; nb.arts.unshift(a); saveDb(); return a; }
  async function runBusy(msg, fn) {
    if (busy) throw new Error('Đang xử lý, vui lòng đợi…'); busy = true;
    modal(`<div style="text-align:center;padding:34px"><span class="nb-sp" style="width:30px;height:30px;border-width:3px"></span><div style="margin-top:14px">${esc(msg)}</div></div>`);
    try { return await fn(); } finally { busy = false; closeModal(); }
  }
  async function create(t, p) {
    const nb = cur; p = p || {}; const key = t + '|' + sigOf(nb) + '|' + JSON.stringify({ n: p.n, d: p.d, w: p.w, m: p.m });
    await useAi(t === 'links' ? 1 : 3, t);
    if (t === 'summary') { const C = sampleFor(nb, TOOL_BUDGET); const x = await gem(`Tóm tắt tài liệu sau cho học sinh THPT bằng tiếng Việt: (1) 5–8 ý chính, (2) thuật ngữ và số liệu quan trọng, (3) 3 điểm dễ nhầm. Ghi [Nguồn n] khi trích. Chỉ dùng nội dung trong nguồn.\n\n${C}`, { maxTokens: 2500 }); return art(nb, 'summary', 'Tóm tắt', { text: x }, key); }
    if (t === 'flash') { const C = p.focus ? contextFor(nb, p.focus, 8000) + '\n\nTRỌNG TÂM:\n' + p.focus.slice(0, 3000) : sampleFor(nb, TOOL_BUDGET); const j = parseJson(await gem(`Tạo 12–15 flashcard ôn tập từ tài liệu. Chỉ dùng nội dung trong nguồn.${p.focus ? ' Tập trung vào TRỌNG TÂM.' : ''} Trả về DUY NHẤT một mảng JSON: [{"front":"câu hỏi hoặc khái niệm","back":"đáp án ngắn gọn"}]\n\n${C}`, { maxTokens: 4500 })); return art(nb, 'flash', 'Flashcard', j.filter(x => x.front && x.back), key); }
    if (t === 'mind' || t === 'tree') {
      const C = sampleFor(nb, TOOL_BUDGET), kind = t === 'mind' ? 'sơ đồ tư duy (nhánh chính là các chủ đề lớn, nhánh con là ý chi tiết)' : 'cây tri thức (phân cấp từ khái niệm tổng quát đến cụ thể; mỗi nút có định nghĩa ngắn)';
      const j = parseJson(await gem(`Xây dựng ${kind} từ tài liệu. Chỉ dùng nội dung trong nguồn. Tối đa 3 cấp, mỗi nút tối đa 7 con, tên nút ≤ 8 từ. Trả về DUY NHẤT một đối tượng JSON: {"t":"tên gốc","d":"mô tả ngắn","c":[{"t":"...","d":"...","c":[...]}]}\n\n${C}`, { maxTokens: 4500 }));
      return art(nb, t, t === 'mind' ? 'Sơ đồ tư duy' : 'Cây tri thức', j, key);
    }
    if (t === 'links') return findLinks(nb, key);
    if (QMODE[t]) return genQuizArt(t, p, key);
  }
  async function findLinks(nb, key) {
    const ix = index(nb); const q = [nb.title, ...keyPhrases(nb, 4)].filter(Boolean).slice(0, 5), items = [];
    for (const term of q) {
      let w = []; try { w = await wikiRelevant(nb, [term], { min: .5, max: 3 }); } catch (e) {}
      items.push({ term, wiki: w, g: 'https://www.google.com/search?q=' + encodeURIComponent(term), sc: 'https://scholar.google.com/scholar?q=' + encodeURIComponent(term), yt: 'https://www.youtube.com/results?search_query=' + encodeURIComponent(term) });
    }
    return art(nb, 'links', 'Tài liệu tham khảo', items, key);
  }
  async function tool(t) {
    if (t === 'note') return noteEdit();
    if (!cur.sources.some(s => s.on)) return toast('Hãy thêm nguồn trước.');
    if (QMODE[t]) return quizDialog(t);
    const key = t + '|' + sigOf(cur) + '|' + JSON.stringify({}), ex = cur.arts.find(a => a.key === key);
    if (ex) { const c = await choose('Đã có bản tạo từ cùng nguồn', 'Mở lại bản cũ để không tốn thêm lượt AI, hoặc tạo bản mới.', ['Mở bản cũ', 'Tạo mới']); if (c === 0) return openArt(ex.id); }
    try { const a = await runBusy('Đang tạo…', () => create(t)); openNb(cur.id, true); openArt(a.id); } catch (e) { toast(e.message); }
  }
  function noteEdit(id) {
    const a = id && cur.arts.find(x => x.id === id);
    modal(`<h2>${IC('note')} Ghi chú</h2><textarea id="nb-nt" placeholder="Viết ghi chú của bạn…">${esc(a ? a.data.text : '')}</textarea><div style="text-align:right"><button class="pbtn" onclick="NB.closeModal()">Hủy</button> <button class="pbtn p" onclick="NB.noteSave('${id || ''}')">Lưu</button></div>`); $('nb-nt').focus();
  }
  function noteSave(id) { const v = $('nb-nt').value.trim(); if (!v) return; const a = id && cur.arts.find(x => x.id === id); if (a) { a.data.text = v; saveDb(); } else art(cur, 'note', 'Ghi chú', { text: v }); closeModal(); openNb(cur.id, true); }
  function quizDialog(t, n) {
    const [mode, name, def] = QMODE[t];
    modal(`<h2>${IC(t === 'kd' ? 'bolt' : t === 'vd' ? 'trophy' : 'flag')} Tạo bài thi ${name}</h2>
      <label class="nb-note">Số câu</label><input type="number" id="nb-qn" min="3" max="30" value="${n || def}">
      <label class="nb-note">Độ khó</label><select id="nb-qd"><option>Cơ bản</option><option selected>Trung bình</option><option>Khó (kiểu Olympia)</option></select>
      <label class="nb-note" style="display:flex;gap:8px;align-items:center;margin:4px 0 10px"><input type="checkbox" id="nb-qw" checked style="width:auto;margin:0;accent-color:var(--accent)"> Bổ sung kiến thức từ Wikipedia (chỉ khi tài liệu chưa đủ)</label>
      <div class="nb-note">Câu hỏi được ưu tiên lấy từ tài liệu của bạn. Đáp án ngắn (1–5 từ) để hệ thống chấm được. Bạn sẽ xem lại và xóa câu sai trước khi chơi. Tốn 3 lượt AI.</div>
      <div style="text-align:right;margin-top:16px"><button class="pbtn" onclick="NB.closeModal()">Hủy</button> <button class="pbtn p" onclick="NB.genQuiz('${t}')">Tạo bài thi</button></div>`);
  }
  async function genQuiz(t) {
    const p = { n: Math.max(3, Math.min(30, parseInt($('nb-qn').value, 10) || 10)), d: $('nb-qd').value, w: $('nb-qw').checked };
    const key = t + '|' + sigOf(cur) + '|' + JSON.stringify({ n: p.n, d: p.d, w: p.w, m: p.m }), ex = cur.arts.find(a => a.key === key);
    if (ex) { const c = await choose('Đã có bài thi giống hệt', 'Mở lại để không tốn thêm lượt AI, hoặc tạo bài mới.', ['Mở bài cũ', 'Tạo mới']); if (c === 0) { closeModal(); return openArt(ex.id); } }
    try { const a = await runBusy('Đang soạn câu hỏi…', () => create(t, p)); openNb(cur.id, true); openArt(a.id); } catch (e) { toast(e.message); }
  }
  async function genQuizArt(t, p, key) {
    const nb = cur, [mode, name] = QMODE[t]; const n = p.n || QMODE[t][2];
    let C = sampleFor(nb, TOOL_BUDGET);
    if (p.w !== false) { try { const ws = await wikiRelevant(nb, [nb.title, ...keyPhrases(nb, 2)], { min: .55, max: 2 }); for (const x of ws) { const tx = await wikiText(x.title); if (tx) C += `\n\n### [Wikipedia] ${x.title} (${x.url})\n${tx.slice(0, 6000)}`; } } catch (e) {} }
    const fmt = mode === 've_dich' ? '{"q":"câu hỏi","a":"đáp án ngắn","pts":20 hoặc 30,"src":"Nguồn n / Wikipedia"}  (pts=20: vận dụng; pts=30: khó, suy luận)' : '{"q":"câu hỏi","a":"đáp án ngắn","src":"Nguồn n / Wikipedia"}';
    const j = parseJson(await gem(`Bạn là người ra đề Đường lên đỉnh Olympia. Hãy ra đúng ${n} câu hỏi phần ${name}, độ khó: ${p.d || 'Trung bình'}, tiếng Việt.
QUY TẮC: (1) ƯU TIÊN lấy kiến thức từ các "Nguồn" của học sinh; chỉ dùng "Wikipedia" khi nguồn thiếu. (2) Mỗi câu có MỘT đáp án duy nhất, ngắn (1–5 từ, hoặc con số), không mơ hồ. (3) Câu hỏi tự đủ nghĩa, không viết "theo tài liệu". (4) Không bịa; nếu không chắc thì bỏ câu đó. (5) Không trùng ý.
Trả về DUY NHẤT mảng JSON, mỗi phần tử: ${fmt}\n\n${C}`, { maxTokens: 6000, temp: 0.4 }));
    const items = j.filter(x => x.q && x.a).slice(0, n).map(x => ({ q: String(x.q), a: String(x.a), src: String(x.src || ''), pts: mode === 've_dich' ? (Number(x.pts) === 30 ? 30 : 20) : undefined }));
    if (!items.length) throw new Error('AI chưa tạo được câu hỏi hợp lệ, hãy thử lại.');
    return art(nb, 'quiz', 'Bài thi ' + name, { mode, items }, key);
  }

  // ---------- xem kết quả ----------
  function openArt(id) {
    const a = cur.arts.find(x => x.id === id); if (!a) return; const ic = IC(ART_IC[a.type] || 'file');
    if (a.type === 'summary') modal(`<h2>${ic} ${esc(a.title)}</h2><div class="nb-m a" style="max-width:none;margin:0"><div class="bd">${md(a.data.text)}</div></div><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px"><button class="pbtn" onclick="NB.ask('Giải thích kỹ hơn phần quan trọng nhất của bản tóm tắt vừa tạo');NB.closeModal()">Hỏi thêm về bản tóm tắt</button><button class="pbtn" onclick="NB.closeModal()">Đóng</button></div>`);
    else if (a.type === 'note') noteEdit(a.id);
    else if (a.type === 'flash') { window._fc = { a, i: 0 }; fcRender(); }
    else if (a.type === 'mind' || a.type === 'tree') { modal(`<h2>${ic} ${esc(a.title)}</h2><div class="nb-tree" id="nb-tr"></div><div id="nb-trd" class="nb-note" style="margin-top:10px;font-size:14px">Bấm vào một nút để xem mô tả hoặc thu gọn, mở rộng.</div>${closeBtn()}`); treeDraw(a.data); }
    else if (a.type === 'links') modal(`<h2>${ic} ${esc(a.title)}</h2><div class="nb-note" style="margin-bottom:6px">Kết quả Wikipedia đã được lọc theo độ liên quan với nội dung nguồn của bạn. Các nút Google, Scholar, YouTube mở trang tìm kiếm cho từ khóa đó.</div>${a.data.map(it => `<div style="margin:16px 0"><b>${esc(it.term)}</b>${it.wiki.map(w => `<div style="display:flex;gap:8px;align-items:flex-start;margin:6px 0"><span class="chip" style="padding:2px 8px">${Math.round(w.score * 100)}%</span><span style="flex:1">${aTag(w.url, w.title).replace('<a ', '<a style="color:var(--accent);font-weight:600" ')}<br><span class="nb-note">${esc(w.snippet.slice(0, 120))}…</span></span><button class="pbtn sm" onclick="NB.wikiAdd('${esc(w.title).replace(/'/g, '&#39;')}')">Thêm vào nguồn</button></div>`).join('') || '<div class="nb-note">Không có bài Wikipedia đủ liên quan.</div>'}<div style="margin-top:6px">${[['g', 'Google'], ['sc', 'Scholar'], ['yt', 'YouTube']].map(x => `<a class="lnk" style="display:inline-flex;gap:4px;color:var(--accent);margin-right:12px;font-weight:600;font-size:13px" href="${it[x[0]]}" target="_blank" rel="noopener noreferrer">${x[1]} ${IC('external')}</a>`).join('')}</div></div>`).join('')}${closeBtn()}`);
    else if (a.type === 'quiz') quizView(a);
  }
  async function wikiAdd(title) { try { const w = { title, url: 'https://vi.wikipedia.org/wiki/' + encodeURIComponent(title.replace(/ /g, '_')) }; const t = await wikiText(title); if (addSource(cur, { kind: 'wiki', name: 'Wikipedia: ' + title, url: w.url, text: t })) { toast('Đã thêm vào nguồn.'); openNb(cur.id, true); } } catch (e) { toast(e.message); } }
  function fcRender() {
    const { a, i } = window._fc, c = a.data[i];
    modal(`<h2>${IC('cards')} ${esc(a.title)} <small class="nb-note" style="font-weight:500">${i + 1}/${a.data.length}</small></h2><div class="nb-fc" onclick="this.classList.toggle('f')"><div><div class="s">${esc(c.front)}</div><div class="s b">${esc(c.back)}</div></div></div>
      <div style="display:flex;justify-content:space-between"><button class="pbtn" onclick="NB.fc(-1)">Trước</button><button class="pbtn" onclick="NB.closeModal()">Đóng</button><button class="pbtn p" onclick="NB.fc(1)">Tiếp</button></div>`);
  }
  function fc(d) { const f = window._fc; f.i = (f.i + d + f.a.data.length) % f.a.data.length; fcRender(); }
  function treeDraw(root) {
    const open = new Set(); const NW = 178, NH = 36, GX = 48, GY = 10; let sel = null;
    (function init(n, d) { n._k = rid(); if (d < 1) open.add(n._k); (n.c || []).forEach(x => init(x, d + 1)); })(root, 0);
    function draw() {
      let y = 0; const nodes = [], edges = [];
      (function lay(n, d) { const kids = open.has(n._k) ? (n.c || []) : []; let y0;
        if (!kids.length) { y0 = y; y += NH + GY; } else { const ys = kids.map(k => lay(k, d + 1)); y0 = (ys[0] + ys[ys.length - 1]) / 2; kids.forEach((k, i) => edges.push([d, y0, d + 1, ys[i]])); }
        nodes.push({ n, d, y: y0 }); return y0; })(root, 0);
      const W = (Math.max(...nodes.map(x => x.d)) + 1) * (NW + GX), H = Math.max(y, 60);
      const cs = getComputedStyle(document.body), acc = cs.getPropertyValue('--accent').trim() || '#1a73e8', txt = cs.getPropertyValue('--text').trim() || '#222', bg = cs.getPropertyValue('--bg').trim() || '#fff';
      $('nb-tr').innerHTML = `<svg width="${W + 24}" height="${H + 12}" style="display:block;margin:8px">` +
        edges.map(e => { const x1 = e[0] * (NW + GX) + NW, y1 = e[1] + NH / 2, x2 = e[2] * (NW + GX), y2 = e[3] + NH / 2; return `<path d="M${x1} ${y1}C${x1 + GX / 2} ${y1},${x2 - GX / 2} ${y2},${x2} ${y2}" fill="none" stroke="${txt}" stroke-opacity=".25" stroke-width="1.5"/>`; }).join('') +
        nodes.map((o, i) => { const x = o.d * (NW + GX), has = (o.n.c || []).length, t = String(o.n.t || ''); return `<g data-i="${i}" style="cursor:pointer"><rect x="${x}" y="${o.y}" width="${NW}" height="${NH}" rx="12" fill="${o.d === 0 ? acc : (sel === o.n._k ? acc : bg)}" fill-opacity="${o.d === 0 ? 1 : (sel === o.n._k ? .15 : 1)}" stroke="${acc}" stroke-width="1.5"/><text x="${x + 12}" y="${o.y + 22}" font-size="13" font-weight="600" fill="${o.d === 0 ? '#fff' : txt}" font-family="Inter,sans-serif">${esc(t.length > 22 ? t.slice(0, 21) + '…' : t)}${has ? (open.has(o.n._k) ? '  –' : '  +') : ''}</text><title>${esc(t)}</title></g>`; }).join('') + '</svg>';
      $('nb-tr').querySelectorAll('g').forEach(g => g.onclick = () => { const o = nodes[+g.dataset.i]; sel = o.n._k; if ((o.n.c || []).length) { open.has(o.n._k) ? open.delete(o.n._k) : open.add(o.n._k); } $('nb-trd').innerHTML = `<b>${esc(o.n.t)}</b>${o.n.d ? ' — ' + esc(o.n.d) : ''}`; draw(); });
    }
    draw();
  }
  function quizView(a) {
    const d = a.data;
    modal(`<h2>${IC('quiz')} ${esc(a.title)} <small class="nb-note" style="font-weight:500">${d.items.length} câu</small></h2>
      <div class="nb-note" style="margin-bottom:8px">AI có thể sai. Hãy đối chiếu đáp án với tài liệu và xóa câu không ổn trước khi chơi. Ván chơi bằng đề này không tính vào bảng xếp hạng và dữ liệu nghiên cứu.</div>
      ${d.items.map((x, i) => `<div class="nb-q"><div class="t">${i + 1}. ${esc(x.q)}${x.pts ? ` <b>(${x.pts} điểm)</b>` : ''}<small>Đáp án: <b>${esc(x.a)}</b>${x.src ? ' · ' + esc(x.src) : ''}</small></div><button class="nb-x" title="Xóa câu" onclick="NB.qdel('${a.id}',${i})">${IC('trash')}</button></div>`).join('')}
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px"><button class="pbtn" onclick="NB.closeModal()">Đóng</button><button class="pbtn p" onclick="NB.play('${a.id}')">${IC('play')} Chơi ngay</button></div>`);
  }
  function qdel(id, i) { const a = cur.arts.find(x => x.id === id); a.data.items.splice(i, 1); saveDb(); quizView(a); }
  function play(id) {
    const a = cur.arts.find(x => x.id === id); if (!a || !a.data.items.length) return; closeModal();
    startGame(a.data.mode, { custom: a.data.items.map(x => ({ question: x.q, answer: x.a, points: x.pts, subject: '' })), fromNb: cur.id });
  }
  // app.js gọi hàm này thay cho loader câu hỏi từ Google Sheets
  function buildPlay(mode, items) {
    const sh = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    if (mode === 've_dich') { const pools = { 20: sh(items.filter(x => x.points !== 30)), 30: sh(items.filter(x => x.points === 30)) }; return { success: true, questions: [...pools[20], ...pools[30]], pools }; }
    return { success: true, questions: sh(items).map(x => ({ question: x.question, answer: x.answer, subject: '' })) };
  }
  function back(fromNb) { if (fromNb && nbOf(fromNb)) { cur = nbOf(fromNb); openNb(fromNb); } else open(); }

  return { open, create: createNb, openNb, del, rename, pane: showPane, colToggle, addDialog, closeModal, toggleSrc, delSrc, delArt, addFiles, addYt, addText, wikiFind, addWiki, wikiAdd, addRound, fromRound, ask, tool, genQuiz, openArt, fc, qdel, play, saveRound, buildPlay, back, cite, preview, attach, paste, unatt, copyMsg, msgNote, msgFlash, act, noteSave, _md: md, _feats: feats, _useAi: useAi };
})();
