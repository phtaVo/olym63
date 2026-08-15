// ============================================================
// AUTH — đăng nhập / hồ sơ / quản trị / bảng xếp hạng
// Gọi tới Worker "olympia-accounts-api" (xem worker-accounts/README.md)
// ============================================================
const AUTH = (function () {
  const TOKEN_KEY = 'olympia_token';
  let currentUser = null;
  let adminUsersCache = [];
  let editingUserId = null;
  let lbMode = 'khoi_dong';

  // ---------------- helpers ----------------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function apiBase() { return (CONFIG.ACCOUNTS_API_URL || '').replace(/\/+$/, ''); }
  function backendReady() { return !!apiBase() && apiBase().indexOf('DIEN_URL') === -1; }
  function getToken() { try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; } }
  function setToken(t) { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch (e) {} }

  async function apiFetch(path, opts) {
    opts = opts || {};
    const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    const token = getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;
    let res;
    try {
      res = await fetch(apiBase() + path, Object.assign({}, opts, { headers }));
    } catch (e) {
      throw new Error('Không kết nối được máy chủ. Kiểm tra mạng hoặc thử lại sau.');
    }
    let data = {};
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) {
      const err = new Error(data.error || 'Có lỗi xảy ra (' + res.status + ').');
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function avatarHtml(avatar, name, size) {
    size = size || 44;
    if (avatar) return `<img class="avatar-img" src="${avatar}" style="width:${size}px;height:${size}px" alt="avatar">`;
    const letter = (name || '?').trim().charAt(0).toUpperCase() || '?';
    return `<div class="avatar-fallback" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.42)}px">${esc(letter)}</div>`;
  }

  // ============================================================
  // BOOT
  // ============================================================
  async function boot() {
    if (!backendReady()) {
      console.warn('[AUTH] CONFIG.ACCOUNTS_API_URL chưa được cấu hình — bỏ qua đăng nhập, vào thẳng trang chủ.');
      showScreen('home-screen'); renderHome(); return;
    }
    const token = getToken();
    if (!token) { showScreen('login-screen'); return; }
    showScreen('loading-overlay');
    try {
      const data = await apiFetch('/me');
      currentUser = data.user;
      afterLogin();
    } catch (e) {
      setToken(null);
      showScreen('login-screen');
    }
  }

  function afterLogin() {
    const adminBtn = document.getElementById('tab-admin-btn');
    if (adminBtn) adminBtn.classList.toggle('hidden', !currentUser || currentUser.role !== 'admin');
    renderSidenavUser();
    showScreen('home-screen');
    renderHome();
  }

  function renderSidenavUser() {
    const slot = document.getElementById('sidenav-avatar-slot');
    if (!slot) return;
    const u = currentUser || {};
    slot.innerHTML = avatarHtml(u.avatar, u.username, 40);
    const btn = document.getElementById('sidenav-avatar-btn');
    if (btn) btn.title = (u.username || 'Hồ sơ của tôi') + ' — bấm để xem hồ sơ';
  }

  // ============================================================
  // LOGIN / LOGOUT
  // ============================================================
  async function login() {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const btn = document.getElementById('login-submit-btn');
    hideLoginErr();
    if (!backendReady()) { showLoginErr('Hệ thống tài khoản chưa được cấu hình (ACCOUNTS_API_URL). Liên hệ quản trị viên.'); return; }
    if (!username || !password) { showLoginErr('Vui lòng nhập tên đăng nhập và mật khẩu.'); return; }
    btn.disabled = true; btn.textContent = 'Đang đăng nhập...';
    try {
      const data = await apiFetch('/login', { method: 'POST', body: JSON.stringify({ username, password }) });
      setToken(data.token);
      currentUser = data.user;
      document.getElementById('login-password').value = '';
      afterLogin();
    } catch (e) {
      showLoginErr(e.message || 'Đăng nhập thất bại.');
    }
    btn.disabled = false; btn.textContent = 'Đăng nhập';
  }
  function showLoginErr(msg) {
    const el = document.getElementById('login-error');
    el.textContent = msg; el.classList.remove('hidden');
  }
  function hideLoginErr() {
    const el = document.getElementById('login-error');
    el.classList.add('hidden'); el.textContent = '';
  }
  function loginKeydown(e) { if (e.key === 'Enter') login(); }

  function confirmLogout() {
    if (confirm('Đăng xuất khỏi tài khoản này?')) logout();
  }
  function logout() {
    setToken(null); currentUser = null;
    document.getElementById('login-username').value = '';
    document.getElementById('login-password').value = '';
    hideLoginErr();
    showScreen('login-screen');
  }

  function gotoHome() { showScreen('home-screen'); renderHome(); }

  // ============================================================
  // HOME (render động — có chip người dùng)
  // ============================================================
  function renderHome() {
    const el = document.getElementById('home-screen');
    const u = currentUser || {};
    el.innerHTML = `
      <div class="home-content">
      <div class="logo-area">
        <img class="logo-emblem" src="assets/logo.png" alt="Olympia" onerror="this.style.display='none'">
        <div class="logo-badge">Sân chơi tri thức</div>
        <div class="logo-title">Đường Lên<br><span>Đỉnh Olympia</span></div>
        <div class="logo-sub">Chọn phần thi để bắt đầu</div>
      </div>
      <div class="home-right">
      <div class="sections-grid">
        <div class="section-card" onclick="startGame('khoi_dong')">
          <div class="section-badge live">Đang mở</div>
          <div class="section-icon">🚀</div>
          <div class="section-num">Phần 01</div>
          <div class="section-name">Khởi<br>Động</div>
          <div class="section-desc">70 giây · 12 câu · +10đ/câu</div>
        </div>
        <div class="section-card" onclick="startGame('ve_dich')">
          <div class="section-badge live">Đang mở</div>
          <div class="section-icon">🏆</div>
          <div class="section-num">Phần 04</div>
          <div class="section-name">Về<br>Đích</div>
          <div class="section-desc">6 câu · 10/20/30đ · Ngôi sao HV</div>
        </div>
        <div class="section-card locked" onclick="showComingSoon('Vượt Chướng Ngại Vật')">
          <div class="section-badge">Sắp ra mắt</div>
          <div class="section-icon">🧩</div>
          <div class="section-num">Phần 02</div>
          <div class="section-name">Vượt<br>Chướng Ngại Vật</div>
          <div class="section-desc">60 giây · 1 từ hàng rào</div>
        </div>
        <div class="section-card locked" onclick="showComingSoon('Tăng Tốc')">
          <div class="section-badge">Sắp ra mắt</div>
          <div class="section-icon">⚡</div>
          <div class="section-num">Phần 03</div>
          <div class="section-name">Tăng<br>Tốc</div>
          <div class="section-desc">Nhanh tay · Nhanh mắt</div>
        </div>
      </div>
      <div class="intro-toggle-row">
        <span class="intro-toggle-label">🎬 Hiệu ứng giới thiệu</span>
        <button class="intro-toggle-switch" id="intro-toggle-switch" onclick="toggleIntroSetting()" title="Bật/tắt màn giới thiệu trước khi vào phần thi"></button>
      </div>
      </div>
      </div>`;
    if (typeof updateIntroToggleUI === 'function') updateIntroToggleUI();
  }

  // ============================================================
  // SCORES
  // ============================================================
  function submitScore(mode, score) {
    if (!backendReady() || !getToken()) return;
    apiFetch('/scores', { method: 'POST', body: JSON.stringify({ mode, score }) }).catch(e => {
      console.warn('[AUTH] Không lưu được điểm:', e.message);
    });
  }

  // ============================================================
  // LEADERBOARD
  // ============================================================
  function openLeaderboard() {
    showScreen('leaderboard-screen');
    renderLeaderboardShell();
    loadLeaderboard(lbMode);
  }
  function renderLeaderboardShell() {
    const el = document.getElementById('leaderboard-screen');
    el.innerHTML = `
      <div class="lb-topbar">
        <div class="lb-title">🏆 Bảng xếp hạng</div>
      </div>
      <div class="lb-tabs">
        <button class="lb-tab ${lbMode === 'khoi_dong' ? 'active' : ''}" onclick="AUTH.switchLeaderboardTab('khoi_dong')">🚀 Khởi Động</button>
        <button class="lb-tab ${lbMode === 've_dich' ? 'active' : ''}" onclick="AUTH.switchLeaderboardTab('ve_dich')">🏆 Về Đích</button>
      </div>
      <div class="lb-list" id="lb-list"><div class="lb-loading">Đang tải...</div></div>`;
  }
  function switchLeaderboardTab(mode) {
    if (mode === lbMode) return;
    lbMode = mode;
    document.querySelectorAll('.lb-tab').forEach(b => b.classList.remove('active'));
    event.target.closest('.lb-tab').classList.add('active');
    document.getElementById('lb-list').innerHTML = '<div class="lb-loading">Đang tải...</div>';
    loadLeaderboard(mode);
  }
  async function loadLeaderboard(mode) {
    const listEl = document.getElementById('lb-list');
    try {
      const data = await apiFetch('/leaderboard?mode=' + encodeURIComponent(mode));
      const rows = data.leaderboard || [];
      if (!listEl) return;
      if (!rows.length) {
        listEl.innerHTML = `<div class="lb-empty">Chưa có ai chơi phần thi này cả — hãy là người đầu tiên! 🎯</div>`;
        return;
      }
      const medals = ['🥇', '🥈', '🥉'];
      listEl.innerHTML = rows.map((r, i) => `
        <div class="lb-row ${i < 3 ? 'lb-top' + (i + 1) : ''} ${currentUser && r.id === currentUser.id ? 'lb-me' : ''}">
          <div class="lb-rank">${medals[i] || (i + 1)}</div>
          ${avatarHtml(r.avatar, r.username, 42)}
          <div class="lb-info">
            <div class="lb-name">${esc(r.full_name || r.username)}</div>
            <div class="lb-sub">${esc(r.school || '')}${r.class ? ' · ' + esc(r.class) : ''} · ${r.total_games} trận</div>
          </div>
          <div class="lb-score">
            <div class="lb-score-num">${r.avg_score}</div>
            <div class="lb-score-label">điểm TB</div>
          </div>
        </div>`).join('');
    } catch (e) {
      if (listEl) listEl.innerHTML = `<div class="lb-empty">Không tải được bảng xếp hạng: ${esc(e.message)}</div>`;
    }
  }

  // ============================================================
  // PROFILE
  // ============================================================
  function openProfile() {
    showScreen('profile-screen');
    renderProfile();
  }
  function renderProfile() {
    const el = document.getElementById('profile-screen');
    const u = currentUser || {};
    el.innerHTML = `
      <div class="profile-topbar"><div class="profile-title">👤 Hồ sơ của tôi</div></div>
      <div class="profile-body">
        <div class="profile-avatar-wrap">
          <div class="profile-avatar-click" onclick="document.getElementById('avatar-file-input').click()">
            ${avatarHtml(u.avatar, u.username, 96)}
            <div class="profile-avatar-edit">📷</div>
          </div>
          <input type="file" id="avatar-file-input" accept="image/*" style="display:none" onchange="AUTH.onAvatarSelected(event)">
          <div class="profile-avatar-hint">Bấm vào ảnh để đổi ảnh đại diện</div>
        </div>

        <div class="profile-card">
          <label class="profile-field-label">Tên người dùng (có thể đổi)</label>
          <div class="profile-username-row">
            <input type="text" id="profile-username-input" class="profile-input" value="${esc(u.username)}">
            <button class="btn btn-primary btn-sm" onclick="AUTH.saveUsername()">Lưu</button>
          </div>
        </div>

        <div class="profile-card">
          <div class="profile-info-row"><span class="profile-info-label">Họ và tên</span><span class="profile-info-value">${esc(u.full_name)}</span></div>
          <div class="profile-info-row"><span class="profile-info-label">Trường</span><span class="profile-info-value">${esc(u.school) || '—'}</span></div>
          <div class="profile-info-row"><span class="profile-info-label">Lớp</span><span class="profile-info-value">${esc(u.class) || '—'}</span></div>
          <div class="profile-info-row"><span class="profile-info-label">Email</span><span class="profile-info-value">${esc(u.email) || '—'}</span></div>
          <div class="profile-info-row"><span class="profile-info-label">Số điện thoại</span><span class="profile-info-value">${esc(u.phone) || '—'}</span></div>
          <div class="profile-info-note">⚠️ Các thông tin này do quản trị viên cấp — liên hệ quản trị viên nếu cần sửa.</div>
        </div>

        <div class="profile-card">
          <div class="profile-card-title">🔒 Đổi mật khẩu</div>
          <label class="profile-field-label">Mật khẩu hiện tại</label>
          <input type="password" id="pw-old" class="profile-input" autocomplete="current-password">
          <label class="profile-field-label">Mật khẩu mới</label>
          <input type="password" id="pw-new" class="profile-input" autocomplete="new-password">
          <div class="profile-form-error hidden" id="pw-error"></div>
          <div class="profile-form-ok hidden" id="pw-ok"></div>
          <button class="btn btn-primary" style="margin-top:14px;width:100%;" onclick="AUTH.changePassword()">Đổi mật khẩu</button>
        </div>

        <button class="btn btn-outline profile-logout-btn" onclick="AUTH.confirmLogout()">Đăng xuất</button>
      </div>`;
  }

  async function saveUsername() {
    const input = document.getElementById('profile-username-input');
    const newUsername = input.value.trim();
    if (!newUsername) { showToast('Tên người dùng không được để trống.'); return; }
    if (newUsername === currentUser.username) return;
    try {
      const data = await apiFetch('/update-profile', { method: 'POST', body: JSON.stringify({ username: newUsername }) });
      currentUser = data.user;
      renderSidenavUser();
      showToast('✅ Đã đổi tên người dùng!');
      renderProfile();
    } catch (e) {
      showToast('❌ ' + e.message);
    }
  }

  function onAvatarSelected(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast('Vui lòng chọn 1 file ảnh.'); return; }
    const reader = new FileReader();
    reader.onload = function (ev) {
      const img = new Image();
      img.onload = function () {
        const SIZE = 200;
        const canvas = document.createElement('canvas');
        canvas.width = SIZE; canvas.height = SIZE;
        const ctx = canvas.getContext('2d');
        const s = Math.min(img.width, img.height);
        const sx = (img.width - s) / 2, sy = (img.height - s) / 2;
        ctx.drawImage(img, sx, sy, s, s, 0, 0, SIZE, SIZE);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        uploadAvatar(dataUrl);
      };
      img.onerror = function () { showToast('Không đọc được ảnh này.'); };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }
  async function uploadAvatar(dataUrl) {
    showToast('⏳ Đang tải ảnh lên...');
    try {
      const data = await apiFetch('/update-profile', { method: 'POST', body: JSON.stringify({ avatar: dataUrl }) });
      currentUser = data.user;
      renderSidenavUser();
      showToast('✅ Đã đổi ảnh đại diện!');
      renderProfile();
    } catch (e) {
      showToast('❌ ' + e.message);
    }
  }

  async function changePassword() {
    const oldPassword = document.getElementById('pw-old').value;
    const newPassword = document.getElementById('pw-new').value;
    const errEl = document.getElementById('pw-error');
    const okEl = document.getElementById('pw-ok');
    errEl.classList.add('hidden'); okEl.classList.add('hidden');
    if (!oldPassword || !newPassword) { errEl.textContent = 'Vui lòng nhập đủ 2 mật khẩu.'; errEl.classList.remove('hidden'); return; }
    try {
      const data = await apiFetch('/change-password', { method: 'POST', body: JSON.stringify({ oldPassword, newPassword }) });
      setToken(data.token);
      document.getElementById('pw-old').value = '';
      document.getElementById('pw-new').value = '';
      okEl.textContent = '✅ Đã đổi mật khẩu thành công!'; okEl.classList.remove('hidden');
    } catch (e) {
      errEl.textContent = e.message; errEl.classList.remove('hidden');
    }
  }

  // ============================================================
  // ADMIN
  // ============================================================
  function openAdmin() {
    if (!currentUser || currentUser.role !== 'admin') { showToast('Chỉ admin mới vào được trang này.'); gotoHome(); return; }
    showScreen('admin-screen');
    renderAdminShell();
    loadAdminUsers();
  }
  function renderAdminShell() {
    const el = document.getElementById('admin-screen');
    el.innerHTML = `
      <div class="admin-topbar">
        <div class="admin-title">⚙️ Quản trị tài khoản</div>
        <button class="btn btn-primary btn-sm" onclick="AUTH.openUserModal()">➕ Thêm</button>
      </div>
      <div class="admin-body" id="admin-body"><div class="lb-loading">Đang tải...</div></div>`;
  }
  async function loadAdminUsers() {
    const body = document.getElementById('admin-body');
    try {
      const data = await apiFetch('/admin/users');
      adminUsersCache = data.users || [];
      renderAdminUsers();
    } catch (e) {
      if (body) body.innerHTML = `<div class="lb-empty">Không tải được danh sách: ${esc(e.message)}</div>`;
    }
  }
  function renderAdminUsers() {
    const body = document.getElementById('admin-body');
    if (!body) return;
    if (!adminUsersCache.length) { body.innerHTML = `<div class="lb-empty">Chưa có tài khoản nào — bấm "➕ Thêm" để tạo.</div>`; return; }
    body.innerHTML = adminUsersCache.map(u => `
      <div class="admin-user-card">
        ${avatarHtml(u.avatar, u.username, 48)}
        <div class="admin-user-info">
          <div class="admin-user-name">${esc(u.full_name)} ${u.role === 'admin' ? '<span class="admin-role-badge">Admin</span>' : ''}</div>
          <div class="admin-user-sub">@${esc(u.username)} · ${esc(u.school || '—')}${u.class ? ' · ' + esc(u.class) : ''}</div>
          <div class="admin-user-sub">${esc(u.email || '')}${u.email && u.phone ? ' · ' : ''}${esc(u.phone || '')}</div>
        </div>
        <div class="admin-user-actions">
          <button class="icon-btn" onclick="AUTH.openUserModal(${u.id})" title="Sửa">✏️</button>
          <button class="icon-btn admin-del-btn" onclick="AUTH.deleteUser(${u.id})" title="Xoá">🗑️</button>
        </div>
      </div>`).join('');
  }

  function openUserModal(userId) {
    editingUserId = userId || null;
    const u = userId ? adminUsersCache.find(x => x.id === userId) : null;
    document.getElementById('admin-modal-title').textContent = u ? '✏️ Sửa tài khoản' : '➕ Thêm tài khoản';
    document.getElementById('admin-form-error').classList.add('hidden');
    document.getElementById('admin-form').innerHTML = `
      <label class="profile-field-label">Họ và tên *</label>
      <input type="text" id="uf-full_name" class="profile-input" value="${u ? esc(u.full_name) : ''}">

      <label class="profile-field-label">Tên đăng nhập *</label>
      <input type="text" id="uf-username" class="profile-input" value="${u ? esc(u.username) : ''}">

      <label class="profile-field-label">${u ? 'Đặt lại mật khẩu (để trống nếu không đổi)' : 'Mật khẩu *'}</label>
      <input type="password" id="uf-password" class="profile-input" autocomplete="new-password">

      <div class="uf-grid">
        <div>
          <label class="profile-field-label">Trường</label>
          <input type="text" id="uf-school" class="profile-input" value="${u ? esc(u.school || '') : ''}">
        </div>
        <div>
          <label class="profile-field-label">Lớp</label>
          <input type="text" id="uf-class" class="profile-input" value="${u ? esc(u.class || '') : ''}">
        </div>
      </div>
      <div class="uf-grid">
        <div>
          <label class="profile-field-label">Email</label>
          <input type="text" id="uf-email" class="profile-input" value="${u ? esc(u.email || '') : ''}">
        </div>
        <div>
          <label class="profile-field-label">Số điện thoại</label>
          <input type="text" id="uf-phone" class="profile-input" value="${u ? esc(u.phone || '') : ''}">
        </div>
      </div>

      <label class="profile-field-label">Vai trò</label>
      <select id="uf-role" class="profile-input">
        <option value="user" ${!u || u.role === 'user' ? 'selected' : ''}>Người dùng</option>
        <option value="admin" ${u && u.role === 'admin' ? 'selected' : ''}>Admin</option>
      </select>`;
    document.getElementById('admin-user-modal').classList.add('show');
  }
  function closeUserModal(e) {
    if (e && e.target && e.target.id !== 'admin-user-modal') return;
    document.getElementById('admin-user-modal').classList.remove('show');
  }
  async function submitUserForm() {
    const errEl = document.getElementById('admin-form-error');
    errEl.classList.add('hidden');
    const full_name = document.getElementById('uf-full_name').value.trim();
    const username = document.getElementById('uf-username').value.trim();
    const password = document.getElementById('uf-password').value;
    const school = document.getElementById('uf-school').value.trim();
    const klass = document.getElementById('uf-class').value.trim();
    const email = document.getElementById('uf-email').value.trim();
    const phone = document.getElementById('uf-phone').value.trim();
    const role = document.getElementById('uf-role').value;

    if (!full_name || !username) { errEl.textContent = 'Vui lòng nhập họ tên và tên đăng nhập.'; errEl.classList.remove('hidden'); return; }
    if (!editingUserId && !password) { errEl.textContent = 'Vui lòng đặt mật khẩu cho tài khoản mới.'; errEl.classList.remove('hidden'); return; }

    const btn = document.getElementById('admin-form-submit');
    btn.disabled = true; btn.textContent = 'Đang lưu...';
    try {
      if (editingUserId) {
        const body = { full_name, username, school, class: klass, email, phone, role };
        if (password) body.newPassword = password;
        await apiFetch('/admin/users/' + editingUserId, { method: 'PUT', body: JSON.stringify(body) });
        showToast('✅ Đã cập nhật tài khoản.');
      } else {
        await apiFetch('/admin/users', { method: 'POST', body: JSON.stringify({ full_name, username, password, school, class: klass, email, phone, role }) });
        showToast('✅ Đã tạo tài khoản mới.');
      }
      closeUserModal();
      loadAdminUsers();
    } catch (e) {
      errEl.textContent = e.message; errEl.classList.remove('hidden');
    }
    btn.disabled = false; btn.textContent = 'Lưu';
  }
  async function deleteUser(id) {
    const u = adminUsersCache.find(x => x.id === id);
    if (!confirm(`Xoá tài khoản "${u ? u.full_name : id}"? Toàn bộ điểm số của tài khoản này cũng sẽ bị xoá.`)) return;
    try {
      await apiFetch('/admin/users/' + id, { method: 'DELETE' });
      showToast('🗑️ Đã xoá tài khoản.');
      loadAdminUsers();
    } catch (e) {
      showToast('❌ ' + e.message);
    }
  }

  return {
    boot, login, loginKeydown, logout, confirmLogout, gotoHome,
    submitScore,
    openLeaderboard, switchLeaderboardTab,
    openProfile, saveUsername, onAvatarSelected, changePassword,
    openAdmin, openUserModal, closeUserModal, submitUserForm, deleteUser,
    getCurrentUser: () => currentUser,
  };
})();
