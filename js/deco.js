/* Trang trí bằng hình ảnh. Gọn nhẹ: hình ở các góc, công trình tiêu biểu ở giữa. */
const DECO = (() => {
  const $ = id => document.getElementById(id);
  const V = '3';
  const SRC = (k, s) => 'assets/deco/' + k + (s ? '-s' : '') + '.webp?v=' + V;
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
    caphe: ['Cà phê phin', 'Cà phê nhỏ giọt qua phin kim loại. Ly cà phê sữa đá là thức uống quen thuộc của người Việt.'],
    bien: ['Biển tên phố Hà Nội', 'Biển xanh chữ trắng trên cột sơn đỏ trắng, quen thuộc ở các ngã tư phố cổ Hà Nội.'],
    nonla: ['Nón lá', 'Chiếc nón đan từ lá, che nắng che mưa, là hình ảnh quen thuộc của người Việt.'],
    quanxoi: ['Quán vỉa hè', 'Quán xôi nóng, ghế nhựa thấp bên đường là nét sinh hoạt đặc trưng của phố phường Hà Nội.'],
    xichlo: ['Xe xích lô', 'Phương tiện ba bánh đạp chân, từng rất phổ biến ở các đô thị Việt Nam.'],
    disan: ['Di sản Việt Nam', 'Tổ hợp hình ảnh Cột cờ Hà Nội, Tháp Rùa và một công trình cung đình cổ.'],
    pagoda: ['Mái cong phương Đông', 'Những tầng mái cong, rường cột chạm khắc là nét đặc trưng của kiến trúc cổ phương Đông.'],
    motcot: ['Chùa Một Cột', 'Ngôi chùa có kiến trúc độc đáo giữa hồ ở Hà Nội, xây dựng từ năm 1049 thời Lý. Hình trên là con tem Việt Nam phát hành năm 1968.'],
    book: ['Trang sách cổ', 'Chi tiết một họa phẩm cổ châu Âu: bàn tay lật giở những trang sách chép tay.'],
    bust: ['Tượng bán thân Hy Lạp', 'Điêu khắc Hy Lạp cổ đại đề cao vẻ đẹp cân đối và trí tuệ của con người.']
  };
  const TOTAL = 10; let found = new Set();
  try { found = new Set(JSON.parse(localStorage.getItem('olym63_deco') || '[]')); } catch (e) {}
  const nm = k => FACT[k] ? FACT[k][0] : k;
  const img = k => `<img class="dd" data-k="${k}" src="${SRC(k, 1)}" alt="${nm(k)}" loading="lazy" decoding="async">`;
  const item = (k, st, cls, eager) => `<button class="dc ${cls || ''}" data-k="${k}" style="${st}" aria-label="${nm(k)}"><span class="in"><img src="${SRC(k)}" alt="" decoding="async" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'}></span></button>`;

  // ---------- Sân khấu hero: giữa là công trình, các góc là vật phẩm ----------
  function stage() {
    return `<div class="stage rv rv-s" id="stage" role="group" aria-label="Công trình và vật phẩm tri thức, bấm vào để tìm hiểu">
      <div class="sun"></div>
      <svg class="orb" viewBox="0 0 400 400" aria-hidden="true"><g class="o1" fill="none" stroke="currentColor"><circle cx="200" cy="200" r="186" stroke-width="1" stroke-dasharray="2 7"/><circle cx="200" cy="200" r="140" stroke-width="1.2"/></g><g class="o2" fill="currentColor"><circle cx="200" cy="14" r="5"/><circle cx="346" cy="200" r="4"/></g></svg>
      ${item('disan', '--l:0%;--b:4%;--w:100%;--z:.2', 'back')}
      ${item('khuevan', '--l:28%;--b:4%;--w:44%;--z:.6', 'front', 1)}
      ${item('compass', '--l:0%;--t:0%;--w:19%;--z:1', 'compass', 1)}
      ${item('ship', '--l:75%;--t:0%;--w:25%;--z:.9', 'ship')}
      ${item('book', '--l:-3%;--b:0%;--w:27%;--z:.9', 'book')}
      <img class="orn br" src="${SRC('ornament', 1)}" alt="" aria-hidden="true" loading="lazy">
      <div class="hint">Bấm vào hình để tìm hiểu</div>
    </div>`;
  }
  const curtains = () => '';

  // ---------- Sách cổ lật trang (hero) ----------
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const lines = s => s.split(' / ').map(esc).join('<br>');
  const BK = {
    q1: ['Văn bia Tiến sĩ · Thân Nhân Trung', '“Hiền tài là nguyên khí của quốc gia, nguyên khí thịnh thì thế nước mạnh mà hưng thịnh, nguyên khí suy thì thế nước yếu mà thấp hèn.”', ''],
    q2: ['Văn bia Tiến sĩ · Thân Nhân Trung', '“Một khi đã khắc tên lên tấm đá này người đời sau đến xem sẽ chỉ tên và bảo nhau: người này được, người kia hỏng; người này hay, người kia dở; nhờ đó mà kẻ sĩ rèn luyện danh tiết...”', ''],
    q3: ['Lời xưa ở Văn Miếu', '“Đạo nhược lộ nhiên, đắc kỳ môn nhi nhập / Thánh tức thiên dã, bất khả giai nhi thăng.”', 'Gợi ý nghĩa: đạo như con đường rộng, tìm đúng cửa thì bước vào được; bậc Thánh như trời, không thể bắc thang mà lên.'],
    q4: ['Lời xưa ở Văn Miếu', '“Bác ư sử, cùng ư kinh, thánh đạo uyên nguyên khai hậu học / Hành dĩ lễ, tàng dĩ nghĩa, hiền nhân phong tiết thiệu tiên nho.”', 'Gợi ý nghĩa: học rộng sử sách, thông hiểu kinh điển, mở lối cho người học sau; sống theo lễ, giữ điều nghĩa, nối tiết phong của tiên nho.']
  };
  const qpage = (k, n) => { const q = BK[k]; return `<div class="pc-in"><small>${esc(q[0])}</small><blockquote>${lines(q[1])}</blockquote>${q[2] ? `<p class="gl">${esc(q[2])}</p>` : ''}<i class="pn">${n}</i></div>`; };
  function book() {
    const leaves = [
      [`<div class="pc-in"><small>Giới thiệu</small><h3>Văn Miếu – Quốc Tử Giám</h3><p>Văn Miếu được lập năm 1070 dưới triều Lý Thánh Tông. Quốc Tử Giám (1076) được xem là trường đại học đầu tiên của Việt Nam. Hàng chục tấm bia tiến sĩ đặt trên lưng rùa ghi danh những người đỗ đạt qua các khoa thi.</p><i class="pn">1</i></div>`, qpage('q1', 2)],
      [qpage('q2', 3), qpage('q3', 4)],
      [qpage('q4', 5), `<div class="pc-in c"><small>Lời nhắn</small><h3>Học để thành hiền tài</h3><p>Mỗi ngày luyện thêm một chút, đó cũng là cách bồi đắp nguyên khí.</p><button class="pbtn p" onclick="PORTAL.go('home-screen')">Bắt đầu luyện tập</button><i class="pn">6</i></div>`]
    ];
    return `<div class="bkwrap rv rv-s">
      <div class="bk" id="bk" tabindex="0" role="group" aria-roledescription="sách" aria-label="Sách cổ ghi lời xưa ở Văn Miếu – Quốc Tử Giám. Dùng phím mũi tên để lật trang." data-n="0">
        <div class="bk-back"></div>
        <div class="pg L base"><div class="pc-in c"><span class="orn-s">❖</span><small>Văn Miếu – Quốc Tử Giám</small><h3>Lời xưa<br>nơi Văn Miếu</h3><span class="rule"></span><p>Bấm vào trang hoặc nút mũi tên để lật.</p></div></div>
        <div class="pg R base"><div class="pc-in c"><img src="${SRC('khuevan', 1)}" alt="Khuê Văn Các" loading="lazy" decoding="async"><small>Khuê Văn Các</small><button class="bk-again" onclick="DECO.flip(-9)">Đọc lại từ đầu</button></div></div>
        ${leaves.map((l, i) => `<div class="leaf" data-i="${i}" style="z-index:${10 + leaves.length - i}"><div class="face f" data-d="1">${l[0]}</div><div class="face b" data-d="-1">${l[1]}</div></div>`).join('')}
      </div>
      <div class="bk-ctl"><button onclick="DECO.flip(-1)" aria-label="Trang trước">${'‹'}</button><span id="bk-n" aria-live="polite">Trang 1 / 4</span><button onclick="DECO.flip(1)" aria-label="Trang sau">${'›'}</button></div>
    </div>`;
  }
  const bookSection = () => `<section class="sec booksec" id="booksec">
      <div class="sec-head rv"><h2>Lời xưa nơi Văn Miếu</h2><p>Mở quyển sách cổ để đọc những dòng khắc trên bia đá và cổng Văn Miếu – Quốc Tử Giám. Bấm vào trang hoặc dùng mũi tên để lật.</p></div>
      ${book()}
    </section>`;
  let bkT, bkAuto = false;
  function flip(d) {
    const b = $('bk'); if (!b) return; const L = b.querySelectorAll('.leaf'); let n = +b.dataset.n; const m = n + (d === -9 ? -n : d); if (m < 0 || m > L.length) return; b.dataset.n = m;
    L.forEach((el, i) => { const was = el.classList.contains('flipped'), now = i < m; if (was !== now) { el.classList.toggle('flipped', now); el.style.zIndex = 100; } });
    clearTimeout(bkT); bkT = setTimeout(() => L.forEach((el, i) => el.style.zIndex = i < m ? 10 + i : 10 + L.length - i), 950);
    const t = $('bk-n'); if (t) t.textContent = `Trang ${m + 1} / ${L.length + 1}`;
  }

  // ---------- Dải di sản (cuộn dọc, trượt ngang) ----------
  function skyline() {
    const S = [['cotco', 280], ['thienmu', 220], ['benthanh', 230], ['bitexco', 360], ['motcot', 300], ['tag', 'Thế giới'], ['pisa', 320], ['colosseum', 240], ['pyramid', 210], ['bigben', 340], ['eiffel', 380]];
    return `<section class="sec sky" id="sky">
      <div class="sec-head rv"><h2>Hành trình tri thức</h2><p>Từ những công trình quen thuộc của Việt Nam đến các di sản thế giới. Cuộn trang để đi dọc dải di sản, bấm vào từng hình để tìm hiểu.</p></div>
      <div class="sky-view"><div class="sky-track" id="sky-track"><span class="sky-tag">Việt Nam</span>
        ${S.map((s, i) => s[0] === 'tag' ? `<span class="sky-tag w">${s[1]}</span>` : `<button class="sk" data-k="${s[0]}" style="--h:${s[1]}px" aria-label="${nm(s[0])}"><img src="${SRC(s[0])}" alt="" loading="lazy" decoding="async"></button>`).join('')}
      </div><div class="sky-ground"></div></div></section>`;
  }
  const counter = () => `<span class="chip dc-count" id="dc-count">Đã khám phá ${found.size}/${TOTAL} hình · bấm để tìm hiểu</span>`;

  // ---------- Bong bóng kiến thức + lấp lánh ----------
  let bubble, bt;
  const lite = () => document.body.classList.contains('lite');
  function showFact(k, el, ev) {
    const f = FACT[k]; if (!f) return;
    if (!found.has(k)) { found.add(k); try { localStorage.setItem('olym63_deco', JSON.stringify([...found])); } catch (e) {} const c = $('dc-count'); if (c) { c.textContent = found.size >= TOTAL ? 'Bạn đã khám phá ' + found.size + ' hình. Thật tò mò!' : `Đã khám phá ${found.size}/${TOTAL} hình · bấm để tìm hiểu`; c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump'); } }
    if (!bubble) { bubble = document.createElement('div'); bubble.className = 'fact glass'; bubble.setAttribute('role', 'status'); document.body.appendChild(bubble); }
    bubble.innerHTML = `<small>Bạn có biết?</small><b>${f[0]}</b><span>${f[1]}</span>`;
    const r = el.getBoundingClientRect(), W = Math.min(290, innerWidth - 24); let x = r.left + r.width / 2 - W / 2; x = Math.max(12, Math.min(innerWidth - W - 12, x));
    bubble.style.width = W + 'px'; bubble.style.left = x + 'px'; bubble.classList.add('on');
    const h = bubble.offsetHeight; let y = r.top - 8 - h; if (y < 74) y = Math.min(innerHeight - h - 12, r.bottom + 10); bubble.style.top = y + 'px';
    clearTimeout(bt); bt = setTimeout(() => bubble && bubble.classList.remove('on'), 5200);
    if (!lite()) sparkle(ev ? ev.clientX : r.left + r.width / 2, ev ? ev.clientY : r.top + r.height / 2);
  }
  function sparkle(x, y) {
    const cols = ['#d4a437', '#f2d27a', 'var(--accent)', '#ea4335', '#f08cb0'];
    for (let i = 0; i < 10; i++) {
      const s = document.createElement('i'); s.className = 'spk'; const a = Math.random() * 6.283, d = 36 + Math.random() * 60;
      s.style.cssText = `left:${x}px;top:${y}px;--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d - 18}px;--c:${cols[i % cols.length]};--s:${5 + Math.random() * 5}px;--r:${Math.random() * 360}deg`;
      document.body.appendChild(s); setTimeout(() => s.remove(), 850);
    }
  }

  // ---------- Ảnh ở các góc trang ----------
  // [ảnh, vị trí (tr/tl/bl/br/l/r), cỡ theo vw, % chiều cao (cho l/r), tốc độ cuộn]
  const CORN = {
    'portal-screen': [['ceiling', 'l', 12, 34, .05]],
    'home-screen': [['bust', 'tr', 11, 0, .04], ['colosseum', 'bl', 15, 0, .03]],
    'store-screen': [['nonla', 'tr', 10, 0, .04], ['caphe', 'bl', 7, 0, .03]],
    'report-screen': [['compass', 'tr', 9, 0, .05]],
    'community-screen': [['quanxoi', 'tr', 13, 0, .04], ['xichlo', 'bl', 14, 0, .03]],
    'support-screen': [['book', 'br', 11, 0, .04]]
  };
  const PAPER = { 'home-screen': 1, 'store-screen': 1, 'report-screen': 1, 'community-screen': 1, 'support-screen': 1 };
  function sprinkle(id) {
    const root = $(id); if (!root) return; const pg = root.querySelector('.page'); if (!pg || pg.querySelector(':scope > .dec-layer')) return;
    const L = CORN[id]; if (!L) return; const lay = document.createElement('div'); lay.className = 'dec-layer';
    let h = '';
    if (PAPER[id]) h += `<img class="paper bl" src="assets/deco/paperBL.webp?v=${V}" alt="" loading="lazy" decoding="async">`;
    h += L.map(([k, pos, w, top, sp]) => `<button class="dc cn ${pos}" data-k="${k}" tabindex="-1" style="--w:clamp(76px,${w}vw,${Math.round(w * 17)}px);--t:${top}%;--k:${sp}" aria-label="${nm(k)}"><span class="in"><img src="${SRC(k, 1)}" alt="" loading="lazy" decoding="async"></span></button>`).join('');
    lay.innerHTML = h; pg.prepend(lay); watchVis(lay); layerScroll(root);
  }
  function watch() {
    Object.keys(CORN).forEach(id => { const el = $(id); if (!el || el._dw) return; el._dw = 1; let q = 0; new MutationObserver(() => { if (q) return; q = requestAnimationFrame(() => { q = 0; sprinkle(id); }); }).observe(el, { childList: true }); sprinkle(id); });
  }
  let io;
  function watchVis(el) { if (!('IntersectionObserver' in window)) return; if (!io) io = new IntersectionObserver(es => es.forEach(e => e.target.classList.toggle('off', !e.isIntersecting)), { rootMargin: '120px' }); io.observe(el); }
  function layerScroll(root) { const l = root.querySelector('.dec-layer'); if (l) l.style.setProperty('--sc', (root.scrollTop || 0).toFixed(0)); }

  // ---------- Sự kiện ----------
  let bound = false, tick = false, pm = null, pmq = false;
  function bind() {
    if (bound) return; bound = true;
    document.body.classList.toggle('lite', (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4 || matchMedia('(prefers-reduced-motion:reduce)').matches);
    document.addEventListener('click', e => {
      const fc = e.target.closest('.leaf .face'); if (fc && !e.target.closest('button')) { flip(+fc.dataset.d); return; }
      const t = e.target.closest('[data-k]'); if (!t || !FACT[t.dataset.k]) { if (bubble && !e.target.closest('.fact')) bubble.classList.remove('on'); return; }
      const inn = t.querySelector('.in') || t; inn.classList.remove('pop'); void inn.offsetWidth; inn.classList.add('pop');
      showFact(t.dataset.k, t, e);
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && bubble) bubble.classList.remove('on'); if (e.target && e.target.id === 'bk') { if (e.key === 'ArrowRight') flip(1); if (e.key === 'ArrowLeft') flip(-1); } });
    if (matchMedia('(hover:hover)').matches) {
      document.addEventListener('pointermove', e => { pm = e; if (!pmq) { pmq = true; requestAnimationFrame(() => { pmq = false; pointer(); }); } }, { passive: true });
    }
    addEventListener('scroll', e => { const t = e.target; if (t && t.classList && t.classList.contains('pg')) layerScroll(t); onScroll(); }, { passive: true, capture: true });
    let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { frame(); document.querySelectorAll('.screen.pg').forEach(layerScroll); }, 120); });
  }
  function pointer() {
    if (!pm || lite()) return; const st = $('stage'); if (!st) return;
    const r = st.getBoundingClientRect();
    if (pm.clientY > r.top - 60 && pm.clientY < r.bottom + 60 && pm.clientX > r.left - 60 && pm.clientX < r.right + 60) {
      st.style.setProperty('--mx', ((pm.clientX - (r.left + r.width / 2)) / r.width * 26).toFixed(1));
      st.style.setProperty('--my', ((pm.clientY - (r.top + r.height / 2)) / r.height * 18).toFixed(1));
      const d = pm.target.closest && pm.target.closest('.dc'); document.querySelectorAll('.dc.tilt').forEach(x => { if (x !== d) { const i = x.querySelector('.in'); i.style.removeProperty('--rx'); i.style.removeProperty('--ry'); x.classList.remove('tilt'); } });
      if (d && st.contains(d)) { const b = d.getBoundingClientRect(), i = d.querySelector('.in'); i.style.setProperty('--rx', (-((pm.clientY - b.top) / b.height - .5) * 9).toFixed(1) + 'deg'); i.style.setProperty('--ry', (((pm.clientX - b.left) / b.width - .5) * 11).toFixed(1) + 'deg'); d.classList.add('tilt'); }
    }
  }
  function onScroll() { if (!tick) { tick = true; requestAnimationFrame(() => { tick = false; frame(); }); } }
  function frame() {
    const vh = innerHeight, st = $('stage');
    if (st && st.offsetParent !== null && !lite()) { const r = st.getBoundingClientRect(); if (r.bottom > -100 && r.top < vh + 100) { const p = vh / 2 - (r.top + r.height / 2); st.style.setProperty('--rot', (p * .1).toFixed(1) + 'deg'); st.style.setProperty('--shipx', (p * .1).toFixed(1) + 'px'); } }
    const bk = $('bk');
    if (bk && bk.offsetParent !== null) { const r = bk.getBoundingClientRect(); const p = Math.min(1, Math.max(0, (vh - r.top) / (vh * .62))); bk.style.setProperty('--in', (1 - p).toFixed(3));
      if (p > .95 && !bkAuto && bk.dataset.n === '0') { bkAuto = true; setTimeout(() => { if (bk.dataset.n === '0') flip(1); }, 700); } }
    const sk = $('sky'), tr = $('sky-track');
    if (sk && tr && sk.offsetParent !== null) { const r = sk.getBoundingClientRect(); if (r.bottom > -50 && r.top < vh + 50) { const view = tr.parentElement.clientWidth, over = Math.max(0, tr.scrollWidth - view); const p = Math.min(1, Math.max(0, (vh - r.top) / (vh + r.height * .6))); tr.style.transform = `translate3d(${(-p * over).toFixed(1)}px,0,0)`; } }
  }
  function init() { bind(); watch(); bkAuto = false; const s = $('stage'), k = $('sky'); if (s) watchVis(s); if (k) watchVis(k); frame(); onScroll(); }
  return { book, bookSection, flip, stage, curtains, skyline, counter, img, init, frame, FACT, SRC, found: () => found.size };
})();
