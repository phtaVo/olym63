// ============================================================
// GRAPH — vẽ SƠ ĐỒ TƯ DUY (tỏa tròn hai bên, nhánh màu) và CÂY TRI THỨC (phân cấp từ trên xuống, thẻ có nhãn trọng tâm).
//  Dùng chung cho Sổ nghiên cứu (notebook.js) và trang xem liên kết chia sẻ (view.html) → mở link vẫn thấy dạng sơ đồ, không phải danh sách.
//  Có kéo để di chuyển, cuộn / chụm để thu phóng, bấm nút để mở – thu gọn, nút "Vừa khung", tải ảnh PNG.
// ============================================================
const GRAPH = (() => {
  const PAL = ['#1a73e8', '#e8710a', '#188038', '#d93025', '#9334e6', '#00897b', '#c2185b', '#b06000', '#5f6368'];
  const FONT = "Inter, 'Segoe UI', Roboto, Arial, sans-serif";
  const E = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tw = (t, fs) => { let w = 0; for (const ch of String(t)) w += /[A-ZĐ]/.test(ch) ? .66 : /[iljtf.,:; ]/.test(ch) ? .3 : /[mwMW]/.test(ch) ? .86 : .55; return w * fs; };
  function wrap(t, max, fs, lines) {
    const words = String(t || '').split(/\s+/).filter(Boolean), out = []; let cur = '';
    words.forEach(w => { const nx = cur ? cur + ' ' + w : w; if (tw(nx, fs) > max && cur) { out.push(cur); cur = w; } else cur = nx; });
    if (cur) out.push(cur);
    if (lines && out.length > lines) { const keep = out.slice(0, lines); let last = keep[lines - 1]; while (tw(last + '…', fs) > max && last.length > 1) last = last.slice(0, -1); keep[lines - 1] = last + '…'; return keep; }
    return out;
  }
  let uid = 0; const kid = n => n._k || (n._k = 'g' + (++uid));
  const kids = n => n.c || [];
  const css = (el, ...names) => { const cs = getComputedStyle(el); for (const n of names) { const v = cs.getPropertyValue(n).trim(); if (v) return v; } return ''; };

  // ---------------- khung kéo / thu phóng ----------------
  function stage(host, opt) {
    host.innerHTML = '<div class="gx-stage" style="position:relative;width:100%;height:100%;overflow:hidden;touch-action:none;cursor:grab;user-select:none;-webkit-user-select:none"><svg class="gx-svg" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" font-family="' + FONT + '"><g class="gx-vp"></g></svg></div>';
    const st = host.firstChild, svg = st.firstChild, vp = svg.firstChild; let tx = 0, ty = 0, k = 1; const ptrs = new Map(); let pd = 0, moved = 0;
    const apply = () => vp.setAttribute('transform', `translate(${tx} ${ty}) scale(${k})`);
    const zoomAt = (cx, cy, f) => { const nk = Math.max(.15, Math.min(3, k * f)); tx = cx - (cx - tx) * nk / k; ty = cy - (cy - ty) * nk / k; k = nk; apply(); };
    st.addEventListener('wheel', e => { e.preventDefault(); const r = st.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * (e.ctrlKey ? .01 : .0015))); }, { passive: false });
    st.addEventListener('pointerdown', e => { ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved = 0; pd = 0; st.style.cursor = 'grabbing'; try { st.setPointerCapture(e.pointerId); } catch (x) {} });
    st.addEventListener('pointermove', e => {
      const p = ptrs.get(e.pointerId); if (!p) return;
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; const d0 = Math.hypot(a.x - b.x, a.y - b.y); p.x = e.clientX; p.y = e.clientY; const [c, d] = [...ptrs.values()]; const d1 = Math.hypot(c.x - d.x, c.y - d.y); if (pd) { const r = st.getBoundingClientRect(); zoomAt((c.x + d.x) / 2 - r.left, (c.y + d.y) / 2 - r.top, d1 / pd); } pd = d1; moved = 9; return; }
      const dx = e.clientX - p.x, dy = e.clientY - p.y; moved += Math.abs(dx) + Math.abs(dy); p.x = e.clientX; p.y = e.clientY; tx += dx; ty += dy; apply();
    });
    const up = e => { ptrs.delete(e.pointerId); pd = 0; if (!ptrs.size) st.style.cursor = 'grab'; };
    st.addEventListener('pointerup', up); st.addEventListener('pointercancel', up);
    return {
      vp, svg, st, wasDrag: () => moved > 6,
      fit(pad) { pad = pad == null ? 24 : pad; let b; try { b = vp.getBBox(); } catch (e) { return; } const r = st.getBoundingClientRect(); if (!b.width || !r.width) return; k = Math.min(1.25, (r.width - pad * 2) / b.width, (r.height - pad * 2) / b.height); tx = (r.width - b.width * k) / 2 - b.x * k; ty = (r.height - b.height * k) / 2 - b.y * k; apply(); },
      center(x, y) { const r = st.getBoundingClientRect(); tx = r.width / 2 - x * k; ty = r.height / 2 - y * k; apply(); },
      zoom(f) { const r = st.getBoundingClientRect(); zoomAt(r.width / 2, r.height / 2, f); }
    };
  }

  // ---------------- SƠ ĐỒ TƯ DUY ----------------
  function mind(host, root, o) {
    o = o || {}; const S = stage(host, o), open = new Set([kid(root)]); let sel = null, firstFit = true;
    const colors = { acc: css(host, '--accent', '--acc') || '#1a73e8', txt: css(host, '--text') || '#202124', bg: css(host, '--bg2', '--bg') || '#fff' };
    kids(root).forEach(n => { kid(n); open.add(n._k); });   // mở sẵn 2 tầng
    const FS = [20, 15.5, 13.5, 12.5], NH = [54, 34, 26, 24];
    const vis = n => open.has(kid(n)) ? kids(n) : [];
    const leaves = n => { const v = vis(n); return v.length ? v.reduce((s, x) => s + leaves(x), 0) : 1; };
    function draw() {
      const out = [], gap = 56, rows = 10;
      const r0 = kids(root); let acc = 0; const total = r0.reduce((s, n) => s + leaves(n), 0), right = [], left = [];
      r0.forEach(n => { const w = leaves(n); (acc + w / 2 <= total / 2 ? right : left).push(n); acc += w; });
      const rootW = Math.min(320, Math.max(150, tw(root.t, FS[0]) + 44)), rootLines = wrap(root.t, 270, FS[0], 3), rootH = Math.max(NH[0], 26 + rootLines.length * 24);
      const place = (list, dir) => {
        const total = list.reduce((s, n) => s + leaves(n), 0), unit = 40; let y = -total * unit / 2;
        const colW = []; list.forEach(n => (function cw(m, d) { colW[d] = Math.max(colW[d] || 0, Math.min(250, tw(m.t, FS[Math.min(d, 3)]) + 30)); vis(m).forEach(x => cw(x, d + 1)); })(n, 1));
        const X = [0, rootW / 2 + gap]; for (let d = 2; d < colW.length; d++) X[d] = X[d - 1] + (colW[d - 1] || 100) + gap;
        const res = [];
        const lay = (n, d, col) => { const v = vis(n); let cy; if (!v.length) { cy = y + unit / 2; y += unit; } else { const ys = v.map(c => lay(c, d + 1, col)); cy = (ys[0] + ys[ys.length - 1]) / 2; } const w = Math.min(250, tw(n.t, FS[Math.min(d, 3)]) + 30); res.push({ n, d, y: cy, col, x: X[d], w, dir, par: n._p }); return cy; };
        list.forEach(n => { const col = PAL[r0.indexOf(n) % PAL.length]; (function mark(m, p) { m._p = p; kids(m).forEach(c => mark(c, m)); })(n, root); lay(n, 1, col); });
        return res;
      };
      const all = place(right, 1).concat(place(left, -1)); const pos = new Map(); all.forEach(a => pos.set(a.n, a));
      let svg = '';
      // nhánh nối
      all.forEach(a => {
        const p = a.par === root ? { x: 0, y: 0, w: rootW, d: 0, dir: a.dir } : pos.get(a.par); if (!p) return;
        const px = a.dir * (p.d === 0 ? rootW / 2 : (p.x + p.w)), cx = a.dir * a.x, py = p.d === 0 ? 0 : p.y, cy = a.y, mx = (px + cx) / 2;
        svg += `<path d="M${px} ${py}C${mx} ${py},${mx} ${cy},${cx} ${cy}" fill="none" stroke="${a.col}" stroke-width="${Math.max(1.6, 5.4 - a.d * 1.3)}" stroke-linecap="round" opacity="${a.d === 1 ? .95 : .75}"/>`;
      });
      // nút
      all.forEach(a => {
        const fs = FS[Math.min(a.d, 3)], h = NH[Math.min(a.d, 3)], has = kids(a.n).length, isOpen = open.has(a.n._k), w = a.w, x0 = a.dir > 0 ? a.x : -(a.x + w), selc = sel === a.n._k;
        const lines = wrap(a.n.t, 220, fs, 2), th = lines.length * (fs + 3);
        const tx0 = x0 + w / 2;
        if (a.d === 1) svg += `<g data-k="${a.n._k}" style="cursor:pointer"><rect x="${x0}" y="${a.y - h / 2}" width="${w}" height="${h}" rx="${h / 2}" fill="${a.col}" ${selc ? 'stroke="#000" stroke-opacity=".4" stroke-width="3"' : ''}/>${lines.map((l, i) => `<text x="${tx0}" y="${a.y - th / 2 + (i + 1) * (fs + 3) - 4}" text-anchor="middle" font-size="${fs}" font-weight="700" fill="#fff">${E(l)}</text>`).join('')}`;
        else svg += `<g data-k="${a.n._k}" style="cursor:pointer"><rect x="${x0 - 2}" y="${a.y - h / 2 - 2}" width="${w + 4}" height="${h + 4}" rx="8" fill="${selc ? a.col : 'transparent'}" fill-opacity=".14"/><path d="M${x0} ${a.y + h / 2 - 3}H${x0 + w}" stroke="${a.col}" stroke-width="2" opacity=".5"/>${lines.map((l, i) => `<text x="${tx0}" y="${a.y - th / 2 + (i + 1) * (fs + 3) - 4}" text-anchor="middle" font-size="${fs}" fill="${colors.txt}" ${a.n.k === 'core' ? 'font-weight="700"' : ''} ${a.n.k === 'ext' ? 'font-style="italic" opacity=".85"' : ''}>${E(l)}</text>`).join('')}`;
        if (has) { const bx = a.dir > 0 ? x0 + w + 10 : x0 - 10; svg += `<circle cx="${bx}" cy="${a.y}" r="8" fill="${isOpen ? 'transparent' : a.col}" stroke="${a.col}" stroke-width="1.6"/><text x="${bx}" y="${a.y + 4}" text-anchor="middle" font-size="11" font-weight="700" fill="${isOpen ? a.col : '#fff'}">${isOpen ? '–' : kids(a.n).length}</text>`; }
        svg += '</g>';
      });
      // gốc
      svg += `<g data-k="${root._k}" style="cursor:pointer"><rect x="${-rootW / 2}" y="${-rootH / 2}" width="${rootW}" height="${rootH}" rx="${Math.min(26, rootH / 2)}" fill="${colors.acc}" stroke="#fff" stroke-width="3"/>${rootLines.map((l, i) => `<text x="0" y="${-rootLines.length * 12 + (i + 1) * 24 - 6}" text-anchor="middle" font-size="${FS[0]}" font-weight="800" fill="#fff">${E(l)}</text>`).join('')}</g>`;
      S.vp.innerHTML = svg;
      S.vp.querySelectorAll('g[data-k]').forEach(g => g.addEventListener('click', () => { if (S.wasDrag()) return; click(g.dataset.k); }));
      if (firstFit) { firstFit = false; S.fit(); }
    }
    const byK = {}; (function idx(n, p) { byK[kid(n)] = n; kids(n).forEach(c => idx(c, n)); })(root, null);
    function click(k) { const n = byK[k]; sel = k; if (kids(n).length) { open.has(k) ? (k !== root._k && open.delete(k)) : open.add(k); } if (o.onSelect) o.onSelect(n); draw(); }
    draw();
    return api(S, draw, open, root, () => { sel = null; });
  }

  // ---------------- CÂY TRI THỨC ----------------
  function tree(host, root, o) {
    o = o || {}; const S = stage(host, o), open = new Set(); let sel = null, firstFit = true;
    const colors = { acc: css(host, '--accent', '--acc') || '#1a73e8', txt: css(host, '--text') || '#202124', bg: css(host, '--bg') || '#fff', line: css(host, '--line') || '#dadce0' };
    (function init(n, d) { kid(n); if (d < 2) open.add(n._k); kids(n).forEach(c => init(c, d + 1)); })(root, 0);
    const W = 176, H = 66, GX = 18, GY = 46, FS = 12.5;
    const vis = n => open.has(n._k) ? kids(n) : [];
    const KC = { core: colors.acc, sup: '#5f6368', ext: '#9aa0a6' }, KL = { core: 'Trọng tâm', sup: 'Bổ trợ', ext: 'Mở rộng' };
    function draw() {
      let x = 0; const nodes = [], edges = [];
      const lay = (n, d) => { const v = vis(n); let cx; if (!v.length) { cx = x + W / 2; x += W + GX; } else { const xs = v.map(c => lay(c, d + 1)); cx = (xs[0] + xs[xs.length - 1]) / 2; v.forEach((c, i) => edges.push([n, c])); } nodes.push({ n, d, cx, y: d * (H + GY) }); return cx; };
      lay(root, 0); const pos = new Map(); nodes.forEach(a => pos.set(a.n, a));
      let svg = '';
      edges.forEach(([p, c]) => { const a = pos.get(p), b = pos.get(c), y1 = a.y + H, y2 = b.y, my = y1 + GY / 2; svg += `<path d="M${a.cx} ${y1}V${my}H${b.cx}V${y2}" fill="none" stroke="${colors.txt}" stroke-opacity=".28" stroke-width="1.6" stroke-linejoin="round"/>`; });
      nodes.sort((a, b) => a.d - b.d).forEach(a => {
        const n = a.n, k = n.k && KC[n.k] ? n.k : null, x0 = a.cx - W / 2, selc = sel === n._k, has = kids(n).length, isRoot = a.d === 0;
        const col = isRoot ? colors.acc : (k ? KC[k] : colors.acc), lines = wrap(n.t, W - 24, FS, 2), sub = !isRoot && n.d ? wrap(n.d, W - 24, 10.5, 1)[0] : '';
        svg += `<g data-k="${n._k}" style="cursor:pointer"><rect x="${x0 + 1.5}" y="${a.y + 3}" width="${W}" height="${H}" rx="14" fill="#000" opacity=".07"/><rect x="${x0}" y="${a.y}" width="${W}" height="${H}" rx="14" fill="${isRoot ? colors.acc : colors.bg}" stroke="${selc ? '#000' : col}" stroke-opacity="${selc ? .55 : 1}" stroke-width="${selc ? 3 : (k === 'core' || isRoot ? 2.4 : 1.4)}" ${k === 'ext' ? 'stroke-dasharray="5 4"' : ''}/>`;
        if (!isRoot) svg += `<rect x="${x0 + 1}" y="${a.y + 12}" width="5" height="${H - 24}" rx="2.5" fill="${col}"/>`;
        svg += lines.map((l, i) => `<text x="${x0 + (isRoot ? W / 2 : 16)}" y="${a.y + 24 + i * 15}" text-anchor="${isRoot ? 'middle' : 'start'}" font-size="${FS}" font-weight="700" fill="${isRoot ? '#fff' : colors.txt}">${E(l)}</text>`).join('');
        if (sub && lines.length < 2) svg += `<text x="${x0 + 16}" y="${a.y + 24 + 17}" font-size="10.5" fill="${colors.txt}" opacity=".62">${E(sub)}</text>`;
        if (k && !isRoot) svg += `<text x="${x0 + W - 10}" y="${a.y + H - 9}" text-anchor="end" font-size="9.5" font-weight="700" fill="${col}">${KL[k]}</text>`;
        if (has) svg += `<g><circle cx="${a.cx}" cy="${a.y + H}" r="9" fill="${open.has(n._k) ? colors.bg : col}" stroke="${col}" stroke-width="1.6"/><text x="${a.cx}" y="${a.y + H + 4}" text-anchor="middle" font-size="11" font-weight="700" fill="${open.has(n._k) ? col : '#fff'}">${open.has(n._k) ? '–' : has}</text></g>`;
        svg += '</g>';
      });
      S.vp.innerHTML = svg;
      S.vp.querySelectorAll('g[data-k]').forEach(g => g.addEventListener('click', () => { if (S.wasDrag()) return; click(g.dataset.k); }));
      if (firstFit) { firstFit = false; S.fit(); }
    }
    const byK = {}; (function idx(n) { byK[kid(n)] = n; kids(n).forEach(idx); })(root);
    function click(k) { const n = byK[k]; sel = k; if (kids(n).length) { open.has(k) ? (k !== root._k && open.delete(k)) : open.add(k); } if (o.onSelect) o.onSelect(n); draw(); }
    draw();
    return api(S, draw, open, root, () => { sel = null; });
  }

  function api(S, draw, open, root, clear) {
    const all = (n, f) => { f(n); kids(n).forEach(c => all(c, f)); };
    return {
      openAll() { all(root, n => { if (kids(n).length) open.add(kid(n)); }); draw(); setTimeout(() => S.fit(), 0); },
      closeAll() { open.clear(); open.add(kid(root)); draw(); setTimeout(() => S.fit(), 0); },
      fit: () => S.fit(), zoom: f => S.zoom(f),
      svgText() { const s = S.svg.cloneNode(true); const b = S.vp.getBBox(), p = 24; s.setAttribute('viewBox', `${b.x - p} ${b.y - p} ${b.width + p * 2} ${b.height + p * 2}`); s.setAttribute('width', Math.round(b.width + p * 2)); s.setAttribute('height', Math.round(b.height + p * 2)); s.querySelector('.gx-vp').removeAttribute('transform'); return new XMLSerializer().serializeToString(s); },
      png(scale) {
        const txt = this.svgText(), m = txt.match(/width="(\d+)" height="(\d+)"/), w = +m[1], h = +m[2], sc = scale || 2;
        return new Promise((res, rej) => { const img = new Image(); img.onload = () => { const c = document.createElement('canvas'); c.width = w * sc; c.height = h * sc; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height); c.toBlob(b => b ? res(b) : rej(new Error('Không tạo được ảnh.')), 'image/png'); }; img.onerror = () => rej(new Error('Không tạo được ảnh.')); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(txt); });
      },
      count() { let n = 0; all(root, () => n++); return n; }
    };
  }
  return { mind, tree, render: (kind, host, root, o) => (kind === 'mind' ? mind : tree)(host, root, o) };
})();
if (typeof module !== 'undefined') module.exports = GRAPH;
