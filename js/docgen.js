// ============================================================
// DOCGEN — Markdown → HTML / Word (.docx) / CSV / Google Docs / mã hóa link chia sẻ
//  Dùng chung cho Sổ nghiên cứu (notebook.js) và trang xem/chia sẻ (view.html).
//  Không phụ thuộc thư viện nào khi chạy; thư viện "docx" chỉ nạp khi bấm Tải .docx.
// ============================================================
const DOCGEN = (() => {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeUrl = u => /^https?:\/\//i.test(u) ? u : '#';

  // ---------- inline ----------
  const INL = /(\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|`[^`\n]+`|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\)|https?:\/\/[^\s)<>\]]+)/g;
  function runs(s) {
    const out = []; let last = 0, m; INL.lastIndex = 0; s = String(s || '');
    while ((m = INL.exec(s))) {
      if (m.index > last) out.push({ t: s.slice(last, m.index) });
      const x = m[0];
      if (x.startsWith('**') || x.startsWith('__')) out.push({ t: x.slice(2, -2), b: 1 });
      else if (x[0] === '*') out.push({ t: x.slice(1, -1), i: 1 });
      else if (x[0] === '`') out.push({ t: x.slice(1, -1), code: 1 });
      else if (x[0] === '[') { const k = x.indexOf(']('); out.push({ t: x.slice(1, k), link: x.slice(k + 2, -1) }); }
      else out.push({ t: x, link: x });
      last = m.index + x.length;
    }
    if (last < s.length) out.push({ t: s.slice(last) });
    return out;
  }
  const runHtml = r => r.link ? `<a href="${esc(safeUrl(r.link))}" target="_blank" rel="noopener noreferrer">${esc(r.t)}</a>`
    : r.code ? `<code>${esc(r.t)}</code>` : r.b ? `<strong>${esc(r.t)}</strong>` : r.i ? `<em>${esc(r.t)}</em>` : esc(r.t);
  const inline = s => runs(s).map(runHtml).join('');

  // ---------- khối ----------
  function blocks(md) {
    const L = String(md || '').replace(/\r/g, '').split('\n'), B = []; let i = 0;
    const isRow = l => /^\s*\|.*\|\s*$/.test(l), isSep = l => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
    while (i < L.length) {
      const l = L[i];
      if (!l.trim()) { i++; continue; }
      let m;
      if ((m = l.match(/^(#{1,4})\s+(.*)$/))) { B.push({ k: 'h', l: m[1].length, r: runs(m[2].replace(/\s*#+\s*$/, '')) }); i++; continue; }
      if (/^\s*([-*_])\1{2,}\s*$/.test(l)) { B.push({ k: 'hr' }); i++; continue; }
      if (isRow(l) && i + 1 < L.length && isSep(L[i + 1])) {
        const cells = x => x.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
        const head = cells(l); i += 2; const rows = [];
        while (i < L.length && isRow(L[i])) { rows.push(cells(L[i])); i++; }
        B.push({ k: 'table', head: head.map(runs), rows: rows.map(r => r.map(runs)) }); continue;
      }
      if ((m = l.match(/^(\s*)([-*•]|\d+[.)])\s+(.*)$/))) {
        while (i < L.length && (m = L[i].match(/^(\s*)([-*•]|\d+[.)])\s+(.*)$/))) {
          B.push({ k: 'li', ord: /\d/.test(m[2]), lvl: Math.min(2, Math.floor(m[1].replace(/\t/g, '  ').length / 2)), r: runs(m[3]) }); i++;
        }
        continue;
      }
      if (/^\s*>\s?/.test(l)) { const q = []; while (i < L.length && /^\s*>\s?/.test(L[i])) { q.push(L[i].replace(/^\s*>\s?/, '')); i++; } B.push({ k: 'quote', r: runs(q.join(' ')) }); continue; }
      const p = []; while (i < L.length && L[i].trim() && !/^(#{1,4}\s|\s*([-*•]|\d+[.)])\s|\s*>|\s*\|)/.test(L[i])) { p.push(L[i].trim()); i++; }
      if (!p.length) { p.push(l.trim()); i++; }
      B.push({ k: 'p', r: runs(p.join(' ')) });
    }
    return B;
  }

  function md(text, opt) {
    opt = opt || {}; const B = blocks(text); let h = '', list = null;
    const close = () => { if (list) { h += `</${list}>`; list = null; } };
    B.forEach(b => {
      if (b.k !== 'li') close();
      if (b.k === 'h') h += `<h${Math.min(b.l + (opt.shift || 0), 5)}>${b.r.map(runHtml).join('')}</h${Math.min(b.l + (opt.shift || 0), 5)}>`;
      else if (b.k === 'p') h += `<p>${b.r.map(runHtml).join('')}</p>`;
      else if (b.k === 'hr') h += '<hr>';
      else if (b.k === 'quote') h += `<blockquote>${b.r.map(runHtml).join('')}</blockquote>`;
      else if (b.k === 'li') { const t = b.ord ? 'ol' : 'ul'; if (list !== t) { close(); h += `<${t}>`; list = t; } h += `<li style="margin-left:${b.lvl * 18}px">${b.r.map(runHtml).join('')}</li>`; }
      else if (b.k === 'table') h += `<div class="tbl"><table><thead><tr>${b.head.map(c => `<th>${c.map(runHtml).join('')}</th>`).join('')}</tr></thead><tbody>${b.rows.map(r => `<tr>${r.map(c => `<td>${c.map(runHtml).join('')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    });
    close(); return h;
  }

  // ---------- CSV (các bảng trong tài liệu → mở được bằng Excel / Google Sheets) ----------
  const plain = r => r.map(x => x.t).join('');
  function csv(text) {
    const tabs = blocks(text).filter(b => b.k === 'table'); if (!tabs.length) return '';
    const q = v => '"' + String(v).replace(/"/g, '""') + '"';
    return '﻿' + tabs.map(t => [t.head.map(plain)].concat(t.rows.map(r => r.map(plain))).map(r => r.map(q).join(',')).join('\r\n')).join('\r\n\r\n');
  }
  const hasTable = text => blocks(text).some(b => b.k === 'table');

  // ---------- Word ----------
  const DOCX_URL = 'https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js';
  function loadDocx() {
    return new Promise((res, rej) => {
      if (window.docx) return res(window.docx);
      const s = document.createElement('script'); s.src = DOCX_URL; s.onload = () => window.docx ? res(window.docx) : rej(new Error('Không nạp được thư viện Word.')); s.onerror = () => rej(new Error('Không tải được thư viện tạo Word (kiểm tra kết nối mạng).')); document.head.appendChild(s);
    });
  }
  const FONT = 'Times New Roman';
  async function toDocx(title, text, meta) {
    const D = await loadDocx(); return build(D, title, text, meta);
  }
  function build(D, title, text, meta) {
    const { Document, Paragraph, TextRun, HeadingLevel, AlignmentType, ExternalHyperlink, Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, Footer, PageNumber, LevelFormat, Packer } = D;
    meta = meta || {};
    const mk = (rs, base) => rs.map(r => {
      const o = Object.assign({ text: r.t, font: r.code ? 'Consolas' : FONT, bold: !!r.b || (base && base.bold), italics: !!r.i, size: base && base.size }, r.code ? { shading: { type: ShadingType.CLEAR, fill: 'F1F3F4' } } : {});
      if (r.link) return new ExternalHyperlink({ link: safeUrl(r.link), children: [new TextRun(Object.assign(o, { color: '1155CC', underline: {} }))] });
      return new TextRun(o);
    });
    const H = [null, HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4];
    const B = blocks(text), kids = []; let ordInst = 0, prevOrd = false, first = true;
    const PAGE_W = 9071;
    B.forEach(b => {
      if (b.k !== 'li') prevOrd = false;
      if (b.k === 'h') {
        const top = b.l === 1 && first; first = false;
        kids.push(new Paragraph({ heading: H[Math.min(b.l, 4)], alignment: top ? AlignmentType.CENTER : AlignmentType.LEFT, children: mk(b.r) }));
      } else if (b.k === 'p') { first = false; kids.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: 120, line: 312 }, children: mk(b.r) })); }
      else if (b.k === 'quote') kids.push(new Paragraph({ indent: { left: 567 }, border: { left: { style: BorderStyle.SINGLE, size: 12, color: '9AA0A6', space: 8 } }, spacing: { after: 120 }, children: mk(b.r.map(r => Object.assign({}, r, { i: 1 }))) }));
      else if (b.k === 'hr') kids.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'BDC1C6', space: 1 } }, spacing: { after: 120 }, children: [] }));
      else if (b.k === 'li') {
        if (b.ord && !prevOrd) ordInst++; prevOrd = b.ord;
        kids.push(new Paragraph({ numbering: b.ord ? { reference: 'num', level: b.lvl, instance: ordInst } : { reference: 'bul', level: b.lvl }, spacing: { after: 60, line: 300 }, children: mk(b.r) }));
      } else if (b.k === 'table') {
        const n = Math.max(b.head.length, ...b.rows.map(r => r.length)), w = Math.floor(PAGE_W / n);
        const cell = (rs, head) => new TableCell({ width: { size: w, type: WidthType.DXA }, shading: head ? { type: ShadingType.CLEAR, fill: 'E8F0FE', color: 'auto' } : undefined, margins: { top: 60, bottom: 60, left: 100, right: 100 }, children: [new Paragraph({ children: mk(rs || [], head ? { bold: true, size: 24 } : { size: 24 }) })] });
        const pad = r => Array.from({ length: n }, (_, i) => r[i] || []);
        const bd = { style: BorderStyle.SINGLE, size: 4, color: 'BDC1C6' };
        kids.push(new Table({ width: { size: PAGE_W, type: WidthType.DXA }, columnWidths: Array(n).fill(w), borders: { top: bd, bottom: bd, left: bd, right: bd, insideHorizontal: bd, insideVertical: bd }, rows: [new TableRow({ tableHeader: true, children: pad(b.head).map(c => cell(c, true)) })].concat(b.rows.map(r => new TableRow({ children: pad(r).map(c => cell(c, false)) }))) }));
        kids.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
      }
    });
    const lv = (ref, fmt, chars) => ({ reference: ref, levels: [0, 1, 2].map(l => ({ level: l, format: fmt, text: fmt === LevelFormat.BULLET ? chars[l] : `%${l + 1}.`, alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 567 + l * 454, hanging: 283 } } } })) });
    const hs = (size, color) => ({ run: { font: FONT, size, bold: true, color }, paragraph: { spacing: { before: 240, after: 120 }, keepNext: true } });
    const doc = new Document({
      creator: meta.author || 'Olym63', title: title || 'Tài liệu', description: 'Tạo bởi Sổ nghiên cứu Olym63',
      styles: {
        default: { document: { run: { font: FONT, size: 26 }, paragraph: { spacing: { line: 312 } } } },
        paragraphStyles: [
          { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: hs(32, '1F3864').run, paragraph: hs(32).paragraph },
          { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: hs(28, '1F3864').run, paragraph: hs(28).paragraph },
          { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: hs(26, '2F5496').run, paragraph: hs(26).paragraph },
          { id: 'Heading4', name: 'Heading 4', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: hs(26, '2F5496').run, paragraph: hs(26).paragraph }
        ]
      },
      numbering: { config: [lv('bul', LevelFormat.BULLET, ['•', '–', '·']), lv('num', LevelFormat.DECIMAL)] },
      sections: [{
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1701, right: 1134 } } },
        footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Olym63 · Sổ nghiên cứu · Trang ', size: 18, color: '5F6368', font: FONT }), new TextRun({ children: [PageNumber.CURRENT], size: 18, color: '5F6368', font: FONT })] })] }) },
        children: kids
      }]
    });
    return Packer.toBlob ? Packer.toBlob(doc) : Packer.toBuffer(doc);
  }

  // ---------- tải / sao chép ----------
  function download(blob, name) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  const fname = t => (String(t || 'tai-lieu').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'tai-lieu');
  const STYLE = '<style>body{font-family:"Times New Roman",serif;font-size:13pt;line-height:1.5}h1{font-size:18pt;text-align:center;color:#1F3864}h2{font-size:15pt;color:#1F3864}h3{font-size:13pt;color:#2F5496}table{border-collapse:collapse}td,th{border:1px solid #bdc1c6;padding:4px 8px}th{background:#e8f0fe}</style>';
  // Dán vào Google Docs giữ nguyên tiêu đề, bảng, danh sách: ghi HTML vào clipboard rồi mở tài liệu trống
  async function copyRich(text) {
    const html = STYLE + md(text), plainTxt = String(text);
    if (navigator.clipboard && window.ClipboardItem) { await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([plainTxt], { type: 'text/plain' }) })]); return true; }
    const d = document.createElement('div'); d.contentEditable = 'true'; d.style.cssText = 'position:fixed;left:-9999px;top:0'; d.innerHTML = html; document.body.appendChild(d);
    const r = document.createRange(); r.selectNodeContents(d); const s = getSelection(); s.removeAllRanges(); s.addRange(r); const ok = document.execCommand('copy'); s.removeAllRanges(); d.remove(); return ok;
  }
  async function toGoogleDocs(text) { const ok = await copyRich(text); window.open('https://docs.new', '_blank', 'noopener'); return ok; }
  function printPdf(title, text) {
    const w = window.open('', '_blank'); if (!w) return false;
    w.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(title)}</title>${STYLE}<body>${md(text)}<script>onload=()=>setTimeout(()=>print(),300)<\/script>`); w.document.close(); return true;
  }

  // ---------- mã hóa nội dung vào link (dự phòng khi chưa có Worker) ----------
  const b64u = u8 => { let s = ''; u8.forEach(b => s += String.fromCharCode(b)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const unb64u = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
  async function pack(obj) {
    const raw = new TextEncoder().encode(JSON.stringify(obj));
    if (typeof CompressionStream !== 'undefined') { const cs = new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw')); return 'z' + b64u(new Uint8Array(await new Response(cs).arrayBuffer())); }
    return 'r' + b64u(raw);
  }
  async function unpack(s) {
    const k = s[0], u = unb64u(s.slice(1));
    if (k === 'z') { const ds = new Blob([u]).stream().pipeThrough(new DecompressionStream('deflate-raw')); return JSON.parse(new TextDecoder().decode(new Uint8Array(await new Response(ds).arrayBuffer()))); }
    return JSON.parse(new TextDecoder().decode(u));
  }

  return { esc, runs, inline, blocks, md, csv, hasTable, toDocx, build, download, fname, copyRich, toGoogleDocs, printPdf, pack, unpack };
})();
if (typeof module !== 'undefined') module.exports = DOCGEN;
