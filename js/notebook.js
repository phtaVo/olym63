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
  const CHAT_BUDGET = 9000, TOOL_BUDGET = 22000, MIND_BUDGET = 30000, FULL_IF_UNDER = 14000;
  const $ = id => document.getElementById(id);
  const uid = () => { const u = (typeof AUTH !== 'undefined' && AUTH.getCurrentUser) ? AUTH.getCurrentUser() : null; return u ? String(u.id != null ? u.id : u.username) : 'guest'; };
  const K = () => 'olym63_nb1_' + uid(), KR = () => 'olym63_nbround_' + uid(), KQ = () => 'olym63_nbq_' + uid();
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const rid = () => Math.random().toString(36).slice(2, 10);
  const toast = m => { try { showToast(m); } catch (e) { alert(m); } };
  const KIND_IC = { round: 'target', file: 'file', yt: 'youtube', text: 'text', wiki: 'globe', web: 'globe', image: 'image' };
  const ART_IC = { summary: 'text', flash: 'cards', mind: 'mind', tree: 'tree', quiz: 'quiz', mcq: 'quiz', doc: 'file', links: 'link', note: 'note', chart: 'chart', report: 'file' };

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
    if (n.endsWith('.pptx')) {
      if (!window.JSZip) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
      const z = await window.JSZip.loadAsync(await f.arrayBuffer());
      const sl = Object.keys(z.files).filter(k => /^ppt\/slides\/slide\d+\.xml$/.test(k)).sort((a, b) => parseInt(a.match(/\d+/)[0], 10) - parseInt(b.match(/\d+/)[0], 10));
      let out = ''; for (let i = 0; i < sl.length && out.length < MAX_SRC_CHARS; i++) { const x = await z.file(sl[i]).async('string'); out += `[Slide ${i + 1}] ` + (x.match(/<a:t>[^<]*<\/a:t>/g) || []).map(t => t.replace(/<[^>]+>/g, '')).join(' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>') + '\n\n'; }
      return { text: out };
    }
    if (/\.xlsx?$/.test(n)) {
      if (!window.XLSX) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
      const wb = window.XLSX.read(await f.arrayBuffer(), { type: 'array' }); let out = '';
      wb.SheetNames.forEach(s => { if (out.length < MAX_SRC_CHARS) out += `[Trang tính ${s}]\n` + window.XLSX.utils.sheet_to_csv(wb.Sheets[s]) + '\n\n'; });
      return { text: out };
    }
    if (/^image\//.test(f.type) || /\.(png|jpe?g|webp|gif|bmp)$/.test(n)) {
      const im = await prepImage(f); await useAi(2, 'image');
      const text = await gem([{ inlineData: { mimeType: 'image/jpeg', data: im.data } }, { text: 'Hãy mô tả chi tiết hình này bằng tiếng Việt và chép lại TOÀN BỘ chữ nhìn thấy (giữ cấu trúc bảng, công thức). Nếu là sơ đồ/biểu đồ, nêu rõ các thành phần và quan hệ giữa chúng. Không bịa điều không thấy.' }], { maxTokens: 3000, temp: 0.1 });
      return { text, thumb: im.thumb, kind: 'image' };
    }
    throw new Error('Chỉ hỗ trợ .docx, .pdf, .pptx, .xlsx, .txt, .md và ảnh (.png, .jpg, .webp). File .doc cũ: hãy lưu lại thành .docx.');
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
          <div class="nb-msgs" id="nb-msgs">${nb.chat.map(msgHtml).join('') || `<div class="nb-note" style="text-align:center;padding:60px 10px">${nb.sources.length ? 'Hỏi bất cứ điều gì về nguồn của bạn, hoặc yêu cầu trực tiếp: "tạo đề trắc nghiệm 20 câu mức nâng cao", "tạo bài thi Khởi Động 12 câu", "soạn tài liệu Word ôn tập"…' : 'Thêm nguồn ở cột bên trái để bắt đầu.'}</div>`}</div>
          <div class="nb-chips">${chips.map(c => `<button class="nb-chip" onclick="NB.ask(this.textContent)">${esc(c)}</button>`).join('')}</div>
          <div class="nb-depth"><span>Độ chi tiết</span>${[['ngan', 'Ngắn'], ['chitiet', 'Chi tiết'], ['sau', 'Chuyên sâu']].map(x => `<button data-d="${x[0]}" class="${getDepth() === x[0] ? 'on' : ''}" onclick="NB.depth('${x[0]}')">${x[1]}</button>`).join('')}</div>
          <div class="nb-att" id="nb-att"></div>
          <div class="nb-inp"><button class="nb-x" title="Đính kèm hình ảnh" onclick="document.getElementById('nb-imgin').click()" style="width:38px;height:38px">${IC('paperclip')}</button><input type="file" id="nb-imgin" accept="image/*" multiple hidden onchange="NB.attach(this.files);this.value=''">
            <textarea id="nb-in" rows="1" placeholder="Đặt câu hỏi, hoặc yêu cầu: tạo đề trắc nghiệm 20 câu, sơ đồ tư duy, tài liệu Word…" oninput="this.style.height='auto';this.style.height=Math.min(this.scrollHeight,140)+'px'" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();NB.ask()}" onpaste="NB.paste(event)"></textarea>
            <button class="pbtn p" onclick="NB.ask()" style="width:42px;height:42px;padding:0">${IC('send')}</button></div></div>
        <div class="nb-col glass ${col.r ? 'mini' : ''}" data-p="studio"><h3><button class="nb-x" title="Thu gọn / mở rộng" onclick="NB.colToggle('r')">${IC('panel')}</button><span class="t">Studio</span></h3>
          <div class="nb-tools">
            ${[['summary', 'text', 'Tóm tắt'], ['flash', 'cards', 'Flashcard'], ['mind', 'mind', 'Sơ đồ tư duy'], ['tree', 'tree', 'Cây tri thức'], ['mcq', 'quiz', 'Đề trắc nghiệm'], ['doc', 'file', 'Tài liệu Word'], ['chart', 'chart', 'Biểu đồ'], ['report', 'file', 'Báo cáo NCKH'], ['kd', 'bolt', 'Thi Khởi Động'], ['vd', 'trophy', 'Thi Về Đích'], ['xp', 'flag', 'Thi Xuất Phát'], ['links', 'link', 'Tìm tài liệu'], ['note', 'note', 'Ghi chú mới']].map(t => `<button class="nb-tool" onclick="NB.tool('${t[0]}')">${IC(t[1])} ${t[2]}</button>`).join('')}
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
  function modal(html, cls) { closeModal(); const d = document.createElement('div'); d.className = 'nb-ov'; d.id = 'nb-ov'; d.innerHTML = `<div class="nb-box ${cls || ''}">${html}</div>`; d.addEventListener('mousedown', e => { if (e.target === d) closeModal(); }); document.body.appendChild(d); return d; }
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
    const T = [['file', 'upload', 'Tệp & ảnh'], ['vault', 'folder', 'Kho của tôi'], ['yt', 'youtube', 'YouTube'], ['text', 'text', 'Dán văn bản'], ['web', 'globe', 'Liên kết web'], ['round', 'target', 'Ván đã chơi']];
    let body = '';
    if (addTab === 'file') body = `<div class="drop" id="nb-drop" role="button" tabindex="0" onclick="document.getElementById('nb-f').click()" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();document.getElementById('nb-f').click()}"><span class="drop-ic">${IC('upload')}</span><b>Kéo thả hoặc bấm để chọn tệp</b><span class="nb-note">Word (.docx), PDF, TXT và hình ảnh (.png, .jpg, .webp).<br>PDF scan và hình ảnh được Gemini đọc chữ (tốn thêm lượt AI).</span></div><input type="file" id="nb-f" multiple accept=".docx,.pdf,.txt,.md,image/*" hidden onchange="NB.addFiles(this.files)">`;
    if (addTab === 'vault') body = '<div id="nb-vault"></div>';
    if (addTab === 'yt') body = `<input type="text" id="nb-yt" placeholder="https://www.youtube.com/watch?v=…"><div class="nb-note">Gemini sẽ xem video công khai và ghi lại nội dung (tốn 3 lượt AI). Có thể không được với video dài hoặc riêng tư; khi đó hãy dán bản chép lời vào mục "Dán văn bản".</div><div style="margin-top:12px"><button class="pbtn p" onclick="NB.addYt()">Thêm video</button></div>`;
    if (addTab === 'text') body = `<input type="text" id="nb-tn" placeholder="Tên nguồn (tùy chọn)"><textarea id="nb-tt" placeholder="Dán nội dung bài học, ghi chú…"></textarea><button class="pbtn p" onclick="NB.addText()">Thêm</button>`;
    if (addTab === 'web') body = `<input type="text" id="nb-wu" placeholder="Dán link bài báo, trang web, Google Docs, PDF…" onkeydown="if(event.key==='Enter')NB.addWeb()"><div class="nb-note">Đọc được: trang web và bài viết, Wikipedia, Google Docs / Sheets / Slides (chia sẻ “Bất kỳ ai có liên kết”), Google Drive PDF và tệp PDF, Word công khai. Trang cần đăng nhập hoặc dựng hoàn toàn bằng JavaScript thì sao chép nội dung vào mục “Dán văn bản”. Link YouTube sẽ chuyển sang mục YouTube.</div><div style="margin-top:12px"><button class="pbtn p" onclick="NB.addWeb()">Đọc và thêm</button></div>`;
    if (addTab === 'wiki') { const kp = cur.sources.length ? keyPhrases(cur, 5) : []; body = `<div style="display:flex;gap:8px"><input type="text" id="nb-wq" placeholder="Từ khóa (vd: Quang hợp)" value="${esc(cur.sources.length ? cur.title : '')}" onkeydown="if(event.key==='Enter')NB.wikiFind()"><button class="pbtn p" onclick="NB.wikiFind()" style="height:46px;margin-top:4px">Tìm</button></div>${kp.length ? `<div class="nb-note" style="margin:4px 0 8px">Gợi ý từ nội dung nguồn: ${kp.map(k => `<a href="#" onclick="document.getElementById('nb-wq').value='${esc(k)}';NB.wikiFind();return false" style="color:var(--accent)">${esc(k)}</a>`).join(' · ')}</div>` : ''}<div id="nb-wr"></div>`; }
    if (addTab === 'round') body = rs.length ? rs.map((r, i) => `<div class="nb-art" onclick="NB.addRound(${i})"><span class="kind">${IC('target')}</span><span style="flex:1">${MODE_NAME[r.mode] || r.mode} · ${new Date(r.ts).toLocaleString('vi-VN')}<br><small class="nb-note">${r.items.length} câu · đúng ${r.items.filter(x => x.ok).length}</small></span></div>`).join('') : '<div class="nb-note">Chưa có ván nào được lưu. Hãy chơi Khởi Động hoặc Về Đích trước.</div>';
    modal(`<h2>Thêm nguồn</h2><div class="nb-tabs">${T.map(t => `<button class="${t[0] === addTab ? 'on' : ''}" onclick="NB.addDialog('${t[0]}')">${IC(t[1])} ${t[2]}</button>`).join('')}</div>${body}<div id="nb-st" class="nb-note" style="margin-top:10px"></div>`);
    if (addTab === 'vault' && typeof VAULT !== 'undefined') VAULT.mount('nb-vault', { pick: addFromVault });
    const dz = $('nb-drop'); if (dz) { ['dragover', 'dragenter'].forEach(e => dz.addEventListener(e, ev => { ev.preventDefault(); dz.classList.add('over'); })); ['dragleave', 'drop'].forEach(e => dz.addEventListener(e, ev => { ev.preventDefault(); dz.classList.remove('over'); })); dz.addEventListener('drop', ev => addFiles(ev.dataTransfer.files)); }
  }
  const st = (m, spin) => { const e = $('nb-st'); if (e) e.innerHTML = (spin ? '<span class="nb-sp"></span> ' : '') + esc(m); };
  async function addFromVault(node) {
    try {
      st('Đang lấy “' + node.name + '” từ Kho…', 1); const c = await VAULT.content(node);
      if (c.url) { const id = ytId(c.url); if (!id) { st('Liên kết này chưa đọc được tự động. Hãy mở link, sao chép nội dung và lưu thành Ghi chú trong Kho.'); return; } addTab = 'yt'; addDialog(); const i = $('nb-yt'); if (i) i.value = c.url; return; }
      let r = { text: c.text };
      if (c.file) { st('Đang đọc ' + c.name + '…', 1); r = await readFile(c.file); }
      if (!addSource(cur, { kind: r.kind || (c.file ? 'file' : 'text'), name: c.name, text: r.text, thumb: r.thumb, vid: node.id })) return;
      closeModal(); openNb(cur.id, true);
    } catch (e) { st('Lỗi: ' + e.message); }
  }
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
    const url = 'https://www.youtube.com/watch?v=' + id;
    try {
      st('Đang lấy phụ đề video…', 1);
      let tr = null; try { tr = await AUTH.apiFetch('/yt/transcript?id=' + id); } catch (e) {}
      if (tr && tr.ok && tr.text) {
        addSource(cur, { kind: 'yt', name: 'YouTube: ' + (tr.title || id), url, text: `Video: ${tr.title}\nKênh: ${tr.channel || ''}\n${tr.desc ? 'Mô tả: ' + tr.desc.slice(0, 600) + '\n' : ''}\nLời trong video${tr.auto ? ' (phụ đề tự động, có thể sai chính tả)' : ''}:\n${tr.text}` });
        closeModal(); openNb(cur.id, true); return;
      }
      await useAi(3, 'youtube'); st('Video không có phụ đề; Gemini đang xem video… (30–60 giây)', 1);
      const t = await gem([{ fileData: { fileUri: url } }, { text: 'Hãy ghi lại ĐẦY ĐỦ nội dung của video này bằng tiếng Việt, theo từng phần có tiêu đề: các khái niệm, số liệu, ví dụ, kết luận. Không bịa; nếu không xem được video, chỉ trả lời đúng cụm: KHONG_XEM_DUOC' }], { maxTokens: 8192, temp: 0.1 });
      if (/KHONG_XEM_DUOC/.test(t) || t.trim().length < 80) throw new Error('Không đọc được video này (không có phụ đề và Gemini không xem được).');
      addSource(cur, { kind: 'yt', name: 'YouTube: ' + ((tr && tr.title) || id), url, text: t }); closeModal(); openNb(cur.id, true);
    } catch (e) { st('Không thêm được: ' + e.message + ' → hãy dán bản chép lời ở mục "Dán văn bản".'); }
  }
  async function addWeb() {
    let u = (($('nb-wu') || {}).value || '').trim(); if (!u) return st('Hãy dán một đường dẫn.');
    if (ytId(u) && /youtu/i.test(u)) { addTab = 'yt'; addDialog(); const i = $('nb-yt'); if (i) i.value = u; return; }
    try {
      st('Đang đọc trang…', 1);
      const r = await AUTH.apiFetch('/web/read', { method: 'POST', body: JSON.stringify({ url: u }) });
      if (r.kind === 'binary') {
        const bin = atob(r.b64), arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        const f = new File([arr], /\.(pdf|docx)$/i.test(r.name) ? r.name : (r.name || 'tai-lieu') + '.' + r.ext, { type: r.ext === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
        st('Đang đọc ' + f.name + '…', 1); const x = await readFile(f);
        if (!addSource(cur, { kind: 'web', name: f.name, url: u, text: x.text })) return;
      } else if (!addSource(cur, { kind: 'web', name: (r.note ? r.note + ': ' : '') + (r.title || r.site), url: u, text: `Nguồn: ${u}\n${r.title ? 'Tiêu đề: ' + r.title + '\n' : ''}\n${r.text}` })) return;
      closeModal(); openNb(cur.id, true);
    } catch (e) { st(e.message); }
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
        else if (a.type === 'mcq') b = `(${d.items.length} câu, mức ${d.level || 'Trung bình'}${d.last ? ', lần làm gần nhất ' + d.last.score + '/' + d.last.n : ''}) ` + d.items.slice(0, 14).map((x, i) => `Câu ${i + 1}: ${x.q} → ${'ABCD'[x.a]}. ${x.o[x.a]}`).join(' | ');
        else if (a.type === 'doc') b = String(d.text || '').slice(0, 320);
        L.push(`- [${a.type}] ${a.title}: ${b}`);
      });
    }
    const h = nb.chat.slice(-9, -1);
    if (h.length) { L.push('HỘI THOẠI GẦN ĐÂY:'); h.forEach(m => L.push((m.r === 'u' ? 'Học sinh: ' : 'Trợ lý: ') + String(m.t).slice(0, 450))); }
    return L.join('\n').slice(0, 6500);
  }

  // ============================================================ hỏi đáp
  const noDia = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
  const LVQ = { 'Cơ bản': 'Cơ bản', 'Trung bình': 'Trung bình', 'Nâng cao': 'Khó (kiểu Olympia)', 'Hỗn hợp': 'Trung bình' };
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  function intent(q) {
    const s = noDia(q);
    if (!/^\W*(?:(?:hay|vui long|giup|cho|minh|toi|em|ban|nhe|can|muon|xin)\s+){0,4}(?:tao|lam|xay dung|soan|bien soan|viet|xuat|ve|lap|ra)\b/.test(s)) return null;
    const m = s.match(/(\d+)\s*(?:cau|cau hoi)\b/), n = m ? +m[1] : null;
    const d = /nang cao|\bkho\b|kieu olympia/.test(s) ? 'Nâng cao' : /co ban|don gian/.test(s) ? 'Cơ bản' : /hon hop/.test(s) ? 'Hỗn hợp' : /trung binh/.test(s) ? 'Trung bình' : null;
    const fm = q.match(/(?:về|chủ đề|tập trung(?: vào)?|liên quan(?: đến)?)\s+(.{3,120}?)\s*[.?!]?\s*$/i), focus = fm ? fm[1].replace(/^(phần|chương|bài)\s+/i, '$&') : '';
    const fresh = /\b(moi|khac|lai|them)\b/.test(s);
    const base = { n, d, focus, fresh };
    if (/\b(bai thi|de thi|phan thi|bai|de)\b/.test(s) && /khoi dong|ve dich|xuat phat/.test(s)) return { ...base, t: /khoi dong/.test(s) ? 'kd' : /ve dich/.test(s) ? 'vd' : 'xp' };
    if (/trac nghiem|bai kiem tra|de kiem tra|bai thi|de thi|bo cau hoi|cau hoi on tap/.test(s)) return { ...base, t: 'mcq' };
    if (/flashcard|the ghi nho/.test(s)) return { ...base, t: 'flash' };
    if (/so do tu duy|mindmap|mind map/.test(s)) return { ...base, t: 'mind' };
    if (/cay tri thuc/.test(s)) return { ...base, t: 'tree' };
    if (/tai lieu|file word|\bword\b|docx|google doc|bao cao|de cuong|giao an|bang tong hop|bang so sanh|ghi chu on tap|cheat ?sheet|so tay/.test(s)) {
      const kind = /de cuong/.test(s) ? 'đề cương ôn tập' : /bao cao/.test(s) ? 'báo cáo' : /giao an/.test(s) ? 'giáo án' : /so sanh/.test(s) ? 'bảng so sánh' : /so tay|cheat/.test(s) ? 'sổ tay ngắn gọn' : 'tài liệu học tập';
      return { ...base, t: 'doc', title: '', kind };
    }
    if (/^\W*(?:\w+\s+){0,4}tom tat/.test(s)) return { ...base, t: 'summary' };
    return null;
  }
  const getDepth = () => { try { return localStorage.getItem('olym63_nb_depth') || 'chitiet'; } catch (e) { return 'chitiet'; } };
  function depth(d) { try { localStorage.setItem('olym63_nb_depth', d); } catch (e) {} document.querySelectorAll('.nb-depth button').forEach(b => b.classList.toggle('on', b.dataset.d === d)); }
  const T_NAME = { mcq: 'đề trắc nghiệm', kd: 'bài thi Khởi Động', vd: 'bài thi Về Đích', xp: 'bài thi Xuất Phát', flash: 'flashcard', mind: 'sơ đồ tư duy', tree: 'cây tri thức', summary: 'bản tóm tắt', doc: 'tài liệu' };
  async function runIntent(nb, it) {
    const T = it.t; if (!T_NAME[T]) return false; const p = { focus: String(it.focus || '').slice(0, 200), title: String(it.title || '').slice(0, 120), kind: it.kind || '' };
    if (QMODE[T]) { p.n = clamp(+it.n || QMODE[T][2], 3, 30); p.d = LVQ[it.d] || 'Trung bình'; p.w = true; }
    else if (T === 'mcq') { p.n = clamp(+it.n || 10, 3, 40); p.d = LEVELS_OK.includes(it.d) ? it.d : 'Trung bình'; }
    const key = makeKey(T, p, nb), ex = !it.fresh && nb.arts.find(a => a.key === key);
    const a = ex || await runBusy('Đang tạo ' + T_NAME[T] + '…', () => create(T, p));
    pushMsg({ r: 'a', plain: 1, t: `${ex ? 'Sổ đã có sẵn' : 'Đã tạo'} **${a.title}** từ các nguồn đang bật${p.n ? ` (${p.n} câu${p.d ? ', mức ' + p.d : ''})` : ''}. Bạn có thể mở xem, mở ở tab mới hoặc chia sẻ link cho bạn bè cùng học.`, acts: [{ l: 'Mở', a: 'art', id: a.id }, { l: 'Mở tab mới', a: 'tab', id: a.id }, { l: 'Chia sẻ link', a: 'share', id: a.id }] });
    saveDb(); openNb(nb.id); return true;
  }
  async function ask(text) {
    const inp = $('nb-in'); const q = (text || (inp && inp.value) || '').trim(); if ((!q && !pend.length) || busy) return;
    if (!cur.sources.some(s => s.on) && !pend.length) return toast('Hãy thêm ít nhất một nguồn và bật dấu chọn.');
    const nb = cur, imgs = pend.slice(); pend = []; if (inp) { inp.value = ''; inp.style.height = 'auto'; } drawAtt();
    const it = !imgs.length && intent(q);
    pushMsg({ r: 'u', t: q || '(hình ảnh)', img: imgs[0] && imgs[0].thumb });
    busy = true; const box = $('nb-msgs'); box.insertAdjacentHTML('beforeend', '<div class="nb-m a" id="nb-wait"><div class="nb-dots"><span></span><span></span><span></span></div></div>'); box.scrollTop = box.scrollHeight;
    try {
      if (it) { busy = false; $('nb-wait') && $('nb-wait').remove(); await runIntent(nb, it); return; }
      const dp = getDepth();
      await useAi((imgs.length ? 2 : 1) + (dp === 'sau' ? 1 : 0), 'chat');
      const prevQ = [...nb.chat].reverse().find((m, i) => m.r === 'u' && i > 0);
      const query = (toks(q).length < 7 && prevQ ? prevQ.t + ' ' : '') + q;
      const ctx = contextFor(nb, query, dp === 'sau' ? 15000 : dp === 'chitiet' ? 12000 : CHAT_BUDGET);
      let links = '';
      try { const ws = await wikiRelevant(nb, [q.length > 3 ? q : nb.title], { min: .45, max: 3 }); links = ws.map(w => `- [${w.title}](${w.url}) — ${w.snippet.slice(0, 100)}`).join('\n'); } catch (e) {}
      const srcLinks = nb.sources.filter(s => s.url && s.on).map(s => `- [${s.name}](${s.url})`).join('\n');
      const prompt = `${PROMPTS.chat(dp)}

TRẠNG THÁI SỔ:
${memory(nb)}

TƯ LIỆU (các đoạn liên quan nhất, "Nguồn n" là số thứ tự nguồn trong sổ):
${ctx || '(không có nguồn, chỉ dựa vào hình ảnh đính kèm)'}

LINK THAM KHẢO:
${[srcLinks, links].filter(Boolean).join('\n') || '(không có)'}

CÂU HỎI HIỆN TẠI: ${q || 'Hãy phân tích hình ảnh đính kèm.'}`;
      const parts = imgs.map(p => ({ inlineData: { mimeType: 'image/jpeg', data: p.data } })).concat([{ text: prompt }]);
      let ans = await gem(parts, { maxTokens: dp === 'sau' ? 9000 : dp === 'chitiet' ? 5000 : 1800, temp: 0.3 });
      const mt = String(ans).match(/@@TAO\s*(\{[\s\S]*?\})\s*@@/);
      ans = String(ans).replace(/@@TAO[\s\S]*?@@/g, '').trim();
      $('nb-wait') && $('nb-wait').remove();
      if (mt) { let o = null; try { o = JSON.parse(mt[1]); } catch (e) {} if (o && T_NAME[o.t]) { busy = false; if (ans) pushMsg({ r: 'a', t: ans }); await runIntent(nb, { t: o.t, n: o.n, d: o.d, focus: o.focus, title: o.title, kind: o.kind, fresh: /\b(moi|khac|lai)\b/.test(noDia(q)) }); return; } }
      pushMsg({ r: 'a', t: ans || '(Không có phản hồi)' });
    } catch (e) { $('nb-wait') && $('nb-wait').remove(); pushMsg({ r: 'a', plain: 1, t: 'Có lỗi: ' + e.message }); }
    busy = false; saveDb();
  }
  function copyMsg(i) { const t = cur.chat[i].t; (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast('Đã sao chép.'), () => toast('Không sao chép được.')); }
  function msgNote(i) { const a = art(cur, 'note', 'Ghi chú', { text: cur.chat[i].t }); toast('Đã lưu vào ghi chú.'); openNb(cur.id, true); }
  async function msgFlash(i) { try { const a = await runBusy('Đang tạo flashcard từ câu trả lời…', () => create('flash', { focus: cur.chat[i].t })); openNb(cur.id, true); openArt(a.id); } catch (e) { toast(e.message); } }
  function act(a, id) { if (a === 'art') openArt(id); else if (a === 'tab') newTab(id); else if (a === 'share') shareDlg(id); }

  // ============================================================ Studio
  const QMODE = { kd: ['khoi_dong', 'Khởi Động', 12], vd: ['ve_dich', 'Về Đích', 10], xp: ['xuat_phat', 'Xuất Phát', 10] };
  const sigOf = nb => nb.sources.filter(s => s.on).map(s => s.id + ':' + s.text.length).join('|');
  function art(nb, type, title, data, key) { const a = { id: rid(), type, title: title + ' · ' + new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }), ts: Date.now(), data, key: key || '' }; nb.arts.unshift(a); saveDb(); return a; }
  async function runBusy(msg, fn) {
    if (busy) throw new Error('Đang xử lý, vui lòng đợi…'); busy = true;
    modal(`<div style="text-align:center;padding:34px"><span class="nb-sp" style="width:30px;height:30px;border-width:3px"></span><div style="margin-top:14px">${esc(msg)}</div></div>`);
    try { return await fn(); } finally { busy = false; closeModal(); }
  }
  const LEVELS_OK = ['Cơ bản', 'Trung bình', 'Nâng cao', 'Hỗn hợp'];
  const makeKey = (t, p, nb) => t + '|' + sigOf(nb || cur) + '|' + JSON.stringify({ n: p.n, d: p.d, w: p.w, m: p.m, f: p.focus || '', ti: p.title || '', k: p.kind || '', rm: p.meta ? p.meta.title + '|' + Date.now() : '' });
  const shuf = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  // JSON bị cắt giữa chừng (hết token) → cố gắng đóng ngoặc để vẫn dùng được phần đã có
  function parseJsonLoose(txt) {
    try { return parseJson(txt); } catch (e) {}
    let s = String(txt || '').replace(/```(?:json)?/gi, ''); const i = Math.min(...['[', '{'].map(c => { const k = s.indexOf(c); return k < 0 ? 1e9 : k; })); if (i >= 1e9) throw new Error('AI trả về định dạng không đọc được, hãy thử lại.');
    s = s.slice(i); const st = []; let ins = false, esc2 = false, last = 0;
    for (let k = 0; k < s.length; k++) { const ch = s[k]; if (ins) { if (esc2) esc2 = false; else if (ch === '\\') esc2 = true; else if (ch === '"') ins = false; continue; } if (ch === '"') ins = true; else if (ch === '{' || ch === '[') st.push(ch); else if (ch === '}' || ch === ']') { st.pop(); if (!st.length) { last = k + 1; break; } } else if (ch === ',') last = k; }
    let cut = s.slice(0, last || s.length).replace(/,\s*$/, ''); const st2 = []; ins = false; esc2 = false;
    for (let k = 0; k < cut.length; k++) { const ch = cut[k]; if (ins) { if (esc2) esc2 = false; else if (ch === '\\') esc2 = true; else if (ch === '"') ins = false; continue; } if (ch === '"') ins = true; else if (ch === '{' || ch === '[') st2.push(ch); else if (ch === '}' || ch === ']') st2.pop(); }
    return JSON.parse(cut + st2.reverse().map(c => c === '{' ? '}' : ']').join(''));
  }
  async function create(t, p) {
    const nb = cur; p = p || {}; const key = makeKey(t, p, nb);
    const extra = t === 'mcq' ? 2 * (Math.ceil(clamp(p.n || 10, 3, 40) / 15) - 1) : 0;
    await useAi((t === 'links' ? 1 : t === 'report' ? 12 : 3) + extra, t);
    if (t === 'summary') { const C = sampleFor(nb, TOOL_BUDGET, p.focus); const x = await gem(`Tóm tắt tài liệu sau cho học sinh THPT bằng tiếng Việt, trình bày như một tài liệu học tập: (1) 6–10 ý chính có giải thích đầy đủ, (2) thuật ngữ, công thức và số liệu quan trọng (bảng nếu cần), (3) 3–5 điểm dễ nhầm. Ghi [Nguồn n] khi trích. Chỉ dùng nội dung trong nguồn. Không dùng emoji.${p.focus ? ' Trọng tâm: ' + p.focus : ''}\n\n${C}`, { maxTokens: 4500 }); return art(nb, 'summary', 'Tóm tắt', { text: x }, key); }
    if (t === 'flash') { const C = p.focus ? contextFor(nb, p.focus, 8000) + '\n\nTRỌNG TÂM:\n' + p.focus.slice(0, 3000) : sampleFor(nb, TOOL_BUDGET); const j = parseJsonLoose(await gem(`Tạo 12–20 flashcard ôn tập từ tài liệu, bao quát các mục chính (khái niệm, đặc điểm, công thức, số liệu, mốc thời gian, điểm dễ nhầm). Chỉ dùng nội dung trong nguồn.${p.focus ? ' Tập trung vào TRỌNG TÂM.' : ''} Mặt sau (back) trả lời đầy đủ nhưng gọn, 1–3 câu. Không dùng emoji. Trả về DUY NHẤT một mảng JSON: [{"front":"câu hỏi hoặc khái niệm","back":"đáp án"}]\n\n${C}`, { maxTokens: 6000 })); return art(nb, 'flash', 'Flashcard', j.filter(x => x.front && x.back), key); }
    if (t === 'mind' || t === 'tree') {
      const C = sampleFor(nb, MIND_BUDGET, p.focus);
      const j = parseJsonLoose(await gem(PROMPTS.mind(t, p.focus) + '\n\nTÀI LIỆU (Nguồn n là số thứ tự nguồn trong sổ):\n' + C, { maxTokens: 14000, temp: 0.2 }));
      const root = Array.isArray(j) ? { t: nb.title, c: j } : j; if (!root || !root.t) throw new Error('AI chưa dựng được sơ đồ, hãy thử lại.');
      return art(nb, t, t === 'mind' ? 'Sơ đồ tư duy' : 'Cây tri thức', root, key);
    }
    if (t === 'chart') {
      const C = p.focus ? contextFor(nb, p.focus, 9000) : sampleFor(nb, TOOL_BUDGET);
      const j = parseJsonLoose(await gem(`Bạn tạo dữ liệu cho một biểu đồ từ tài liệu bên dưới.${p.focus ? ' Yêu cầu của người dùng: ' + p.focus : ' Hãy chọn bộ số liệu nổi bật, so sánh được nhất.'}\nQUY TẮC: chỉ dùng số liệu CÓ TRONG TÀI LIỆU, tuyệt đối không bịa hay ước lượng. Nếu tài liệu không có đủ số liệu (ít nhất 2 giá trị cùng đơn vị để so sánh) thì trả về {"error":"giải thích ngắn gọn còn thiếu số liệu gì"}.\nNếu đủ, trả về DUY NHẤT một JSON: {"title":"tiêu đề ngắn","type":"bar|hbar|line|pie","xlabel":"","unit":"đơn vị","labels":["nhãn 1","..."],"series":[{"name":"tên chuỗi","values":[số]}],"source":"tên nguồn","note":"1 câu nhận xét xu hướng"}. Tối đa 12 nhãn và 4 chuỗi; values là số thuần (không kèm đơn vị). Chỉ dùng pie khi các giá trị là các phần của một tổng.${p.kind ? ' Bắt buộc type = "' + p.kind + '".' : ''}\n\nTÀI LIỆU:\n${C}`, { maxTokens: 3000, temp: 0.1 }));
      if (!j || j.error || !Array.isArray(j.labels) || j.labels.length < 2) throw new Error(((j && j.error) || 'Nguồn chưa có đủ số liệu để vẽ biểu đồ.') + ' Hãy thêm số liệu vào sổ (ghi chú, tệp, bảng) rồi thử lại.');
      j.type = p.kind || (['bar', 'hbar', 'line', 'pie'].includes(j.type) ? j.type : 'bar');
      return art(nb, 'chart', 'Biểu đồ: ' + (j.title || 'số liệu'), j, key);
    }
    if (t === 'report') { const content = await genReport(nb, p.meta); return art(nb, 'report', 'Báo cáo NCKH: ' + p.meta.title, { meta: p.meta, content }, key); }
    if (t === 'links') return findLinks(nb, key);
    if (QMODE[t]) return genQuizArt(t, p, key);
    if (t === 'mcq') return genMcq(nb, p, key);
    if (t === 'doc') return genDoc(nb, p, key);
  }
  // ---- Đề trắc nghiệm (master prompt 2): chia đợt ≤15 câu, không lặp giữa các đợt
  async function genMcq(nb, p, key) {
    const n = clamp(p.n || 10, 3, 40), level = LEVELS_OK.includes(p.d) ? p.d : 'Trung bình', C = sampleFor(nb, TOOL_BUDGET, p.focus), items = [];
    for (let start = 0, guard = 0; items.length < n && guard < 4; guard++) {
      const want = Math.min(15, n - items.length);
      const raw = await gem(PROMPTS.mcq(want, level, items.map(x => x.q), items.length + 1, n) + (p.focus ? `\nTRỌNG TÂM do học sinh yêu cầu: ${p.focus}` : '') + '\n\nTƯ LIỆU (Nguồn n là số thứ tự nguồn trong sổ):\n' + C, { maxTokens: 9000, temp: 0.5 });
      let arr; try { arr = parseJsonLoose(raw); } catch (e) { if (items.length) break; throw e; } if (!Array.isArray(arr)) arr = arr.items || arr.questions || [];
      arr.forEach(x => {
        const o = Array.isArray(x.o) ? x.o.map(v => String(v).replace(/^\s*[A-Da-d][.)]\s+/, '').trim()) : null; if (!x.q || !o || o.length < 4 || o.some(v => !v)) return;
        let a = Number.isInteger(+x.a) && String(x.a).trim() !== '' ? +x.a : 'ABCD'.indexOf(String(x.a || '').trim().charAt(0).toUpperCase()); if (a < 0 || a > 3) return;
        let oo = o.slice(0, 4), aa = a;
        if (!oo.some(v => /^(cả|tất cả|không có|các phương án)/i.test(v))) { const ord = shuf([0, 1, 2, 3]); oo = ord.map(i => o[i]); aa = ord.indexOf(a); }
        if (items.some(y => y.q.slice(0, 60) === String(x.q).slice(0, 60))) return;
        items.push({ q: String(x.q).trim(), o: oo, a: aa, e: String(x.e || ''), k: String(x.k || ''), tp: String(x.tp || ''), lv: ['NB', 'TH', 'VD', 'VDC'].includes(x.lv) ? x.lv : '', src: String(x.src || '') });
      });
      if (items.length >= n) break;
    }
    if (!items.length) throw new Error('AI chưa tạo được câu hỏi hợp lệ, hãy thử lại.');
    return art(nb, 'mcq', 'Đề trắc nghiệm', { items: items.slice(0, n), level, n: Math.min(n, items.length), focus: p.focus || '' }, key);
  }
  // ---- Tài liệu (Word / Google Docs)
  async function genDoc(nb, p, key) {
    const C = sampleFor(nb, MIND_BUDGET, p.focus);
    const x = await gem(PROMPTS.doc(p.title, p.kind, p.focus) + '\n\nTƯ LIỆU (Nguồn n là số thứ tự nguồn trong sổ):\n' + C, { maxTokens: 10000, temp: 0.3 });
    const text = String(x || '').replace(/```(?:markdown|md)?/gi, '').trim(); if (text.length < 80) throw new Error('AI chưa soạn được tài liệu, hãy thử lại.');
    const m = text.match(/^#\s+(.+)$/m), title = p.title || (m ? m[1].trim() : (p.kind ? p.kind.charAt(0).toUpperCase() + p.kind.slice(1) : 'Tài liệu'));
    return art(nb, 'doc', title.length > 60 ? title.slice(0, 58) + '…' : title, { text, title }, key);
  }
  async function findLinks(nb, key) {
    const ix = index(nb); const q = [nb.title, ...keyPhrases(nb, 4)].filter(Boolean).slice(0, 5), items = [];
    for (const term of q) {
      let w = []; try { w = await wikiRelevant(nb, [term], { min: .5, max: 3 }); } catch (e) {}
      items.push({ term, wiki: w, g: 'https://www.google.com/search?q=' + encodeURIComponent(term), sc: 'https://scholar.google.com/scholar?q=' + encodeURIComponent(term), yt: 'https://www.youtube.com/results?search_query=' + encodeURIComponent(term) });
    }
    return art(nb, 'links', 'Tài liệu tham khảo', items, key);
  }
  // ---- Dữ liệu còn ít: AI hỏi lại người dùng, hoặc cho phép "thu thập và tải lên sau" ----
  const srcChars = nb => nb.sources.filter(s => s.on).reduce((a, s) => a + (s.text || '').length, 0);
  const thinSrc = nb => srcChars(nb) < 1200;
  const TOOLN = { summary: 'tóm tắt', mind: 'sơ đồ tư duy', tree: 'cây tri thức', flash: 'flashcard', doc: 'tài liệu', mcq: 'đề trắc nghiệm', quiz: 'bài thi', links: 'danh sách tài liệu', chart: 'biểu đồ', report: 'báo cáo nghiên cứu' };
  async function gapDialog(t) {
    const nb = cur, have = nb.sources.filter(s => s.on).map(s => s.name + ': ' + (s.text || '').slice(0, 300)).join('\n');
    let qs = ['Chủ đề hoặc vấn đề cụ thể bạn muốn nghiên cứu là gì?', 'Bạn làm cho mục đích gì (bài kiểm tra, KHKT, thuyết trình…) và đối tượng đọc là ai?', 'Bạn đã có kiến thức nền, số liệu hay kết quả nào cần đưa vào?'];
    modal(`<h2>Dữ liệu trong sổ còn ít</h2><div class="nb-note" id="gap-body"><span class="nb-sp"></span> AI đang chọn vài câu hỏi để bổ sung cho ${esc(TOOLN[t] || 'phần này')}…</div>`);
    try {
      if (await useAi(1, 'gap')) {
        const raw = await gem(`Học sinh THPT Việt Nam muốn tạo "${TOOLN[t] || t}" trong sổ nghiên cứu "${nb.title}" nhưng nguồn còn quá ít.\nNguồn hiện có:\n${have || '(chưa có)'}\n\nHãy đặt 3 đến 5 câu hỏi NGẮN, cụ thể, dễ trả lời bằng vài câu, để lấy đúng thông tin còn thiếu. Chỉ trả về mảng JSON các chuỗi tiếng Việt, ví dụ ["…","…"].`, { maxTokens: 500, temp: 0.4 });
        const j = parseJson(raw); if (Array.isArray(j) && j.length) qs = j.map(String).slice(0, 5);
      }
    } catch (e) {}
    window._nbGap = { t, qs };
    modal(`<h2>Dữ liệu trong sổ còn ít</h2><div class="nb-note" style="margin-bottom:10px">Để ${esc(TOOLN[t] || 'phần này')} chính xác hơn, bạn trả lời giúp vài câu, hoặc bổ sung tài liệu sau.</div>
      ${qs.map((q, i) => `<label class="nb-note" style="display:block;margin-top:8px"><b>${i + 1}. ${esc(q)}</b></label><textarea id="gap-${i}" style="min-height:64px" placeholder="Nhập câu trả lời…"></textarea>`).join('')}
      <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:14px"><button class="pbtn" onclick="NB.gapLater()">Tôi sẽ thu thập và tải lên sau</button><button class="pbtn p" onclick="NB.gapGo()">Dùng câu trả lời để tiếp tục</button></div>`);
  }
  async function gapGo() {
    const g = window._nbGap; if (!g) return; const text = g.qs.map((q, i) => `Hỏi: ${q}\nTrả lời: ${(($('gap-' + i) || {}).value || '').trim() || '(chưa trả lời)'}`).join('\n\n');
    if (g.qs.every((q, i) => !(($('gap-' + i) || {}).value || '').trim())) return toast('Hãy trả lời ít nhất một câu, hoặc chọn “Tôi sẽ thu thập và tải lên sau”.');
    if (!addSource(cur, { kind: 'text', name: 'Bổ sung từ người dùng', text })) return;
    closeModal(); openNb(cur.id, true); tool(g.t);
  }
  function gapLater() { closeModal(); toast('Được rồi. Khi có tài liệu, hãy tải lên hoặc chọn từ Kho dữ liệu rồi quay lại.'); addDialog('vault'); }
  async function tool(t) {
    if (t === 'note') return noteEdit();
    if (t === 'report') return reportDialog();
    if (thinSrc(cur)) return gapDialog(t);
    if (t === 'chart') return chartDialog();
    if (QMODE[t]) return quizDialog(t);
    if (t === 'mcq') return mcqDialog();
    if (t === 'doc') return docDialog();
    const key = makeKey(t, {}), ex = cur.arts.find(a => a.key === key);
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
  function mcqDialog() {
    modal(`<h2>${IC('quiz')} Tạo đề trắc nghiệm</h2>
      <label class="nb-note">Số câu (3–40)</label><input type="number" id="nb-qn" min="3" max="40" value="10">
      <label class="nb-note">Mức độ</label><select id="nb-qd"><option value="Cơ bản">Cơ bản (nhiều câu nhận biết, thông hiểu)</option><option value="Trung bình" selected>Trung bình (25% NB · 30% TH · 30% VD · 15% VDC)</option><option value="Nâng cao">Nâng cao (nhiều vận dụng, vận dụng cao)</option><option value="Hỗn hợp">Hỗn hợp (xếp từ dễ đến khó)</option></select>
      <label class="nb-note">Trọng tâm (không bắt buộc)</label><input type="text" id="nb-qf" placeholder="Ví dụ: chương 2, quang hợp, các mốc 1945–1954…">
      <div class="nb-note">Đề được soạn theo chuẩn: đáp án nhiễu hợp lí, có giải thích từng câu, phân loại mức độ nhận thức. Đề trên 15 câu được tạo theo nhiều đợt để không trùng. Tốn 3 lượt AI cho mỗi đợt tối đa 15 câu.</div>
      <div style="text-align:right;margin-top:16px"><button class="pbtn" onclick="NB.closeModal()">Hủy</button> <button class="pbtn p" onclick="NB.make('mcq')">Tạo đề</button></div>`);
  }
  function docDialog() {
    modal(`<h2>${IC('file')} Tạo tài liệu Word / Google Docs</h2>
      <label class="nb-note">Loại tài liệu</label><select id="nb-dk"><option>đề cương ôn tập</option><option>tài liệu học tập</option><option>báo cáo</option><option>bảng so sánh</option><option>sổ tay ngắn gọn</option><option>giáo án</option></select>
      <label class="nb-note">Tiêu đề (không bắt buộc)</label><input type="text" id="nb-dt" placeholder="AI sẽ tự đặt tiêu đề nếu bạn để trống">
      <label class="nb-note">Trọng tâm (không bắt buộc)</label><input type="text" id="nb-df" placeholder="Ví dụ: phần cơ chế và ví dụ minh họa">
      <div class="nb-note">Tài liệu có đề mục đánh số, bảng, trích nguồn và mục tài liệu tham khảo. Sau khi tạo bạn tải được file .docx, hoặc mở Google Docs để dán vào. Tốn 3 lượt AI.</div>
      <div style="text-align:right;margin-top:16px"><button class="pbtn" onclick="NB.closeModal()">Hủy</button> <button class="pbtn p" onclick="NB.make('doc')">Tạo tài liệu</button></div>`);
  }
  async function make(t) {
    const p = t === 'mcq' ? { n: clamp(parseInt($('nb-qn').value, 10) || 10, 3, 40), d: $('nb-qd').value, focus: $('nb-qf').value.trim() } : { kind: $('nb-dk').value, title: $('nb-dt').value.trim(), focus: $('nb-df').value.trim() };
    const key = makeKey(t, p), ex = cur.arts.find(a => a.key === key);
    if (ex) { const c = await choose('Đã có bản giống hệt', 'Mở lại để không tốn thêm lượt AI, hoặc tạo bản mới.', ['Mở bản cũ', 'Tạo mới']); if (c === 0) { closeModal(); return openArt(ex.id); } }
    try { const a = await runBusy(t === 'mcq' ? 'Đang soạn đề trắc nghiệm…' : 'Đang soạn tài liệu…', () => create(t, p)); openNb(cur.id, true); openArt(a.id); } catch (e) { toast(e.message); }
  }
  async function genQuiz(t) {
    const p = { n: Math.max(3, Math.min(30, parseInt($('nb-qn').value, 10) || 10)), d: $('nb-qd').value, w: $('nb-qw').checked };
    const key = makeKey(t, p), ex = cur.arts.find(a => a.key === key);
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
    const a = cur.arts.find(x => x.id === id); if (!a) return;
    if (a.type === 'mcq') mcqStart(a); else if (a.type === 'doc') docView(a); else if (a.type === 'mind' || a.type === 'tree') treeView(a); else if (a.type === 'chart') chartView(a); else if (a.type === 'report') reportView(a); else openArt0(id);
    if (a.type !== 'note' && a.type !== 'report' && a.type !== 'chart') addBar(a);
  }
  function openArt0(id) {
    const a = cur.arts.find(x => x.id === id); if (!a) return; const ic = IC(ART_IC[a.type] || 'file');
    if (a.type === 'summary') modal(`<h2>${ic} ${esc(a.title)}</h2><div class="nb-m a" style="max-width:none;margin:0"><div class="bd">${md(a.data.text)}</div></div><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px"><button class="pbtn" onclick="NB.ask('Giải thích kỹ hơn phần quan trọng nhất của bản tóm tắt vừa tạo');NB.closeModal()">Hỏi thêm về bản tóm tắt</button><button class="pbtn" onclick="NB.closeModal()">Đóng</button></div>`);
    else if (a.type === 'note') noteEdit(a.id);
    else if (a.type === 'flash') { window._fc = { a, i: 0 }; fcRender(); }
    else if (a.type === 'mind' || a.type === 'tree') treeView(a);
    else if (a.type === 'links') modal(`<h2>${ic} ${esc(a.title)}</h2><div class="nb-note" style="margin-bottom:6px">Kết quả Wikipedia đã được lọc theo độ liên quan với nội dung nguồn của bạn. Các nút Google, Scholar, YouTube mở trang tìm kiếm cho từ khóa đó.</div>${a.data.map(it => `<div style="margin:16px 0"><b>${esc(it.term)}</b>${it.wiki.map(w => `<div style="display:flex;gap:8px;align-items:flex-start;margin:6px 0"><span class="chip" style="padding:2px 8px">${Math.round(w.score * 100)}%</span><span style="flex:1">${aTag(w.url, w.title).replace('<a ', '<a style="color:var(--accent);font-weight:600" ')}<br><span class="nb-note">${esc(w.snippet.slice(0, 120))}…</span></span><button class="pbtn sm" onclick="NB.wikiAdd('${esc(w.title).replace(/'/g, '&#39;')}')">Thêm vào nguồn</button></div>`).join('') || '<div class="nb-note">Không có bài Wikipedia đủ liên quan.</div>'}<div style="margin-top:6px">${[['g', 'Google'], ['sc', 'Scholar'], ['yt', 'YouTube']].map(x => `<a class="lnk" style="display:inline-flex;gap:4px;color:var(--accent);margin-right:12px;font-weight:600;font-size:13px" href="${it[x[0]]}" target="_blank" rel="noopener noreferrer">${x[1]} ${IC('external')}</a>`).join('')}</div></div>`).join('')}${closeBtn()}`);
    else if (a.type === 'quiz') quizView(a);
  }
  async function wikiAdd(title) { try { const w = { title, url: 'https://vi.wikipedia.org/wiki/' + encodeURIComponent(title.replace(/ /g, '_')) }; const t = await wikiText(title); if (addSource(cur, { kind: 'wiki', name: 'Wikipedia: ' + title, url: w.url, text: t })) { toast('Đã thêm vào nguồn.'); openNb(cur.id, true); } } catch (e) { toast(e.message); } }
  function fcRender() {
    const { a, i } = window._fc, c = a.data[i];
    modal(`<h2>${IC('cards')} ${esc(a.title)} <small class="nb-note" style="font-weight:500">${i + 1}/${a.data.length}</small></h2><div class="nb-fc" onclick="this.classList.toggle('f')"><div><div class="s">${esc(c.front)}</div><div class="s b">${esc(c.back)}</div></div></div>
      <div style="display:flex;justify-content:space-between"><button class="pbtn" onclick="NB.fc(-1)">Trước</button><button class="pbtn" onclick="NB.closeModal()">Đóng</button><button class="pbtn p" onclick="NB.fc(1)">Tiếp</button></div>`);
    addBar(window._fc.a);
  }
  function fc(d) { const f = window._fc; f.i = (f.i + d + f.a.data.length) % f.a.data.length; fcRender(); }
  const KLAB = { core: 'Trọng tâm', sup: 'Bổ trợ', ext: 'Mở rộng' };
  function countNodes(n) { return 1 + (n.c || []).reduce((a, x) => a + countNodes(x), 0); }
  function treeView(a) {
    const isMind = a.type === 'mind';
    modal(`<h2>${IC(ART_IC[a.type])} ${esc(a.title)} <small class="nb-note" style="font-weight:500">${countNodes(a.data)} nút · ${isMind ? 'sơ đồ tư duy' : 'cây tri thức'}</small></h2>
      <div class="nb-tbar"><button class="pbtn sm" onclick="_tr.fit()">Vừa khung</button><button class="pbtn sm" onclick="_tr.openAll()">Mở tất cả</button><button class="pbtn sm" onclick="_tr.closeAll()">Thu gọn</button><button class="pbtn sm" onclick="_tr.zoom(1.25)" aria-label="Phóng to">+</button><button class="pbtn sm" onclick="_tr.zoom(.8)" aria-label="Thu nhỏ">–</button><button class="pbtn sm" onclick="NB.grPng()">Tải ảnh PNG</button><span class="nb-note">${isMind ? 'Kéo để di chuyển, cuộn để thu phóng, bấm nút để mở hoặc thu gọn nhánh.' : 'Mỗi thẻ là một khái niệm; viền đậm là trọng tâm, nét đứt là mở rộng.'}</span></div>
      <div class="nb-gx" id="nb-tr" style="height:min(64vh,640px);border:1px solid var(--line);border-radius:20px;background:var(--bg2);overflow:hidden"></div><div id="nb-trd" class="nb-tdesc">Bấm vào một nút để xem mô tả.</div>${closeBtn()}`, 'wide');
    treeDraw(a);
  }
  function treeDraw(a) {
    window._trA = a;
    window._tr = GRAPH.render(a.type, $('nb-tr'), a.data, { onSelect: n => {
      const cites = n.s ? String(n.s).match(/\d+/g) || [] : [];
      $('nb-trd').innerHTML = `<b>${esc(n.t)}</b>${n.k && KLAB[n.k] ? ` <span class="chip gray">${KLAB[n.k]}</span>` : ''}${n.d ? `<p>${esc(n.d)}</p>` : ''}${n.x ? `<p class="nb-note">${esc(n.x)}</p>` : ''}${cites.length ? `<p class="nb-note">Nguồn: ${cites.map(c => `<button class="cite" onclick="NB.closeModal();NB.cite(${+c})">${+c}</button>`).join('')}</p>` : ''}`;
    } });
  }
  async function grPng() { try { const b = await window._tr.png(2); DOCGEN.download(b, DOCGEN.fname((window._trA && window._trA.title) || 'so-do') + '.png'); } catch (e) { toast(e.message); } }
  // ---------- đề trắc nghiệm: làm bài, nộp, xem giải thích ----------
  const LV_NAME = { NB: 'Nhận biết', TH: 'Thông hiểu', VD: 'Vận dụng', VDC: 'Vận dụng cao' };
  function mcqStart(a) { window._mq = { a, ans: {}, done: false }; mcqPaint(); }
  function mcqPaint(keepScroll) {
    const { a, ans, done } = window._mq, d = a.data, N = d.items.length, L = 'ABCD', old = document.querySelector('#nb-ov .nb-box'), top = old ? old.scrollTop : 0;
    const score = d.items.filter((x, i) => ans[i] === x.a).length, pct = Math.round(score / N * 100), got = Object.keys(ans).length;
    modal(`<h2>${IC('quiz')} ${esc(a.title)} <small class="nb-note" style="font-weight:500">${N} câu · mức ${esc(d.level || 'Trung bình')}</small></h2>
      ${done ? `<div class="nb-score"><b>${score}/${N}</b><span>${pct}% đúng</span><i><u style="width:${pct}%"></u></i></div>` : `<div class="nb-note" style="margin-bottom:6px">Đã chọn ${got}/${N} câu. Chọn một đáp án cho mỗi câu rồi bấm Nộp bài để xem đáp án và giải thích. AI có thể sai, hãy đối chiếu với tài liệu.</div>`}
      ${d.items.map((x, i) => `<div class="mq" id="mq-${i}"><div class="t"><b>Câu ${i + 1}.</b> ${esc(x.q)}${x.lv ? ` <span class="chip gray">${LV_NAME[x.lv]}</span>` : ''}</div>
        ${x.o.map((o, j) => { const sel = ans[i] === j; return `<button class="mo ${sel ? 'sel' : ''} ${done ? (j === x.a ? 'ok' : (sel ? 'bad' : '')) : ''}" ${done ? 'disabled' : ''} onclick="NB.mq(${i},${j})"><b>${L[j]}</b><span>${esc(o)}</span></button>`; }).join('')}
        ${done ? `<div class="mx"><b>Đáp án đúng: ${L[x.a]}.</b> ${ans[i] === undefined ? '<i>(bạn chưa chọn)</i>' : ''}<div>${md(x.e || '')}</div>${x.k ? `<div><b>Cần nhớ:</b> ${esc(x.k)}</div>` : ''}<small>${[x.tp, x.src].filter(Boolean).map(esc).join(' · ')}</small></div>` : ''}</div>`).join('')}
      <div class="nb-end">${done ? `<button class="pbtn" onclick="NB.mqReset()">Làm lại</button>` : `<button class="pbtn p" onclick="NB.mqSubmit()">Nộp bài</button>`}<button class="pbtn" onclick="NB.mqWord(0)">Tải đề (.docx)</button><button class="pbtn" onclick="NB.mqWord(1)">Tải đề + đáp án (.docx)</button><button class="pbtn" onclick="NB.closeModal()">Đóng</button></div>`, 'wide');
    addBar(a); const nb = document.querySelector('#nb-ov .nb-box'); if (nb && keepScroll) nb.scrollTop = top;
  }
  function mq(i, j) { const m = window._mq; if (m.done) return; m.ans[i] = j; mcqPaint(true); }
  function mqSubmit() { const m = window._mq, N = m.a.data.items.length, got = Object.keys(m.ans).length; if (got < N && !confirm(`Bạn mới chọn ${got}/${N} câu. Vẫn nộp bài?`)) return; m.done = true; m.a.data.last = { score: m.a.data.items.filter((x, i) => m.ans[i] === x.a).length, n: N, ts: Date.now() }; saveDb(); mcqPaint(); const b = document.querySelector('#nb-ov .nb-box'); if (b) b.scrollTop = 0; }
  function mqReset() { mcqStart(window._mq.a); }
  function mcqMd(a, withAns) {
    const d = a.data, L = 'ABCD'; let t = `# ${a.title}\n\nMức độ: ${d.level || 'Trung bình'} · Số câu: ${d.items.length}\n\n`;
    d.items.forEach((x, i) => { t += `**Câu ${i + 1}.** ${x.q}\n\n` + x.o.map((o, j) => `${L[j]}. ${o}`).join('\n\n') + '\n\n'; });
    if (withAns) {
      t += `## Bảng đáp án\n\n| Câu | Đáp án | Chủ đề | Mức độ |\n|---|---|---|---|\n` + d.items.map((x, i) => `| ${i + 1} | ${L[x.a]} | ${(x.tp || '').replace(/\|/g, '/')} | ${LV_NAME[x.lv] || ''} |`).join('\n') + '\n\n## Giải thích chi tiết\n\n';
      d.items.forEach((x, i) => { t += `**Câu ${i + 1}. Đáp án ${L[x.a]}.** ${x.e || ''}${x.k ? ' *Cần nhớ:* ' + x.k : ''}\n\n`; });
    }
    return t;
  }
  async function mqWord(withAns) { const a = window._mq.a; try { toast('Đang tạo file Word…'); DOCGEN.download(await DOCGEN.toDocx(a.title, mcqMd(a, !!withAns)), DOCGEN.fname(a.title) + (withAns ? '-dap-an' : '') + '.docx'); } catch (e) { toast('Không tạo được file Word: ' + e.message); } }
  // ---------- tài liệu ----------
  // ---- Biểu đồ (số liệu lấy từ nguồn, vẽ SVG, xuất PNG/SVG/CSV) ----
  function chartDialog() {
    modal(`<h2>${IC('chart')} Tạo biểu đồ</h2>
      <label class="nb-note">Bạn muốn biểu đồ thể hiện điều gì?</label><textarea id="nb-cf" rows="3" placeholder="Ví dụ: so sánh số liệu qua các năm; tỉ lệ các thành phần; kết quả thí nghiệm. Để trống để AI tự chọn bộ số liệu nổi bật nhất trong nguồn."></textarea>
      <label class="nb-note" style="margin-top:10px">Kiểu biểu đồ</label><select id="nb-ct"><option value="">AI tự chọn</option>${CHART.TYPES.map(t => `<option value="${t[0]}">${t[1]}</option>`).join('')}</select>
      <div class="nb-note">AI chỉ lấy số liệu có trong nguồn của sổ, không tự bịa. Tốn 3 lượt AI. Tạo xong bạn đổi được kiểu biểu đồ, tải ảnh PNG, SVG hoặc dữ liệu CSV, và biểu đồ tự được chèn vào mục Kết quả của báo cáo NCKH.</div>
      <div style="text-align:right;margin-top:16px"><button class="pbtn" onclick="NB.closeModal()">Hủy</button> <button class="pbtn p" onclick="NB.makeChart()">Tạo biểu đồ</button></div>`);
  }
  async function makeChart() {
    const p = { focus: $('nb-cf').value.trim(), kind: $('nb-ct').value };
    try { const a = await runBusy('Đang tìm số liệu và dựng biểu đồ…', () => create('chart', p)); openNb(cur.id, true); openArt(a.id); } catch (e) { toast(e.message); }
  }
  function chartView(a) {
    const d = a.data;
    modal(`<h2>${IC('chart')} ${esc(a.title)}</h2>
      <div class="nb-tbar">${CHART.TYPES.map(t => `<button class="pbtn sm ${d.type === t[0] ? 'p' : ''}" data-ct="${t[0]}" onclick="NB.chType('${a.id}','${t[0]}')">${t[1]}</button>`).join('')}</div>
      <div id="ch-box" style="background:#fff;border-radius:14px;overflow:auto;border:1px solid var(--border)"></div>
      ${d.note ? `<div class="nb-note" style="margin-top:8px">${esc(d.note)}</div>` : ''}
      <div class="nb-end"><button class="pbtn p" onclick="NB.chDl('${a.id}','png')">Tải ảnh PNG</button><button class="pbtn" onclick="NB.chDl('${a.id}','svg')">Tải SVG</button><button class="pbtn" onclick="NB.chDl('${a.id}','csv')">Dữ liệu CSV</button><button class="pbtn" onclick="NB.closeModal()">Đóng</button></div>`);
    chPaint(a);
  }
  function chPaint(a) { const b = $('ch-box'); if (!b) return; b.innerHTML = CHART.svg(a.data, a.data.type); const s = b.firstChild; if (s && s.style) s.style.cssText = 'width:100%;height:auto;display:block'; }
  function chType(id, t) { const a = artOf(id); if (!a) return; a.data.type = t; saveDb(); chPaint(a); document.querySelectorAll('#nb-ov [data-ct]').forEach(b => b.classList.toggle('p', b.dataset.ct === t)); }
  async function chDl(id, f) {
    const a = artOf(id); if (!a) return; const nm = DOCGEN.fname(a.data.title || 'bieu-do'), s = CHART.svg(a.data, a.data.type);
    try { if (f === 'svg') DOCGEN.download(new Blob([s], { type: 'image/svg+xml' }), nm + '.svg'); else if (f === 'csv') DOCGEN.download(new Blob(['\ufeff' + CHART.csv(a.data)], { type: 'text/csv;charset=utf-8' }), nm + '.csv'); else DOCGEN.download(await CHART.png(s, 3), nm + '.png'); } catch (e) { toast(e.message); }
  }
  async function chartFigs() {
    const out = []; for (const a of cur.arts.filter(x => x.type === 'chart').slice(0, 4).reverse()) { try { const b = await CHART.png(CHART.svg(a.data, a.data.type), 2); out.push({ png: new Uint8Array(await b.arrayBuffer()), w: 520, h: Math.round(520 * 440 / 760), title: a.data.title || 'Biểu đồ', src: a.data.source || '' }); } catch (e) {} } return out;
  }
  // ---- Báo cáo nghiên cứu khoa học theo mẫu (bìa, mục lục, 4 phần, tài liệu tham khảo, phụ lục) ----
  function reportDialog() {
    const D = REPORT.DEF, f = (id, l, v, ph) => `<label class="nb-note" style="display:block;margin-top:8px">${l}</label><input type="text" id="${id}" value="${esc(v || '')}" placeholder="${esc(ph || '')}">`;
    modal(`<h2>${IC('file')} Báo cáo nghiên cứu khoa học</h2>
      <div class="nb-note">Tạo báo cáo theo mẫu chuẩn: trang bìa, mục lục, Tóm tắt, 4 phần chính, tài liệu tham khảo, phụ lục. AI điền nội dung từ các nguồn trong sổ (ghi chú, Word, PDF, Kho dữ liệu…). Chỗ chưa có thông tin sẽ để dòng “[Cần bổ sung: …]” để bạn tự điền, AI không bịa số liệu. Tốn khoảng 12 lượt AI.</div>
      ${f('rp-title', 'Tên đề tài', cur.title)}${f('rp-field', 'Lĩnh vực', '', 'Ví dụ: Phần mềm hệ thống / Giáo dục')}
      <label class="nb-note" style="display:block;margin-top:8px">Tác giả (mỗi dòng một người, dạng: Họ và tên - Lớp)</label><textarea id="rp-au" rows="2" placeholder="Nguyễn Văn A - 11 Sinh">${esc(userName() || '')}</textarea>
      ${f('rp-te', 'Giáo viên hướng dẫn', '', 'Họ tên giáo viên')}${f('rp-ct', 'Tên cuộc thi', '', 'Nhập tên cuộc thi bạn tham gia')}${f('rp-sc', 'Trường', '', 'Nhập tên trường')}${f('rp-pv', 'Tỉnh / thành phố', '', 'Nhập tỉnh hoặc thành phố')}${f('rp-yr', 'Năm học', '', 'Ví dụ: 2026 – 2027')}
      <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:16px"><button class="pbtn" onclick="NB.closeModal()">Hủy</button><button class="pbtn" onclick="NB.rpBlank()">Chỉ tải mẫu trống</button><button class="pbtn p" onclick="NB.makeReport()">Viết báo cáo bằng AI</button></div>`);
  }
  function rpMetaForm() {
    const v = id => ($(id) || {}).value || '', au = v('rp-au').split('\n').map(s => s.trim()).filter(Boolean).map(s => { const k = s.split(/\s*[-–—,;\t]\s*/); return { n: k[0], c: k.slice(1).join(' ') }; });
    const pv = v('rp-pv').trim(), D = REPORT.DEF, up = s => s.trim().toUpperCase();
    return { title: v('rp-title').trim() || D.title, field: 'Lĩnh vực: ' + (v('rp-field').trim() || '…………………………………'), authors: au.length ? au : D.authors, teacher: 'Giáo viên hướng dẫn: ' + (v('rp-te').trim() || '…………………'), contest: v('rp-ct').trim() ? up(v('rp-ct')) : D.contest, school: v('rp-sc').trim() ? up(v('rp-sc')) : D.school, org: pv ? 'SỞ GIÁO DỤC VÀ ĐÀO TẠO ' + up(pv) : D.org, place: pv || D.place, year: v('rp-yr').trim() ? (/năm/i.test(v('rp-yr')) ? v('rp-yr').trim() : 'Năm học ' + v('rp-yr').trim()) : D.year, date: new Date().getFullYear() + '' };
  }
  async function rpBlank() {
    const meta = rpMetaForm(); try { toast('Đang tạo mẫu Word…'); const b = await REPORT.build(await DOCGEN.loadDocx(), meta, { figures: [] }, { hints: true }); DOCGEN.download(b, 'Mau_bao_cao_NCKH.docx'); closeModal(); } catch (e) { toast('Không tạo được file Word: ' + e.message); }
  }
  async function makeReport() {
    if (thinSrc(cur)) { closeModal(); return gapDialog('report'); }
    const meta = rpMetaForm();
    try { const a = await runBusy('AI đang viết báo cáo từng phần (khoảng 1–2 phút)…', () => create('report', { meta })); openNb(cur.id, true); openArt(a.id); } catch (e) { toast(e.message); }
  }
  async function genReport(nb, meta) {
    const leaves = REPORT.LEAVES.filter(s => !s.refs && s.id !== 'abs' && s.id !== 'app'), out = {}, chunks = [];
    for (let i = 0; i < leaves.length; i += 5) chunks.push(leaves.slice(i, i + 5));
    const lab = 'Đề tài: "' + meta.title + '" · ' + meta.field;
    for (const ch of chunks) {
      const C = contextFor(nb, ch.map(s => s.t + ' ' + (s.g || '')).join(' ') + ' ' + nb.title, 12000);
      const list = ch.map(s => `- "${s.id}" — ${s.t.replace(/^[\d.]+\s*/, '')} (khoảng ${s.w || 150} từ): ${s.g || ''}`).join('\n');
      let j = {}; try { j = parseJsonLoose(await gem(`Bạn viết một báo cáo nghiên cứu khoa học của học sinh THPT Việt Nam. ${lab}.\nViết các mục sau bằng tiếng Việt, văn phong khoa học, rõ ràng, dùng "nhóm tác giả" hoặc ngôi thứ ba:\n${list}\n\nQUY TẮC BẮT BUỘC:\n1. Chỉ dùng thông tin có trong TÀI LIỆU bên dưới. Không bịa số liệu, kết quả thí nghiệm, tên người, trích dẫn.\n2. Nếu tài liệu thiếu thông tin cho một ý, hãy viết phần có thể viết được rồi chèn MỘT dòng riêng dạng: [Cần bổ sung: nêu cụ thể cần thông tin gì].\n3. Khi dùng thông tin từ nguồn, ghi [n] theo số thứ tự nguồn (Nguồn n).\n4. Có thể dùng danh sách gạch đầu dòng "- " hoặc bảng markdown khi phù hợp. Không dùng tiêu đề (#) trong nội dung.\nTrả về DUY NHẤT một JSON object {"<id>":"nội dung", ...} với các id đã nêu.\n\nTÀI LIỆU:\n${C}`, { maxTokens: 7000, temp: 0.3 })); } catch (e) {}
      ch.forEach(s => { out[s.id] = j && j[s.id] ? String(j[s.id]).trim() : '[Cần bổ sung: AI chưa viết được mục này, hãy nhập nội dung hoặc tạo lại.]'; });
    }
    try { const sm = Object.keys(out).map(k => k + ': ' + out[k].slice(0, 500)).join('\n'); out.abs = (await gem(`Dựa trên nội dung báo cáo dưới đây, viết phần TÓM TẮT 200–250 từ bằng tiếng Việt (vấn đề, phương pháp, kết quả chính, đóng góp). Không bịa thêm; chỗ thiếu thì ghi [Cần bổ sung: …]. Chỉ trả về đoạn văn.\nĐề tài: ${meta.title}\n\n${sm}`, { maxTokens: 1200, temp: 0.3 })).trim(); } catch (e) { out.abs = '[Cần bổ sung: Tóm tắt 200–300 từ.]'; }
    out.ref = nb.sources.map((s, i) => s.on ? `[${i + 1}] ${s.name}${s.url ? '. Truy cập: ' + s.url : ''}` : '').filter(Boolean).join('\n\n');
    return out;
  }
  const rpGaps = c => (Object.values(c || {}).join('\n').match(/\[Cần bổ sung/g) || []).length;
  function reportView(a) {
    const d = a.data, c = d.content || {}, m = d.meta || {}, gaps = rpGaps(c);
    const mf = (k, l) => `<label class="nb-note" style="display:block;margin-top:6px">${l}</label><input type="text" data-m="${k}" value="${esc(m[k] || '')}" oninput="NB.rpMeta('${a.id}',this)">`;
    modal(`<h2>${IC('file')} ${esc(a.title)}</h2>
      <div class="nb-note" style="margin-bottom:8px">${gaps ? `Còn <b>${gaps}</b> chỗ cần bổ sung (dòng “[Cần bổ sung: …]”). Mở từng mục bên dưới để sửa trực tiếp, rồi tải file Word.` : 'Đã có nội dung cho mọi mục. Kiểm tra lại số liệu trước khi nộp.'}</div>
      <div class="nb-scroll" style="max-height:52vh">
        <details><summary><b>Trang bìa</b></summary>${mf('title', 'Tên đề tài')}${mf('field', 'Lĩnh vực')}${mf('teacher', 'Giáo viên hướng dẫn')}${mf('contest', 'Tên cuộc thi')}${mf('school', 'Trường')}${mf('org', 'Sở giáo dục (dòng đầu bìa)')}${mf('place', 'Tỉnh / thành phố')}${mf('year', 'Năm học')}</details>
        ${REPORT.LEAVES.map(s => `<details ${/\[Cần bổ sung/.test(c[s.id] || '') ? 'open' : ''}><summary>${esc(s.t)}${/\[Cần bổ sung/.test(c[s.id] || '') ? ' <span class="nb-note">· cần bổ sung</span>' : ''}</summary><textarea rows="${Math.min(14, Math.max(4, Math.ceil((c[s.id] || '').length / 90)))}" data-id="${s.id}" oninput="NB.rpEdit('${a.id}',this)">${esc(c[s.id] || '')}</textarea></details>`).join('')}
      </div>
      <div class="nb-end"><button class="pbtn p" onclick="NB.rpDl('${a.id}')">Tải .docx</button><button class="pbtn" onclick="NB.closeModal()">Đóng</button></div>`);
  }
  let rpT; function rpEdit(id, el) { const a = artOf(id); if (!a) return; a.data.content[el.dataset.id] = el.value; clearTimeout(rpT); rpT = setTimeout(saveDb, 600); }
  function rpMeta(id, el) { const a = artOf(id); if (!a) return; a.data.meta[el.dataset.m] = el.value; clearTimeout(rpT); rpT = setTimeout(saveDb, 600); }
  async function rpDl(id) {
    const a = artOf(id); if (!a) return; try { toast('Đang tạo file Word…'); const figs = await chartFigs(), b = await REPORT.build(await DOCGEN.loadDocx(), a.data.meta, Object.assign({}, a.data.content, { figures: figs }), { hints: true }); DOCGEN.download(b, DOCGEN.fname(a.data.meta.title || 'Bao cao NCKH') + '.docx'); } catch (e) { toast('Không tạo được file Word: ' + e.message); }
  }
  function docView(a) {
    modal(`<h2>${IC('file')} ${esc(a.title)}</h2><div class="nb-doc">${DOCGEN.md(a.data.text)}</div>
      <div class="nb-end"><button class="pbtn p" onclick="NB.docDl('${a.id}')">Tải .docx</button><button class="pbtn" onclick="NB.docG('${a.id}')">Mở Google Docs</button><button class="pbtn" onclick="NB.docPdf('${a.id}')">In / PDF</button><button class="pbtn" onclick="NB.docCopy('${a.id}')">Sao chép</button>${DOCGEN.hasTable(a.data.text) ? `<button class="pbtn" onclick="NB.docCsv('${a.id}')">Bảng .csv</button>` : ''}<button class="pbtn" onclick="NB.closeModal()">Đóng</button></div>`, 'wide');
  }
  const artOf = id => cur.arts.find(x => x.id === id);
  async function docDl(id) { const a = artOf(id); try { toast('Đang tạo file Word…'); DOCGEN.download(await DOCGEN.toDocx(a.data.title || a.title, a.data.text, { author: (userName() || 'Olym63') }), DOCGEN.fname(a.data.title || a.title) + '.docx'); } catch (e) { toast('Không tạo được file Word: ' + e.message); } }
  async function docG(id) { const a = artOf(id); try { await DOCGEN.toGoogleDocs(a.data.text); toast('Đã mở Google Docs mới. Nhấn Ctrl+V (hoặc Cmd+V) để dán, định dạng sẽ được giữ nguyên.'); } catch (e) { window.open('https://docs.new', '_blank', 'noopener'); toast('Hãy sao chép nội dung rồi dán vào Google Docs.'); } }
  function docPdf(id) { const a = artOf(id); if (!DOCGEN.printPdf(a.title, a.data.text)) toast('Trình duyệt chặn cửa sổ mới, hãy cho phép pop-up.'); }
  function docCopy(id) { const a = artOf(id); DOCGEN.copyRich(a.data.text).then(() => toast('Đã sao chép (giữ định dạng khi dán vào Word hoặc Google Docs).'), () => (navigator.clipboard ? navigator.clipboard.writeText(a.data.text) : Promise.reject()).then(() => toast('Đã sao chép văn bản.'), () => toast('Không sao chép được.'))); }
  function docCsv(id) { const a = artOf(id); DOCGEN.download(new Blob(['\ufeff' + DOCGEN.csv(a.data.text)], { type: 'text/csv;charset=utf-8' }), DOCGEN.fname(a.title) + '.csv'); }
  const userName = () => { try { const u = AUTH.getCurrentUser(); return u && (u.full_name || u.username); } catch (e) { return ''; } };
  // ---------- mở tab mới + chia sẻ link ----------
  const payload = a => ({ type: a.type, title: a.title, data: JSON.parse(JSON.stringify(a.data, (k, v) => (k[0] === '_' ? undefined : v))) });
  const viewUrl = frag => location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, '') + 'view.html' + frag;
  const online = () => { try { return AUTH.backendReady() && AUTH.getCurrentUser(); } catch (e) { return false; } };
  async function serverShare(a) { const r = await AUTH.apiFetch('/share', { method: 'POST', body: JSON.stringify(payload(a)) }); a.shareId = r.id; saveDb(); return r.id; }
  async function newTab(id) {
    const a = artOf(id); if (!a) return; const w = window.open('about:blank', '_blank');
    if (!w) return toast('Trình duyệt chặn cửa sổ mới, hãy cho phép pop-up cho trang này.');
    try {
      let frag; if (a.shareId) frag = '#s=' + a.shareId; else { const pk = await DOCGEN.pack(payload(a)); if (pk.length < 120000) frag = '#d=' + pk; else if (online()) frag = '#s=' + await serverShare(a); else throw new Error('Nội dung quá lớn để mở ở tab mới khi chưa kết nối máy chủ.'); }
      w.location.href = viewUrl(frag);
    } catch (e) { w.close(); toast(e.message); }
  }
  async function shareDlg(id) {
    const a = artOf(id); if (!a) return;
    modal(`<h2>${IC('link')} Chia sẻ để cùng học</h2><div id="nb-sh" class="nb-note"><span class="nb-sp"></span> Đang tạo liên kết…</div>`);
    try {
      let link, srv = false;
      if (online()) { const sid = a.shareId || await serverShare(a); link = viewUrl('#s=' + sid); srv = true; }
      else link = viewUrl('#d=' + await DOCGEN.pack(payload(a)));
      $('nb-sh').outerHTML = `<div id="nb-sh"><p class="nb-note">Bất kỳ ai có liên kết đều xem được bản này (không cần đăng nhập). ${srv ? 'Nội dung được lưu trên máy chủ; bạn có thể thu hồi bất cứ lúc nào.' : 'Hiện chưa kết nối máy chủ nên nội dung được nhúng trong chính liên kết (liên kết sẽ dài).'}</p><input type="text" id="nb-shl" readonly value="${esc(link)}" onclick="this.select()"><p class="nb-note">Người xem được: ${a.type === 'mcq' ? 'làm bài trắc nghiệm và xem giải thích' : a.type === 'flash' ? 'lật flashcard' : a.type === 'mind' || a.type === 'tree' ? 'xem sơ đồ dạng cây có thể thu gọn' : 'đọc, tải về Word, in'}. Họ không sửa được sổ của bạn.</p>
        <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:14px">${srv ? `<button class="pbtn" onclick="NB.unshare('${a.id}')">Thu hồi liên kết</button>` : ''}<button class="pbtn" onclick="window.open(document.getElementById('nb-shl').value,'_blank')">Mở thử</button><button class="pbtn p" onclick="NB.copyLink()">Sao chép liên kết</button></div></div>`;
    } catch (e) { $('nb-sh').innerHTML = esc('Không tạo được liên kết: ' + e.message); }
  }
  function copyLink() { const i = $('nb-shl'); i.select(); (navigator.clipboard ? navigator.clipboard.writeText(i.value) : Promise.reject()).then(() => toast('Đã sao chép liên kết.'), () => { document.execCommand('copy'); toast('Đã sao chép liên kết.'); }); }
  async function unshare(id) { const a = artOf(id); if (!a || !a.shareId) return closeModal(); try { await AUTH.apiFetch('/share/' + a.shareId, { method: 'DELETE' }); delete a.shareId; saveDb(); closeModal(); toast('Đã thu hồi liên kết.'); } catch (e) { toast(e.message); } }
  function addBar(a) {
    const box = document.querySelector('#nb-ov .nb-box'); if (!box || box.querySelector('.nb-bar')) return;
    const d = document.createElement('div'); d.className = 'nb-bar'; d.innerHTML = `<button class="pbtn sm" onclick="NB.newTab('${a.id}')">${IC('external')} Mở tab mới</button><button class="pbtn sm" onclick="NB.shareDlg('${a.id}')">${IC('link')} Chia sẻ link</button>`; box.insertBefore(d, box.firstChild);
  }
  function quizView(a) {
    const d = a.data;
    modal(`<h2>${IC('quiz')} ${esc(a.title)} <small class="nb-note" style="font-weight:500">${d.items.length} câu</small></h2>
      <div class="nb-note" style="margin-bottom:8px">AI có thể sai. Hãy đối chiếu đáp án với tài liệu và xóa câu không ổn trước khi chơi. Ván chơi bằng đề này không tính vào bảng xếp hạng và dữ liệu nghiên cứu.</div>
      ${d.items.map((x, i) => `<div class="nb-q"><div class="t">${i + 1}. ${esc(x.q)}${x.pts ? ` <b>(${x.pts} điểm)</b>` : ''}<small>Đáp án: <b>${esc(x.a)}</b>${x.src ? ' · ' + esc(x.src) : ''}</small></div><button class="nb-x" title="Xóa câu" onclick="NB.qdel('${a.id}',${i})">${IC('trash')}</button></div>`).join('')}
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px"><button class="pbtn" onclick="NB.closeModal()">Đóng</button><button class="pbtn p" onclick="NB.play('${a.id}')">${IC('play')} Chơi ngay</button></div>`);
    addBar(a);
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

  return { gapGo, gapLater, open, create: createNb, openNb, del, rename, pane: showPane, colToggle, addDialog, closeModal, toggleSrc, delSrc, delArt, addFiles, addYt, addWeb, grPng, addText, wikiFind, addWiki, wikiAdd, addRound, fromRound, ask, tool, genQuiz, openArt, fc, qdel, play, saveRound, buildPlay, back, cite, preview, attach, paste, unatt, copyMsg, msgNote, msgFlash, act, noteSave, depth, make, mq, mqSubmit, mqReset, mqWord, docDl, makeChart, chType, chDl, makeReport, rpBlank, rpEdit, rpMeta, rpDl, docG, docPdf, docCopy, docCsv, newTab, shareDlg, copyLink, unshare, _intent: intent, _md: md, _feats: feats, _useAi: useAi };
})();
