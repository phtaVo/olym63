/* Trang trí bằng hình ảnh: bố cục, hiệu ứng cuộn, di chuột, bấm. */
const DECO = (() => {
  const $ = id => document.getElementById(id);
  const SRC = k => 'assets/deco/' + k + '.webp?v=1';
  const FACT = {
    khuevan: ['Khuê Văn Các', 'Gác trong Văn Miếu – Quốc Tử Giám, Hà Nội, xây năm 1805 và là một biểu tượng của Thủ đô.'],
    benthanh: ['Chợ Bến Thành', 'Biểu tượng của TP. Hồ Chí Minh. Tòa nhà chợ hiện nay khánh thành năm 1914.'],
    bitexco: ['Bitexco Financial Tower', 'Tòa tháp 68 tầng ở TP. Hồ Chí Minh, nổi bật với sân đáp trực thăng nhô ra như chiếc đĩa.'],
    lac: ['Chim Lạc', 'Họa tiết chim Lạc thường thấy trên mặt trống đồng Đông Sơn, gắn với văn hóa Việt cổ.'],
    docLap: ['Báo "Độc Lập"', 'Tư liệu báo chí thời kỳ đầu của nước Việt Nam độc lập.'],
    cotco: ['Cột cờ Hà Nội', 'Xây năm 1812 dưới triều Gia Long, là một chứng tích của Thành cổ Hà Nội.'],
    thienmu: ['Chùa Thiên Mụ', 'Ngôi chùa cổ bên sông Hương, Huế. Tháp Phước Duyên của chùa có 7 tầng.'],
    buudien: ['Bưu điện Trung tâm Sài Gòn', 'Công trình kiến trúc kiểu Pháp ở TP. Hồ Chí Minh, xây vào cuối thế kỷ XIX.'],
    stamp: ['Tem bưu chính cũ', 'Tem in hình một ngọn tháp ở Bắc Ninh, là tư liệu thú vị về lịch sử bưu chính.'],
    napoleon: ['Napoléon vượt dãy Alps', 'Họa phẩm của Jacques-Louis David, vẽ khoảng năm 1801.'],
    compass: ['La bàn', 'Dụng cụ chỉ hướng bằng kim nam châm, được phát minh từ Trung Quốc cổ đại.'],
    ship: ['Thuyền buồm', 'Những con thuyền buồm lớn đã mở ra thời đại hàng hải khám phá từ thế kỷ XV.'],
    ceiling: ['Tranh trần kiểu Baroque', 'Tranh vẽ trên trần một nhà thờ ở Rome, tạo ảo giác không gian ba chiều.'],
    bigben: ['Big Ben', 'Big Ben thật ra là tên của chiếc chuông lớn. Tháp đồng hồ ở London có tên là Tháp Elizabeth.'],
    eiffel: ['Tháp Eiffel', 'Hoàn thành năm 1889 tại Paris, dựng cho Triển lãm Thế giới.'],
    pyramid: ['Kim tự tháp Giza', 'Công trình cổ ở Ai Cập, xây cách đây khoảng 4.500 năm, có tượng Nhân sư canh giữ.'],
    greek: ['Chữ Hy Lạp cổ', 'Bảng chữ cái Hy Lạp góp phần hình thành nhiều hệ chữ viết về sau, trong đó có chữ Latin.'],
    pisa: ['Tháp nghiêng Pisa', 'Ở Ý, khởi công năm 1173 và bắt đầu nghiêng ngay khi xây do nền đất yếu.'],
    colosseum: ['Đấu trường Colosseum', 'Ở Rome, khánh thành năm 80 sau Công nguyên, từng chứa hàng chục nghìn khán giả.'],
    bust: ['Tượng bán thân Hy Lạp', 'Điêu khắc Hy Lạp cổ đại đề cao vẻ đẹp cân đối và trí tuệ của con người.']
  };
  const TOTAL = 12; let found = new Set();
  try { found = new Set(JSON.parse(localStorage.getItem('olym63_deco') || '[]')); } catch (e) {}
  const img = (k, cls, extra) => `<img class="dd ${cls || ''}" data-k="${k}" src="${SRC(k)}" alt="${FACT[k] ? FACT[k][0] : ''}" loading="lazy" decoding="async" ${extra || ''}>`;
  const item = (k, st, cls) => `<button class="dc ${cls || ''}" data-k="${k}" style="${st}" aria-label="${FACT[k] ? FACT[k][0] : k}"><span class="in"><img src="${SRC(k)}" alt="" decoding="async"></span></button>`;

  // ---------- Sân khấu hero ----------
  function stage() {
    return `<div class="stage rv rv-s" id="stage" role="group" aria-label="Các địa danh và vật phẩm tri thức, bấm vào để tìm hiểu">
      ${curtains()}<div class="sun"></div>
      <svg class="orb" viewBox="0 0 400 400" aria-hidden="true"><g class="o1" fill="none" stroke="currentColor"><circle cx="200" cy="200" r="190" stroke-width="1" stroke-dasharray="2 7"/><circle cx="200" cy="200" r="150" stroke-width="1.2"/><circle cx="200" cy="200" r="104" stroke-width="1" stroke-dasharray="14 6"/></g><g class="o2" fill="currentColor"><circle cx="200" cy="10" r="5"/><circle cx="350" cy="200" r="4"/><circle cx="96" cy="296" r="3.5"/></g><g stroke="currentColor" stroke-width=".8" opacity=".5"><path d="M10 200h380M200 10v380"/></g></svg>
      ${item('colosseum', '--l:-7%;--b:3%;--w:44%;--z:.35;--sp:.04', 'back')}
      ${item('pyramid', '--l:48%;--b:2%;--w:56%;--z:.3;--sp:.03', 'back')}
      ${item('eiffel', '--l:3%;--b:10%;--w:21%;--z:.55;--sp:.06', 'mid')}
      ${item('bigben', '--l:78%;--b:9%;--w:17%;--z:.5;--sp:.05', 'mid')}
      ${item('khuevan', '--l:23%;--b:1%;--w:54%;--z:.9;--sp:.02', 'front')}
      ${item('compass', '--l:4%;--t:2%;--w:22%;--z:1.3;--sp:.1', 'compass')}
      ${item('ship', '--l:70%;--t:1%;--w:27%;--z:1.1;--sp:.09', 'ship')}
      ${item('lac', '--l:34%;--t:6%;--w:26%;--z:1.5;--sp:.12', 'lac')}
      <img class="orn tl" src="${SRC('ornament')}" alt="" aria-hidden="true"><img class="orn br" src="${SRC('ornament')}" alt="" aria-hidden="true">
      <div class="hint">Bấm vào hình để tìm hiểu</div>
    </div>`;
  }
  function curtains() {
    return `<img class="curt L" src="${SRC('curtain')}" alt="" aria-hidden="true"><img class="curt R" src="${SRC('curtain')}" alt="" aria-hidden="true">`;
  }
  // ---------- Dải di sản ----------
  function skyline() {
    const S = [['cotco', 300], ['thienmu', 230], ['benthanh', 250], ['bitexco', 400], ['buudien', 190], ['stamp', 190], ['tag', 'Thế giới'], ['pisa', 340], ['colosseum', 260], ['pyramid', 230], ['bigben', 380], ['eiffel', 420], ['napoleon', 260], ['ship', 240], ['bust', 300], ['ceiling', 280]];
    return `<section class="sec sky" id="sky">
      <div class="sec-head rv"><h2>Hành trình tri thức</h2><p>Từ những công trình quen thuộc của Việt Nam đến các di sản của thế giới. Cuộn trang để đi dọc dải di sản, bấm vào từng hình để tìm hiểu.</p></div>
      <div class="sky-view"><div class="sky-track" id="sky-track"><span class="sky-tag">Việt Nam</span>
        ${S.map((s, i) => s[0] === 'tag' ? `<span class="sky-tag w">${s[1]}</span>` : `<button class="sk" data-k="${s[0]}" style="--h:${s[1]}px;--i:${i}" aria-label="${FACT[s[0]][0]}"><img src="${SRC(s[0])}" alt="" loading="lazy" decoding="async"></button>`).join('')}
      </div><div class="sky-ground"></div></div></section>`;
  }
  const counter = () => `<span class="chip dc-count" id="dc-count">Đã khám phá ${found.size}/${TOTAL} hình · bấm để tìm hiểu</span>`;

  // ---------- Tương tác ----------
  let bubble, bt;
  function showFact(k, el, ev) {
    const f = FACT[k]; if (!f) return;
    if (!found.has(k) && found.size < 99) { found.add(k); try { localStorage.setItem('olym63_deco', JSON.stringify([...found])); } catch (e) {} const c = $('dc-count'); if (c) { c.textContent = found.size >= TOTAL ? 'Bạn đã khám phá ' + found.size + ' hình. Thật tò mò!' : `Đã khám phá ${found.size}/${TOTAL} hình · bấm để tìm hiểu`; c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump'); } }
    if (!bubble) { bubble = document.createElement('div'); bubble.className = 'fact glass'; bubble.setAttribute('role', 'status'); document.body.appendChild(bubble); }
    bubble.innerHTML = `<small>Bạn có biết?</small><b>${f[0]}</b><span>${f[1]}</span>`;
    const r = el.getBoundingClientRect(), W = 290; let x = r.left + r.width / 2 - W / 2; x = Math.max(12, Math.min(innerWidth - W - 12, x));
    let y = r.top - 8; bubble.style.width = W + 'px'; bubble.style.left = x + 'px'; bubble.classList.add('on');
    const h = bubble.offsetHeight; y = y - h; if (y < 74) y = Math.min(innerHeight - h - 12, r.bottom + 10); bubble.style.top = y + 'px';
    clearTimeout(bt); bt = setTimeout(() => bubble && bubble.classList.remove('on'), 5200);
    sparkle(ev ? ev.clientX : r.left + r.width / 2, ev ? ev.clientY : r.top + r.height / 2);
  }
  function sparkle(x, y) {
    const cols = ['#d4a437', '#f2d27a', 'var(--accent)', '#ea4335', '#34a853'];
    for (let i = 0; i < 14; i++) {
      const s = document.createElement('i'); s.className = 'spk'; const a = Math.random() * 6.283, d = 40 + Math.random() * 70;
      s.style.cssText = `left:${x}px;top:${y}px;--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d - 20}px;--c:${cols[i % cols.length]};--s:${5 + Math.random() * 6}px;--r:${Math.random() * 360}deg`;
      document.body.appendChild(s); setTimeout(() => s.remove(), 900);
    }
  }
  let bound = false, tick = false;
  function bind() {
    if (bound) return; bound = true;
    document.addEventListener('click', e => {
      const t = e.target.closest('[data-k]'); if (!t || !FACT[t.dataset.k]) { if (bubble && !e.target.closest('.fact')) bubble.classList.remove('on'); return; }
      const inn = t.querySelector('.in') || t; inn.classList.remove('pop'); void inn.offsetWidth; inn.classList.add('pop');
      if (t.classList.contains('lac')) { t.classList.remove('fly'); void t.offsetWidth; t.classList.add('fly'); }
      showFact(t.dataset.k, t, e);
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && bubble) bubble.classList.remove('on'); });
    document.addEventListener('pointermove', e => {
      const st = $('stage'); if (st && $('portal-screen') && !$('portal-screen').classList.contains('hidden')) {
        const r = st.getBoundingClientRect(); if (e.clientY > r.top - 120 && e.clientY < r.bottom + 120) { st.style.setProperty('--mx', ((e.clientX - (r.left + r.width / 2)) / r.width * 30).toFixed(1)); st.style.setProperty('--my', ((e.clientY - (r.top + r.height / 2)) / r.height * 22).toFixed(1)); }
      }
      const d = e.target.closest && e.target.closest('.dc,.sk,.dd');
      if (d && matchMedia('(hover:hover)').matches) { const r = d.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5; const t = d.querySelector('.in') || d; t.style.setProperty('--rx', (-y * 10).toFixed(1) + 'deg'); t.style.setProperty('--ry', (x * 12).toFixed(1) + 'deg'); }
    }, { passive: true });
    document.addEventListener('pointerout', e => { const d = e.target.closest && e.target.closest('.dc,.sk,.dd'); if (d) { const t = d.querySelector('.in') || d; t.style.removeProperty('--rx'); t.style.removeProperty('--ry'); } }, { passive: true });
    addEventListener('scroll', onScroll, { passive: true, capture: true }); addEventListener('resize', onScroll);
  }
  function onScroll() { if (!tick) { tick = true; requestAnimationFrame(() => { tick = false; frame(); }); } }
  function frame() {
    const vh = innerHeight;
    document.querySelectorAll('.dc[style*="--sp"]').forEach(el => { const r = el.getBoundingClientRect(); if (r.bottom < -200 || r.top > vh + 200) return; const sp = parseFloat(getComputedStyle(el).getPropertyValue('--sp')) || 0; el.style.setProperty('--sy', ((r.top + r.height / 2 - vh / 2) * -sp * 2).toFixed(1)); });
    const st = $('stage'); if (st) { const r = st.getBoundingClientRect(); const p = (vh / 2 - (r.top + r.height / 2)); st.style.setProperty('--rot', (p * .12).toFixed(1) + 'deg'); st.style.setProperty('--rot2', (p * -.07).toFixed(1) + 'deg'); st.style.setProperty('--shipx', (p * .12).toFixed(1) + 'px'); }
    const sk = $('sky'), tr = $('sky-track');
    if (sk && tr) { const r = sk.getBoundingClientRect(), view = tr.parentElement.clientWidth, over = Math.max(0, tr.scrollWidth - view); const p = Math.min(1, Math.max(0, (vh - r.top) / (vh + r.height * .6))); tr.style.transform = `translate3d(${(-p * over).toFixed(1)}px,0,0)`; tr.style.setProperty('--p', p.toFixed(3)); }
    document.querySelectorAll('.curt').forEach(c => { const y = scrollY || (document.querySelector('#portal-screen') || {}).scrollTop || 0; });
  }
  function init(root) { bind(); frame(); onScroll(); }
  return { stage, curtains, skyline, counter, img, init, frame, FACT, SRC, found: () => found.size };
})();
