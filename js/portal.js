// ============================================================
// PORTAL — khung giao diện mới của Olym63
//  • Bộ biểu tượng SVG (thay emoji)  • Thanh điều hướng kính  • Trang chủ học thuật
//  • Trang module: Luyện tập (hub) · Nghiên cứu (NB) · Cửa hàng · Báo cáo · Cộng đồng · Hỗ trợ · Hồ sơ
//  • Hiệu ứng: gợn sóng khi nhấp, hiện dần khi cuộn, thanh nav đổi khi cuộn, nền chuyển động nhẹ
// ============================================================
const _IC = {
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/><path d="M9 7h6"/>',
  notebook: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 3v18M12.5 8h3M12.5 12h3"/>',
  store: '<path d="M4 8h16l-1 12H5z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7"/><path d="M12 17h.01"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20a7 7 0 0 1 14 0"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14a5 5 0 0 1 5 5"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H4v1a3 3 0 0 0 4 3M16 6h4v1a3 3 0 0 1-4 3"/><path d="M12 13v4M8 21h8M10 17h4"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  puzzle: '<path d="M4 8h4a2 2 0 1 1 4 0h4v4a2 2 0 1 1 0 4v4H4z"/>',
  crown: '<path d="M3 8l4 4 5-7 5 7 4-4-2 11H5z"/>',
  star: '<path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.2 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v4h16v-4"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 8"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  youtube: '<rect x="2.5" y="5.5" width="19" height="13" rx="4"/><path d="M10 9.5v5l4.5-2.5z"/>',
  file: '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5"/>',
  text: '<path d="M5 6h14M5 11h14M5 16h9"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  send: '<path d="M4 12l16-8-6 16-3-7z"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  bookmark: '<path d="M6 3h12v18l-6-4-6 4z"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>',
  mind: '<circle cx="12" cy="12" r="2.5"/><circle cx="4.5" cy="5.5" r="1.8"/><circle cx="19.5" cy="5.5" r="1.8"/><circle cx="4.5" cy="18.5" r="1.8"/><circle cx="19.5" cy="18.5" r="1.8"/><path d="M10 10.5L5.8 6.8M14 10.5l4.2-3.7M10 13.5l-4.2 3.7M14 13.5l4.2 3.7"/>',
  tree: '<path d="M12 3v7M12 10H5v4M12 10h7v4M12 10v11"/><rect x="3" y="14" width="4" height="4" rx="1"/><rect x="17" y="14" width="4" height="4" rx="1"/>',
  quiz: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 9l1.5 1.5L13 8M9 15h6"/>',
  cards: '<rect x="3" y="7" width="14" height="12" rx="2"/><path d="M7 7V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l5 5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  logout: '<path d="M10 4H5v16h5M15 8l4 4-4 4M19 12H9"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  paperclip: '<path d="M20 11l-8.5 8.5a5 5 0 0 1-7-7L13 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L14 7"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5M4 20h16"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  message: '<path d="M4 5h16v11H9l-5 4z"/>',
  note: '<path d="M5 4h14v12l-5 5H5z"/><path d="M14 21v-5h5"/>',
  tv: '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M12 17v4"/>',
  panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
  warn: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  play: '<path d="M7 5l12 7-12 7z"/>'
};
const NOEMOJI = t => String(t == null ? '' : t).replace(/[\u{1F000}-\u{1FAFF}\u26A0\u23F3\u23F0\u23F1\u2705\u274C\u2714\u2728\u26A1\u2B50\u2699\uFE0F\u200D]+ ?/gu, '');
function IC(name, cls) { return `<svg class="ic ${cls || ''}" viewBox="0 0 24 24" aria-hidden="true">${_IC[name] || ''}</svg>`; }

const PORTAL = (() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const NAV = [
    { id: 'portal-screen', label: 'Trang chủ', go: () => home() },
    { id: 'home-screen', label: 'Luyện tập', go: () => practice() },
    { id: 'nb-screen', label: 'Nghiên cứu', go: () => NB.open() },
    { id: 'store-screen', label: 'Cửa hàng', go: () => page('store') },
    { id: 'report-screen', label: 'Báo cáo', go: () => page('report') },
    { id: 'community-screen', label: 'Cộng đồng', go: () => page('community') },
    { id: 'support-screen', label: 'Hỗ trợ', go: () => page('support') }
  ];
  const NAV_SCREENS = NAV.map(n => n.id);
  const ls = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };
  let io = null;

  // ---------- giao diện: sáng/tối + màu nhấn ----------
  function applyLook() {
    const b = document.body; b.removeAttribute('data-theme');
    b.setAttribute('data-mode', ls.get('olym63_mode') || 'light');
    b.setAttribute('data-acc', ls.get('olym63_acc') || 'blue');
    const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = (ls.get('olym63_mode') === 'dark') ? '#0e1014' : '#f4f6fb';
  }
  function setMode(v) { ls.set('olym63_mode', v); applyLook(); renderNavRight(); }
  function setAcc(v) { ls.set('olym63_acc', v); applyLook(); closePop(); }

  // ---------- thanh điều hướng ----------
  function buildNav() {
    if ($('topnav')) return;
    const n = document.createElement('header'); n.id = 'topnav'; n.className = 'hidden';
    n.innerHTML = `
      <div class="nav-brand" onclick="PORTAL.go('portal-screen')"><span class="mark">O</span><span>Olym63</span></div>
      <nav class="nav-links" id="nav-links">${NAV.map(x => `<button class="nav-link" data-id="${x.id}" onclick="PORTAL.go('${x.id}')">${x.label}</button>`).join('')}</nav>
      <div class="nav-right" id="nav-right"></div>
      <button class="nav-ico" id="nav-menu-btn" onclick="PORTAL.toggleMenu()" title="Menu">${IC('menu')}</button>`;
    document.body.insertBefore(n, document.body.firstChild);
    document.addEventListener('click', e => { if (!e.target.closest('.pop,.nav-user,#nav-set')) closePop(); if (!e.target.closest('#nav-links,#nav-menu-btn')) $('nav-links').classList.remove('open'); });
  }
  function userObj() { try { return AUTH.getCurrentUser(); } catch (e) { return null; } }
  function renderNavRight() {
    const el = $('nav-right'); if (!el) return; const u = userObj(); const dark = document.body.getAttribute('data-mode') === 'dark';
    el.innerHTML = `
      <div style="position:relative"><button class="nav-ico" id="nav-set" onclick="PORTAL.togglePop('look')" title="Giao diện">${IC(dark ? 'moon' : 'sun')}</button><div id="pop-look"></div></div>
      ${u && u.role === 'admin' ? `<button class="nav-ico" onclick="AUTH.openAdmin()" title="Quản trị">${IC('shield')}</button>` : ''}
      ${u ? `<div style="position:relative"><button class="nav-user" onclick="PORTAL.togglePop('user')"><span id="sidenav-avatar-slot"></span><span class="nm">${esc(u.full_name || u.username)}</span></button><div id="pop-user"></div></div>` : ''}`;
    try { if (u) { const sl = $('sidenav-avatar-slot'); sl.innerHTML = AUTH.avatarHtml ? AUTH.avatarHtml(u.avatar, u.username, 32) : ''; } } catch (e) {}
  }
  function togglePop(w) {
    const open = $('pop-' + w) && $('pop-' + w).firstChild; closePop(); if (open) return;
    const host = $('pop-' + w); const dark = document.body.getAttribute('data-mode') === 'dark', acc = document.body.getAttribute('data-acc') || 'blue';
    if (w === 'look') host.innerHTML = `<div class="pop"><div class="lbl">Chế độ</div>
        <button onclick="PORTAL.setMode('light')">${IC('sun')} Sáng ${!dark ? IC('check') : ''}</button><button onclick="PORTAL.setMode('dark')">${IC('moon')} Tối ${dark ? IC('check') : ''}</button>
        <div class="lbl">Màu nhấn</div><div class="sw">${[['blue', '#1a73e8'], ['red', '#d93025'], ['ink', '#202124']].map(c => `<i class="${acc === c[0] ? 'on' : ''}" style="background:${c[1]}" onclick="PORTAL.setAcc('${c[0]}')"></i>`).join('')}</div></div>`;
    else host.innerHTML = `<div class="pop"><button onclick="PORTAL.closePop();AUTH.openProfile()">${IC('user')} Hồ sơ của tôi</button><button onclick="PORTAL.closePop();AUTH.openLeaderboard()">${IC('trophy')} Bảng xếp hạng</button><div class="sep"></div><button onclick="PORTAL.closePop();AUTH.confirmLogout()">${IC('logout')} Đăng xuất</button></div>`;
  }
  function closePop() { ['look', 'user'].forEach(w => { const h = $('pop-' + w); if (h) h.innerHTML = ''; }); }
  function toggleMenu() { $('nav-links').classList.toggle('open'); }
  function setActive(id) { document.querySelectorAll('#topnav .nav-link').forEach(b => b.classList.toggle('on', b.dataset.id === id)); }

  // gọi từ showScreen() trong app.js
  function onScreen(id) {
    buildNav();
    const logged = !!userObj() || !(typeof AUTH !== 'undefined' && AUTH.backendReady && AUTH.backendReady());
    $('topnav').classList.toggle('hidden', !(NAV_SCREENS.includes(id) && logged));
    setActive(id); $('nav-links').classList.remove('open'); closePop(); renderNavRight();
    const el = $(id); if (el && el.classList.contains('pg')) { el.scrollTop = 0; observe(el); bindScroll(el); }
  }
  function go(id) {
    const n = NAV.find(x => x.id === id); if (!n) return;
    try { if (typeof STATE !== 'undefined') { STATE.runId++; } } catch (e) {}
    n.go();
  }

  // ---------- hiệu ứng ----------
  function observe(root) {
    if (io) io.disconnect();
    io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { root, threshold: .12, rootMargin: '0px 0px -6% 0px' });
    root.querySelectorAll('.rv').forEach(x => { x.classList.remove('in'); io.observe(x); });
  }
  function bindScroll(el) {
    if (el._sb) return; el._sb = true;
    el.addEventListener('scroll', () => {
      const y = el.scrollTop; const n = $('topnav'); if (n) n.classList.toggle('scrolled', y > 12);
      el.querySelectorAll('[data-par]').forEach(b => { b.style.transform = `translate3d(0,${y * parseFloat(b.dataset.par)}px,0)`; });
    }, { passive: true });
  }
  document.addEventListener('pointerdown', e => {
    const t = e.target.closest('.pbtn,.btn,.nav-link,.nav-ico,.nb-chip,.nb-tool,.nb-acts button,.seg button,.pc,.nb-tabs button');
    if (!t || t.disabled) return;
    const r = t.getBoundingClientRect(), d = Math.max(r.width, r.height) * 2, s = document.createElement('span');
    s.className = 'ripple'; s.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
    if (getComputedStyle(t).position === 'static') t.style.position = 'relative'; t.style.overflow = 'hidden';
    t.appendChild(s); setTimeout(() => s.remove(), 520);
  }, { passive: true });

  // ---------- tạo các màn hình trang ----------
  function ensureScreens() {
    ['portal-screen', 'store-screen', 'report-screen', 'community-screen', 'support-screen'].forEach(id => {
      if (!$(id)) { const d = document.createElement('div'); d.id = id; d.className = 'screen pg hidden'; document.body.appendChild(d); }
    });
    ['home-screen', 'nb-screen'].forEach(id => { const e = $(id); if (e) e.classList.add('pg'); });
    const nb = $('nb-screen'); if (nb) nb.classList.add('ws');
  }

  // ---------- TRANG CHỦ ----------
  const gnews = q => 'https://www.google.com/search?tbm=nws&q=' + encodeURIComponent(q);
  const wiki = q => 'https://vi.wikipedia.org/w/index.php?search=' + encodeURIComponent(q);
  function home() {
    showScreen('portal-screen');
    const u = userObj();
    const comp = [
      { ic: 'trophy', n: 'Đường lên đỉnh Olympia', d: 'Cuộc thi truyền hình tri thức dành cho học sinh THPT, phát sóng trên VTV. Olym63 mô phỏng các phần Khởi Động, Vượt Chướng Ngại Vật, Tăng Tốc và Về Đích.', st: ['green', 'Có trong Olym63'], q: 'Đường lên đỉnh Olympia', site: 'https://olympia.vn' },
      { ic: 'flag', n: 'Đường đến Vinh quang', d: 'Cuộc thi truyền hình tri thức của VTV, cùng họ chương trình Olympia. Olym63 có phần Xuất Phát; phần Vinh Quang đang được phát triển.', st: ['green', 'Có một phần'], q: 'Đường đến Vinh quang VTV' },
      { ic: 'tv', n: 'Ai là triệu phú', d: 'Chương trình truyền hình trả lời chuỗi câu hỏi trắc nghiệm có độ khó tăng dần để nhận giải thưởng.', st: ['gray', 'Sắp ra mắt'], q: 'Ai là triệu phú' },
      { ic: 'book', n: 'Vua Tiếng Việt', d: 'Chương trình truyền hình về ngôn ngữ và văn hóa tiếng Việt: chính tả, từ ngữ, thành ngữ, ngữ nghĩa.', st: ['gray', 'Sắp ra mắt'], q: 'Vua Tiếng Việt' }
    ];
    const mods = [
      { ic: 'target', n: 'Luyện tập', d: 'Các phần thi mô phỏng, chọn bộ câu hỏi theo môn, chế độ ưu tiên môn còn yếu.', id: 'home-screen', st: 'Đang dùng' },
      { ic: 'notebook', n: 'Nghiên cứu', d: 'Sổ nghiên cứu có AI: tải tài liệu, hình ảnh, hỏi đáp, sơ đồ, flashcard, tạo đề.', id: 'nb-screen', st: 'Đang dùng' },
      { ic: 'store', n: 'Cửa hàng bộ câu hỏi', d: 'Nơi chia sẻ tài liệu và bộ câu hỏi (PDF, Word, Excel…) có nhãn bản quyền.', id: 'store-screen', st: 'Sắp ra mắt' },
      { ic: 'chart', n: 'Báo cáo', d: 'Theo dõi tiến bộ, môn mạnh yếu và lịch sử luyện tập của bạn.', id: 'report-screen', st: 'Sắp ra mắt' },
      { ic: 'users', n: 'Cộng đồng', d: 'Trao đổi, hỏi đáp và thi đấu cùng các bạn.', id: 'community-screen', st: 'Sắp ra mắt' },
      { ic: 'help', n: 'Hỗ trợ', d: 'Hướng dẫn sử dụng và câu hỏi thường gặp.', id: 'support-screen', st: 'Đang dùng' }
    ];
    $('portal-screen').innerHTML = `
      <div class="blob" data-par=".18" style="width:520px;height:520px;left:-140px;top:60px;background:color-mix(in srgb,var(--accent) 30%,transparent)"></div>
      <div class="blob" data-par=".30" style="width:420px;height:420px;right:-120px;top:240px;background:rgba(234,67,53,.18)"></div>
      <div class="blob" data-par=".12" style="width:480px;height:480px;left:30%;top:900px;background:rgba(52,168,83,.16)"></div>
      <div class="page">
        <section class="hero">
          <div>
            <span class="chip eyebrow rv">Nền tảng luyện tập và nghiên cứu tri thức</span>
            <h1 class="rv" style="--d:.05s">Luyện tập thông minh.<br><em>Nghiên cứu sâu hơn.</em></h1>
            <p class="lead rv" style="--d:.12s">${u ? 'Chào ' + esc(u.full_name || u.username) + '. ' : ''}Olym63 giúp học sinh luyện các phần thi quen thuộc của Đường lên đỉnh Olympia, tự nhận ra môn còn yếu, rồi đào sâu kiến thức bằng Sổ nghiên cứu có AI.</p>
            <div class="cta rv" style="--d:.2s"><button class="pbtn p" onclick="PORTAL.go('home-screen')">Bắt đầu luyện tập ${IC('arrow')}</button><button class="pbtn" onclick="PORTAL.go('nb-screen')">Mở Sổ nghiên cứu</button></div>
          </div>
          <div class="mock glass rv rv-s" style="--d:.15s" aria-hidden="true">
            <div class="mock-grid">
              <div class="mock-col"><div class="mock-bar a m"></div>${[1, 2, 3, 4].map(() => '<div class="mock-tile"><div class="mock-bar" style="flex:1"></div></div>').join('')}</div>
              <div class="mock-col"><div class="mock-msg u"><div class="mock-bar"></div><div class="mock-bar s"></div></div><div class="mock-msg"><div class="mock-bar m"></div><div class="mock-bar"></div><div class="mock-bar s"></div></div><div class="mock-msg"><div class="mock-bar"></div><div class="mock-bar m"></div></div><div style="flex:1"></div><div class="mock-tile" style="border-radius:20px"><div class="mock-bar" style="flex:1"></div></div></div>
              <div class="mock-col">${['mind', 'cards', 'quiz', 'tree'].map(i => `<div class="mock-tile">${IC(i)}<div class="mock-bar" style="flex:1"></div></div>`).join('')}</div>
            </div>
          </div>
        </section>

        <section class="sec">
          <div class="sec-head rv"><h2>Các cuộc thi tri thức trên truyền hình</h2><p>Liên kết nhanh tới thông tin mới nhất của từng chương trình. Các nút "Tin mới nhất" luôn mở kết quả tin tức hiện tại, nên không bị lỗi thời.</p></div>
          <div class="grid4">${comp.map((c, i) => `
            <div class="pc glass static rv ${c.st[0] === 'gray' ? 'soon' : ''}" style="--d:${i * .07}s">
              <div class="ico">${IC(c.ic)}</div><span class="chip ${c.st[0]}" style="align-self:flex-start">${c.st[1]}</span>
              <h3>${c.n}</h3><p>${c.d}</p>
              <div class="row"><a class="lnk" href="${gnews(c.q)}" target="_blank" rel="noopener noreferrer">Tin mới nhất ${IC('external')}</a><a class="lnk" href="${wiki(c.q)}" target="_blank" rel="noopener noreferrer">Tìm hiểu ${IC('external')}</a>${c.site ? `<a class="lnk" href="${c.site}" target="_blank" rel="noopener noreferrer">Trang chính thức ${IC('external')}</a>` : ''}</div>
            </div>`).join('')}</div>
        </section>

        <section class="sec">
          <div class="sec-head rv"><h2>Một nền tảng, nhiều công cụ</h2><p>Từ luyện tập hằng ngày đến nghiên cứu chuyên sâu. Mục nào chưa mở sẽ được đánh dấu "Sắp ra mắt".</p></div>
          <div class="grid3">${mods.map((m, i) => `
            <button class="pc glass rv" style="--d:${(i % 3) * .07}s" onclick="PORTAL.go('${m.id}')">
              <div class="ico">${IC(m.ic)}</div><h3>${m.n}</h3><p>${m.d}</p>
              <div class="row"><span class="chip ${m.st === 'Đang dùng' ? 'green' : 'gray'}">${m.st}</span></div></button>`).join('')}
            <button class="pc glass rv" style="--d:.14s" onclick="AUTH.openProfile()"><div class="ico">${IC('user')}</div><h3>Hồ sơ</h3><p>Thông tin tài khoản, môn học cần luyện và tham gia nghiên cứu.</p><div class="row"><span class="chip green">Đang dùng</span></div></button>
          </div>
        </section>

        <section class="sec">
          <div class="sec-head rv"><h2>Vòng học khép kín</h2><p>Mỗi ván chơi là một dữ liệu học tập. Hệ thống dùng nó để gợi ý bước tiếp theo.</p></div>
          <div class="flow">${[['Luyện tập', 'Chơi các phần thi mô phỏng với bộ câu hỏi theo môn.'], ['Ghi nhận', 'Mỗi câu trả lời được lưu để biết bạn mạnh, yếu ở môn nào.'], ['Ưu tiên môn yếu', 'Bật chế độ ưu tiên để câu hỏi tập trung vào môn còn yếu.'], ['Nghiên cứu sâu', 'Nạp ván vừa chơi hoặc tài liệu vào Sổ nghiên cứu, hỏi AI và tạo bài ôn.']].map((s, i) => `<div class="st glass rv" style="--d:${i * .08}s"><h3>${s[0]}</h3><p>${s[1]}</p></div>`).join('')}</div>
        </section>

        <footer class="foot glass rv">
          <div><b>Olym63</b><br>Sản phẩm của nhóm học sinh trường THPT Chuyên Tiền Giang, phục vụ học tập và nghiên cứu khoa học kỹ thuật.</div>
          <div style="max-width:430px"><b>Về dữ liệu</b><br>Dữ liệu học tập chỉ được ghi vào nhật ký nghiên cứu khi bạn đã đồng ý tham gia. Tài liệu trong Sổ nghiên cứu lưu trong trình duyệt của bạn và được gửi cho AI để phân tích. AI có thể sai, hãy đối chiếu với nguồn gốc.</div>
        </footer>
      </div>`;
    observe($('portal-screen')); bindScroll($('portal-screen'));
  }

  // ---------- LUYỆN TẬP (hub) ----------
  let tab = 'olympia';
  function practice() { showScreen('home-screen'); AUTH.renderHome(); }
  function renderPractice() {
    const el = $('home-screen'); const G = CONFIG.GAME; const on = (typeof introEnabled !== 'undefined') ? introEnabled : true;
    const card = (o, i) => `<button class="pc glass mode-card rv ${o.lock ? 'locked' : ''}" style="--d:${i * .06}s" onclick="${o.lock ? `showComingSoon('${o.name}')` : o.fn}">
        <div class="ico">${IC(o.ic)}</div><div class="num">${o.num}</div><h3>${o.name}</h3><div class="meta">${o.meta}</div>
        ${o.lock ? '<span class="chip gray" style="position:absolute;right:18px;top:18px">Sắp ra mắt</span>' : `<span class="go">${IC('arrow')}</span>`}</button>`;
    const sets = {
      olympia: [
        { ic: 'bolt', num: 'Phần 01', name: 'Khởi Động', meta: `${G.KHOI_DONG_TIME} giây · ${G.KHOI_DONG_COUNT} câu · +10 điểm mỗi câu`, fn: "openSourcePicker('khoi_dong')" },
        { ic: 'puzzle', num: 'Phần 02', name: 'Vượt Chướng Ngại Vật', meta: `${G.VCNV_COUNT} câu · hình ảnh và từ khóa`, fn: "startGame('vcnv')" },
        { ic: 'play', num: 'Phần 03', name: 'Tăng Tốc', meta: `${G.TANG_TOC_COUNT} câu · hình ảnh, video · tối đa 40 điểm`, fn: "startGame('tang_toc')" },
        { ic: 'trophy', num: 'Phần 04', name: 'Về Đích', meta: '3 câu · chọn gói 20 hoặc 30 điểm · Ngôi sao hy vọng', fn: "openSourcePicker('ve_dich')" }],
      ddvq: [
        { ic: 'flag', num: 'ĐĐVQ · Phần 01', name: 'Xuất Phát', meta: `${G.XUAT_PHAT_TIME} giây · ${G.XUAT_PHAT_COUNT} câu · +10 điểm mỗi câu`, fn: "startGame('xuat_phat')" },
        { ic: 'crown', num: 'ĐĐVQ · Phần 02', name: 'Vinh Quang', meta: 'Đang được phát triển', lock: 1 }],
      trieuphu: [{ ic: 'tv', num: 'Ai là triệu phú', name: 'Sắp ra mắt', meta: 'Chế độ luyện 15 câu hỏi trắc nghiệm tăng dần độ khó đang được chuẩn bị.', lock: 1 }],
      vuatv: [{ ic: 'book', num: 'Vua Tiếng Việt', name: 'Sắp ra mắt', meta: 'Chế độ luyện chính tả, từ ngữ và thành ngữ đang được chuẩn bị.', lock: 1 }]
    };
    el.innerHTML = `<div class="page">
      <div class="page-head rv"><div style="flex:1"><h1>Luyện tập</h1><p>Chọn cuộc thi và phần thi để bắt đầu. Sau mỗi ván, hệ thống ghi lại môn còn yếu để gợi ý lần luyện kế tiếp.</p></div>
        <button class="pbtn" onclick="AUTH.openLeaderboard()">${IC('trophy')} Bảng xếp hạng</button>
        <button class="pbtn p" onclick="startWeakPractice()">${IC('target')} Luyện môn còn yếu</button></div>
      <div class="practice-top rv"><div class="seg">${[['olympia', 'Đường lên đỉnh Olympia'], ['ddvq', 'Đường đến Vinh quang'], ['trieuphu', 'Ai là triệu phú'], ['vuatv', 'Vua Tiếng Việt']].map(t => `<button class="${tab === t[0] ? 'on' : ''}" onclick="PORTAL.setTab('${t[0]}')">${t[1]}</button>`).join('')}</div></div>
      <div class="grid4" style="${(sets[tab].length < 3) ? 'grid-template-columns:repeat(auto-fill,minmax(260px,1fr))' : ''}">${sets[tab].map(card).join('')}</div>
      <div class="glass rv" style="margin-top:22px;padding:18px 22px;display:flex;align-items:center;gap:14px"><div style="flex:1"><b>Màn giới thiệu trước phần thi</b><div class="nb-note">Bật để xem hiệu ứng mở đầu, tắt để vào thẳng câu hỏi.</div></div><button class="toggle ${on ? 'on' : ''}" id="intro-toggle-switch" onclick="toggleIntroSetting();this.classList.toggle('on')" aria-label="Bật tắt màn giới thiệu"></button></div>
    </div>`;
    observe(el); bindScroll(el);
  }
  function setTab(t) { tab = t; renderPractice(); }

  // ---------- trang module chưa có chức năng ----------
  const PAGES = {
    store: { ic: 'store', t: 'Cửa hàng bộ câu hỏi', lead: 'Nơi học sinh chia sẻ tài liệu và bộ câu hỏi: PDF, Word, Excel và các định dạng khác, kèm nhãn bản quyền của trường.',
      feats: ['Tìm kiếm theo môn, cấp lớp, định dạng', 'Nhãn bản quyền cho từng tài liệu (tác giả, trường, giấy phép)', 'Đánh giá và báo cáo tài liệu không phù hợp', 'Đưa tài liệu thẳng vào Sổ nghiên cứu'] },
    report: { ic: 'chart', t: 'Báo cáo', lead: 'Báo cáo cá nhân về quá trình học: môn mạnh yếu, tiến bộ theo thời gian và gợi ý ôn tập.',
      feats: ['Biểu đồ tiến bộ theo tuần', 'Bản đồ môn mạnh – yếu', 'Lịch sử các ván và sổ nghiên cứu', 'Xuất báo cáo để nộp cho giáo viên'], btn: ['Xem môn cần luyện trong Hồ sơ', 'AUTH.openProfile()'] },
    community: { ic: 'users', t: 'Cộng đồng', lead: 'Không gian trao đổi, hỏi đáp và thi đấu cùng các bạn học sinh.',
      feats: ['Diễn đàn hỏi đáp theo môn', 'Thi đấu nhóm theo thời gian thực', 'Nhóm học theo lớp, theo trường', 'Bảng vinh danh'], btn: ['Xem bảng xếp hạng', 'AUTH.openLeaderboard()'] }
  };
  function page(k) {
    const id = k + '-screen'; showScreen(id);
    if (k === 'support') return support();
    const p = PAGES[k];
    $(id).innerHTML = `<div class="page"><div class="page-head rv"><div style="flex:1"><h1>${p.t}</h1><p>${p.lead}</p></div><span class="chip gray">Sắp ra mắt</span></div>
      ${k === 'store' ? `<div class="practice-top rv"><div class="search">${IC('search')}<input placeholder="Tìm tài liệu, bộ câu hỏi…" disabled></div><div class="seg">${['Tất cả', 'PDF', 'Word', 'Excel', 'Bộ câu hỏi'].map((x, i) => `<button class="${i ? '' : 'on'}" disabled>${x}</button>`).join('')}</div></div>` : ''}
      <div class="glass rv empty"><div class="ico">${IC(p.ic)}</div><h3>Đang được xây dựng</h3><p>Chức năng này đã có chỗ sẵn trong hệ thống và sẽ được mở khi hoàn thiện.</p>${p.btn ? `<button class="pbtn p" onclick="${p.btn[1]}">${p.btn[0]}</button>` : ''}</div>
      <div class="sec" style="margin-top:46px"><div class="sec-head rv"><h2 style="font-size:24px">Dự kiến sẽ có</h2></div><div class="grid2">${p.feats.map((f, i) => `<div class="pc glass static rv soon" style="--d:${i * .06}s;flex-direction:row;align-items:center;gap:14px"><div class="ico" style="margin:0">${IC('check')}</div><p style="font-size:15px;color:var(--text)">${f}</p></div>`).join('')}</div></div></div>`;
    observe($(id)); bindScroll($(id));
  }
  function support() {
    const faq = [
      ['Bắt đầu luyện tập như thế nào?', 'Vào mục Luyện tập, chọn cuộc thi và phần thi. Với Khởi Động và Về Đích, bạn có thể chọn phạm vi (tuần, tháng, quý) và môn học trước khi vào.'],
      ['Nút "Ưu tiên môn còn yếu" hoạt động ra sao?', 'Sau khi bạn chơi một số ván, hệ thống ước lượng mức nắm từng môn. Khi bật nút này, các câu thuộc môn còn yếu được chọn nhiều hơn. Nút chỉ khả dụng cho tài khoản không nằm trong nhóm đối chứng của nghiên cứu.'],
      ['Sổ nghiên cứu lưu dữ liệu ở đâu?', 'Trong trình duyệt của bạn trên thiết bị đang dùng. Đổi máy hoặc xóa dữ liệu trình duyệt sẽ mất sổ. Nội dung nguồn được gửi cho Gemini để phân tích, vì vậy đừng tải tài liệu chứa thông tin cá nhân.'],
      ['Vì sao AI trả lời sai hoặc link không mở được?', 'AI có thể sai. Hãy đối chiếu với tài liệu gốc. Các link trong câu trả lời lấy từ nguồn của bạn hoặc Wikipedia; nếu link hỏng, hãy dùng nút tìm kiếm trong mục "Tìm tài liệu".'],
      ['Tôi bị giới hạn lượt dùng AI?', 'Mỗi tài khoản có hạn mức lượt AI mỗi ngày để tránh quá tải và tốn kém. Hạn mức hiện ở góc trên của Sổ nghiên cứu và đặt lại mỗi ngày.'],
      ['Tôi muốn rút khỏi nghiên cứu?', 'Mở Hồ sơ, tại thẻ "Tham gia nghiên cứu" chọn rút, dữ liệu nghiên cứu của bạn sẽ bị xóa.']
    ];
    $('support-screen').innerHTML = `<div class="page"><div class="page-head rv"><div style="flex:1"><h1>Hỗ trợ</h1><p>Hướng dẫn nhanh và các câu hỏi thường gặp.</p></div></div>
      <div class="faq">${faq.map((f, i) => `<details class="rv" style="--d:${i * .04}s"><summary>${f[0]}</summary><p>${f[1]}</p></details>`).join('')}</div>
      <div class="glass rv empty" style="margin-top:30px"><div class="ico">${IC('message')}</div><h3>Gửi phản hồi</h3><p>Biểu mẫu gửi phản hồi sẽ sớm có ở đây. Hiện tại, hãy liên hệ quản trị viên hoặc giáo viên phụ trách.</p></div></div>`;
    observe($('support-screen')); bindScroll($('support-screen'));
  }

  function init() { applyLook(); ensureScreens(); buildNav(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  return { go, home, practice, renderPractice, setTab, page, onScreen, togglePop, closePop, setMode, setAcc, toggleMenu, observe, bindScroll, renderNavRight, ensureScreens };
})();
