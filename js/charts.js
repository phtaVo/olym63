// ============================================================
// CHART — vẽ biểu đồ SVG (cột, cột ngang, đường, tròn) từ dữ liệu {title, unit, labels[], series[{name, values[]}], source}.
//  Không cần thư viện ngoài; xuất được SVG / PNG; dùng chung cho Sổ nghiên cứu và trang xem liên kết chia sẻ.
// ============================================================
const CHART = (() => {
  const PAL = ['#1a73e8', '#e8710a', '#188038', '#d93025', '#9334e6', '#00897b', '#c2185b', '#b06000'];
  const F = "Inter, 'Segoe UI', Roboto, Arial, sans-serif";
  const E = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const TYPES = [['bar', 'Cột'], ['hbar', 'Cột ngang'], ['line', 'Đường'], ['pie', 'Tròn']];
  const fmt = v => { const a = Math.abs(v); return (a >= 1e4 ? Math.round(v).toLocaleString('vi-VN') : (Math.round(v * 100) / 100).toLocaleString('vi-VN')); };
  const cut = (s, n) => { s = String(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
  function scale(lo, hi) {
    if (hi === lo) hi = lo + 1; const raw = (hi - lo) / 5, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p, st = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
    const a = Math.floor(lo / st) * st, b = Math.ceil(hi / st) * st, t = []; for (let v = a; v <= b + st / 2; v += st) t.push(Math.round(v / st * 1e6) / 1e6 * st); return { a, b, t };
  }
  function norm(d) {
    const labels = (d.labels || []).map(String); let S = (d.series || []).map(s => ({ name: String(s.name || ''), values: labels.map((_, i) => { const v = Number((s.values || [])[i]); return isFinite(v) ? v : 0; }) }));
    if (!S.length) S = [{ name: '', values: labels.map(() => 0) }]; return { labels, S };
  }
  function svg(d, type, W, H) {
    W = W || 760; H = H || 440; const { labels, S } = norm(d), n = labels.length, unit = d.unit ? ' (' + d.unit + ')' : '';
    let o = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${F}"><rect width="${W}" height="${H}" fill="#fff"/>`;
    o += `<text x="${W / 2}" y="30" text-anchor="middle" font-size="18" font-weight="700" fill="#202124">${E(cut(d.title || 'Biểu đồ', 70))}</text>`;
    const legend = (items, y) => { let w = items.reduce((a, t) => a + 34 + String(t).length * 7, 0), x = Math.max(10, (W - w) / 2), r = ''; items.forEach((t, i) => { r += `<rect x="${x}" y="${y - 10}" width="12" height="12" rx="3" fill="${PAL[i % PAL.length]}"/><text x="${x + 18}" y="${y}" font-size="12" fill="#3c4043">${E(cut(t, 28))}</text>`; x += 34 + String(t).length * 7; }); return r; };
    if (!n) return o + `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" fill="#80868b" font-size="14">Chưa có dữ liệu</text></svg>`;
    if (type === 'pie') {
      const v = S[0].values.map(x => Math.max(0, x)), tot = v.reduce((a, b) => a + b, 0) || 1, cx = W * .36, cy = H / 2 + 14, R = Math.min(H - 110, W * .55) / 2; let ang = -Math.PI / 2;
      v.forEach((x, i) => { const a2 = ang + x / tot * Math.PI * 2, big = a2 - ang > Math.PI ? 1 : 0, p = (a, r) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
        if (x / tot > .9999) o += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="${PAL[i % PAL.length]}"/>`; else if (x > 0) { const [x1, y1] = p(ang, R), [x2, y2] = p(a2, R); o += `<path d="M${cx},${cy} L${x1},${y1} A${R},${R} 0 ${big} 1 ${x2},${y2} Z" fill="${PAL[i % PAL.length]}" stroke="#fff" stroke-width="2"/>`; if (x / tot > .04) { const [tx, ty] = p((ang + a2) / 2, R * .64); o += `<text x="${tx}" y="${ty + 4}" text-anchor="middle" font-size="12" font-weight="700" fill="#fff">${Math.round(x / tot * 1000) / 10}%</text>`; } }
        ang = a2; });
      labels.forEach((l, i) => { const y = 70 + i * 24; if (y < H - 30) o += `<rect x="${W * .66}" y="${y - 10}" width="12" height="12" rx="3" fill="${PAL[i % PAL.length]}"/><text x="${W * .66 + 20}" y="${y}" font-size="13" fill="#3c4043">${E(cut(l, 22))} — ${fmt(v[i])}</text>`; });
    } else {
      const hz = type === 'hbar', all = S.flatMap(s => s.values), lo = Math.min(0, ...all), hi = Math.max(0, ...all), sc = scale(lo, hi), many = S.length > 1;
      const rot = !hz && (n > 7 || Math.max(...labels.map(l => l.length)) > 11), padL = hz ? Math.min(190, 24 + Math.max(...labels.map(l => Math.min(l.length, 26))) * 6.6) : 64, padR = 28, padT = 54, padB = (rot ? 96 : 58) + (many ? 22 : 0);
      const pw = W - padL - padR, ph = H - padT - padB, X0 = padL, Y0 = padT;
      const val = v => hz ? X0 + (v - sc.a) / (sc.b - sc.a) * pw : Y0 + ph - (v - sc.a) / (sc.b - sc.a) * ph;
      sc.t.forEach(t => { const p = val(t); o += hz ? `<line x1="${p}" y1="${Y0}" x2="${p}" y2="${Y0 + ph}" stroke="#e8eaed"/><text x="${p}" y="${Y0 + ph + 16}" text-anchor="middle" font-size="11" fill="#5f6368">${fmt(t)}</text>` : `<line x1="${X0}" y1="${p}" x2="${X0 + pw}" y2="${p}" stroke="#e8eaed"/><text x="${X0 - 8}" y="${p + 4}" text-anchor="end" font-size="11" fill="#5f6368">${fmt(t)}</text>`; });
      if (d.ylabel || unit) o += hz ? '' : `<text transform="translate(16,${Y0 + ph / 2}) rotate(-90)" text-anchor="middle" font-size="12" fill="#5f6368">${E(cut(d.ylabel || (d.unit || ''), 40))}</text>`;
      const zero = val(0), band = (hz ? ph : pw) / n;
      labels.forEach((l, i) => { const c = (hz ? Y0 : X0) + band * (i + .5);
        if (hz) o += `<text x="${X0 - 8}" y="${c + 4}" text-anchor="end" font-size="12" fill="#3c4043">${E(cut(l, 26))}</text>`;
        else o += rot ? `<text transform="translate(${c},${Y0 + ph + 14}) rotate(-35)" text-anchor="end" font-size="12" fill="#3c4043">${E(cut(l, 18))}</text>` : `<text x="${c}" y="${Y0 + ph + 18}" text-anchor="middle" font-size="12" fill="#3c4043">${E(cut(l, 14))}</text>`; });
      o += hz ? `<line x1="${zero}" y1="${Y0}" x2="${zero}" y2="${Y0 + ph}" stroke="#80868b"/>` : `<line x1="${X0}" y1="${zero}" x2="${X0 + pw}" y2="${zero}" stroke="#80868b"/>`;
      if (type === 'line') {
        S.forEach((s, k) => { const pts = s.values.map((v, i) => [X0 + band * (i + .5), val(v)]); o += `<polyline fill="none" stroke="${PAL[k % PAL.length]}" stroke-width="2.6" stroke-linejoin="round" points="${pts.map(p => p.join(',')).join(' ')}"/>`; pts.forEach((p, i) => { o += `<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="#fff" stroke="${PAL[k % PAL.length]}" stroke-width="2.2"/>`; if (n <= 14 && !many) o += `<text x="${p[0]}" y="${p[1] - 9}" text-anchor="middle" font-size="11" font-weight="600" fill="#3c4043">${fmt(s.values[i])}</text>`; }); });
      } else {
        const gw = band * .74, bw = gw / S.length;
        S.forEach((s, k) => s.values.forEach((v, i) => { const c = (hz ? Y0 : X0) + band * i + (band - gw) / 2 + bw * k, p = val(v);
          if (hz) { o += `<rect x="${Math.min(p, zero)}" y="${c}" width="${Math.abs(p - zero)}" height="${bw - 2}" rx="3" fill="${PAL[k % PAL.length]}"/>`; if (n * S.length <= 20) o += `<text x="${p + (v >= 0 ? 5 : -5)}" y="${c + bw / 2 + 3}" text-anchor="${v >= 0 ? 'start' : 'end'}" font-size="11" fill="#3c4043">${fmt(v)}</text>`; }
          else { o += `<rect x="${c}" y="${Math.min(p, zero)}" width="${bw - 2}" height="${Math.abs(p - zero)}" rx="3" fill="${PAL[k % PAL.length]}"/>`; if (n * S.length <= 24) o += `<text x="${c + bw / 2 - 1}" y="${v >= 0 ? p - 5 : p + 13}" text-anchor="middle" font-size="11" fill="#3c4043">${fmt(v)}</text>`; } }));
      }
      if (many) o += legend(S.map(s => s.name), H - 26);
      if (hz && d.unit) o += `<text x="${X0 + pw / 2}" y="${H - (many ? 40 : 20)}" text-anchor="middle" font-size="12" fill="#5f6368">${E(d.unit)}</text>`;
    }
    if (d.source) o += `<text x="12" y="${H - 8}" font-size="10.5" fill="#80868b">Nguồn: ${E(cut(d.source, 110))}</text>`;
    return o + '</svg>';
  }
  function png(s, k) { return new Promise((res, rej) => { const m = /viewBox="0 0 (\d+) (\d+)"/.exec(s), w = +m[1], h = +m[2], img = new Image(), u = URL.createObjectURL(new Blob([s], { type: 'image/svg+xml;charset=utf-8' })); img.onload = () => { const c = document.createElement('canvas'); c.width = w * (k || 2); c.height = h * (k || 2); const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u); c.toBlob(b => b ? res(b) : rej(new Error('Không xuất được ảnh.')), 'image/png'); }; img.onerror = () => rej(new Error('Không xuất được ảnh.')); img.src = u; }); }
  function csv(d) { const { labels, S } = norm(d), q = s => '"' + String(s).replace(/"/g, '""') + '"'; return [[q(d.xlabel || 'Nhãn')].concat(S.map(s => q(s.name || 'Giá trị'))).join(',')].concat(labels.map((l, i) => [q(l)].concat(S.map(s => s.values[i])).join(','))).join('\n'); }
  return { svg, png, csv, norm, TYPES, PAL, E };
})();
if (typeof window !== 'undefined') window.CHART = CHART;
