// ============================================================
// MODULE SOLO — thi đấu nhóm 2-4 người, real-time
// Hiện có: Giành chuông (bộ câu hỏi Khởi động chung / Về đích)
// Tăng tốc trong Solo sẽ được bổ sung sau.
//
// Dùng chung với app.js: verifyAnswer(), loadKhoiDong(), loadVeDich(),
// AUDIO, CONFIG, showToast(), showScreen(), goHome(), escapeHTML()
// (tất cả là biến/hàm toàn cục do các file này chỉ dùng thẻ <script>
// thường, không phải module — nhất quán với cách app.js/auth.js viết).
// ============================================================
const SOLO = (function () {
  let presenceWS = null;
  let presenceReconnectTimer = null;
  let roomWS = null;
  let myUsername = null;
  let myAvatar = null;
  let isHost = false;
  let pendingInvite = null; // { fromUsername, fromAvatar, roomCode, gameMode, sheet }
  let composeSheet = 'khoi_dong';
  let localTimer = null;
  let localTimeLeft = 0;

  const room = {
    code: null, hostUsername: null, phase: 'idle', sheet: null,
    players: [], questions: [], currentIndex: -1, total: 0,
    currentQuestion: null, subphase: null, phaseDuration: 0,
    readyUsernames: [], myReady: false, buzzedUsername: null,
    myAnswer: '', lastResult: null, finalPlayers: null
  };

  // ---------------- HELPERS ----------------
  function wsBase() {
    if (CONFIG.SOLO_WS_URL) return CONFIG.SOLO_WS_URL.replace(/\/+$/, '');
    // Tự nhận diện: dùng đúng máy chủ đang phục vụ trang này (local-server qua Wi-Fi)
    if (!window.location.host) return '';
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}`;
  }
  function httpBase() {
    if (CONFIG.SOLO_WS_URL) return CONFIG.SOLO_WS_URL.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:').replace(/\/+$/, '');
    if (!window.location.host) return '';
    return `${window.location.protocol}//${window.location.host}`;
  }
  function backendReady() { return !!wsBase(); }
  function esc(s) { return typeof escapeHTML === 'function' ? escapeHTML(s) : String(s == null ? '' : s); }
  function me() {
    const u = (typeof AUTH !== 'undefined' && AUTH.getCurrentUser) ? (AUTH.getCurrentUser() || {}) : {};
    return { username: u.username || '', avatar: u.avatar || null };
  }
  function playBuzzerSfx() {
    const el = document.getElementById('audio-buzzer');
    if (el && el.src) { el.currentTime = 0; el.play().catch(() => {}); }
  }

  // ============================================================
  // PRESENCE — kết nối luôn giữ khi đã đăng nhập, để nhận lời mời
  // ============================================================
  function connectPresence() {
    if (!backendReady()) return;
    const u = me();
    if (!u.username) return;
    myUsername = u.username; myAvatar = u.avatar;
    if (presenceWS && (presenceWS.readyState === WebSocket.OPEN || presenceWS.readyState === WebSocket.CONNECTING)) return;
    try {
      presenceWS = new WebSocket(`${wsBase()}/presence/ws?username=${encodeURIComponent(myUsername)}`);
    } catch (e) { return; }
    presenceWS.onmessage = onPresenceMessage;
    presenceWS.onclose = () => {
      presenceWS = null;
      if (presenceReconnectTimer) clearTimeout(presenceReconnectTimer);
      presenceReconnectTimer = setTimeout(connectPresence, 4000);
    };
    presenceWS.onerror = () => { try { presenceWS.close(); } catch (e) {} };
  }
  function disconnectPresence() {
    if (presenceReconnectTimer) { clearTimeout(presenceReconnectTimer); presenceReconnectTimer = null; }
    if (presenceWS) { try { presenceWS.close(); } catch (e) {} presenceWS = null; }
  }
  function sendPresence(obj) {
    if (presenceWS && presenceWS.readyState === WebSocket.OPEN) presenceWS.send(JSON.stringify(obj));
  }

  function onPresenceMessage(ev) {
    let msg; try { msg = JSON.parse(ev.data); } catch (e) { return; }
    if (msg.type === 'invite_received') {
      pendingInvite = msg;
      showInviteModal(msg);
    } else if (msg.type === 'invite_response') {
      showToast(msg.accepted ? `✅ ${msg.fromUsername} đã chấp nhận lời mời!` : `❌ ${msg.fromUsername} đã từ chối lời mời.`);
    } else if (msg.type === 'invite_sent_ack') {
      if (msg.offline && msg.offline.length) showToast(`⚠️ Chưa thấy online: ${msg.offline.join(', ')} (họ cần mở app để nhận lời mời)`);
    }
  }

  function showInviteModal(msg) {
    const sheetLabel = msg.sheet === 've_dich' ? 'Về đích' : 'Khởi động chung';
    const text = `Người chơi ${msg.fromUsername} muốn mời bạn tham gia thi đấu Giành chuông bộ câu hỏi của phần thi ${sheetLabel}.`;
    const el = document.getElementById('solo-invite-text');
    if (el) el.textContent = text;
    document.getElementById('solo-invite-modal').classList.add('show');
  }
  function hideInviteModal() {
    const m = document.getElementById('solo-invite-modal');
    if (m) m.classList.remove('show');
  }
  function acceptInvite() {
    if (!pendingInvite) return;
    const inv = pendingInvite; pendingInvite = null;
    hideInviteModal();
    isHost = false;
    sendPresence({ type: 'invite_response', toUsername: inv.fromUsername, roomCode: inv.roomCode, accepted: true });
    openLobby();
    connectRoom(inv.roomCode);
  }
  function declineInvite() {
    if (!pendingInvite) return;
    const inv = pendingInvite; pendingInvite = null;
    hideInviteModal();
    sendPresence({ type: 'invite_response', toUsername: inv.fromUsername, roomCode: inv.roomCode, accepted: false });
  }

  // ============================================================
  // ROOM
  // ============================================================
  function connectRoom(code, onOpenExtra) {
    closeRoom(true);
    room.code = code;
    const url = `${wsBase()}/rooms/${encodeURIComponent(code)}/ws?username=${encodeURIComponent(myUsername)}&avatar=${encodeURIComponent(myAvatar || '')}`;
    try { roomWS = new WebSocket(url); } catch (e) { showToast('Không kết nối được phòng.'); return; }
    roomWS.onopen = () => { renderSolo(); if (typeof onOpenExtra === 'function') onOpenExtra(); };
    roomWS.onmessage = onRoomMessage;
    roomWS.onclose = () => { if (room.code && room.phase !== 'finished') showToast('⚠️ Mất kết nối tới phòng.'); };
    roomWS.onerror = () => {};
  }
  function closeRoom(silent) {
    stopLocalTimer();
    if (roomWS) { try { roomWS.close(); } catch (e) {} roomWS = null; }
    room.code = null; room.hostUsername = null; room.phase = 'idle'; room.sheet = null;
    room.players = []; room.questions = []; room.currentIndex = -1; room.total = 0;
    room.currentQuestion = null; room.readyUsernames = []; room.myReady = false;
    room.buzzedUsername = null; room.myAnswer = ''; room.lastResult = null; room.finalPlayers = null;
    if (!silent) renderSolo();
  }
  function sendRoom(obj) {
    if (roomWS && roomWS.readyState === WebSocket.OPEN) roomWS.send(JSON.stringify(obj));
  }

  function onRoomMessage(ev) {
    let msg; try { msg = JSON.parse(ev.data); } catch (e) { return; }
    switch (msg.type) {
      case 'room_state':
        room.hostUsername = msg.hostUsername; room.phase = msg.phase; room.sheet = msg.sheet;
        room.players = msg.players; room.currentIndex = msg.currentIndex; room.total = msg.total;
        if (msg.questions && msg.questions.length) room.questions = msg.questions;
        isHost = (myUsername === room.hostUsername);
        break;
      case 'player_joined': case 'player_left':
        room.players = msg.players; break;
      case 'game_selected':
        room.sheet = msg.sheet; break;
      case 'questions_ready':
        room.sheet = msg.sheet; room.total = msg.total; room.questions = msg.questions;
        room.phase = 'ready_check'; room.readyUsernames = []; room.myReady = false;
        break;
      case 'ready_update':
        room.readyUsernames = msg.readyUsernames; break;
      case 'countdown_start':
        startCountdownUI(msg.seconds); break;
      case 'question_start':
        room.phase = (msg.subphase === 'reading') ? 'question_reading' : 'question_answering';
        room.currentIndex = msg.index; room.subphase = msg.subphase; room.phaseDuration = msg.duration;
        room.currentQuestion = { question: msg.text, answer: (room.questions[msg.index] || {}).answer, points: msg.points };
        room.buzzedUsername = null; room.myAnswer = ''; room.lastResult = null;
        if (room.sheet === 'khoi_dong' && msg.index === 0) AUDIO.playBgKD();
        startLocalTimer(msg.duration);
        break;
      case 'answer_phase_start':
        room.phase = 'question_answering'; room.subphase = 'answering'; room.phaseDuration = msg.duration;
        if (room.currentQuestion) room.currentQuestion.points = msg.points;
        room.buzzedUsername = null; room.myAnswer = '';
        if (msg.points === 10) AUDIO.playCauHoi15s(); else AUDIO.playCauHoiVD();
        startLocalTimer(msg.duration);
        break;
      case 'buzzed':
        room.buzzedUsername = msg.username; playBuzzerSfx();
        break;
      case 'grading_started':
        room.phase = 'grading'; stopLocalTimer();
        if (msg.username === myUsername) doOwnGrading(msg.index);
        break;
      case 'question_result':
        room.phase = 'result'; room.players = msg.players; room.lastResult = msg; stopLocalTimer();
        AUDIO.stopAll();
        if (msg.username) AUDIO.playSFX(msg.correct);
        break;
      case 'game_over':
        room.phase = 'finished'; room.finalPlayers = msg.players; stopLocalTimer(); AUDIO.stopAll();
        break;
      case 'error':
        showToast('⚠️ ' + msg.message); break;
    }
    renderSolo();
  }

  function doOwnGrading(index) {
    const q = room.questions[index];
    const userAnswer = (room.myAnswer || '').trim();
    if (!q || !userAnswer) { sendRoom({ type: 'grade_result', correct: false, userAnswer }); return; }
    verifyAnswer({ question: q.question, userAnswer, correctAnswer: q.answer })
      .then(r => sendRoom({ type: 'grade_result', correct: !!r.correct, userAnswer }))
      .catch(() => sendRoom({ type: 'grade_result', correct: false, userAnswer }));
  }

  // ---------------- Bộ đếm hiển thị cục bộ (server vẫn là trọng tài) ----------------
  function startLocalTimer(seconds) {
    stopLocalTimer();
    localTimeLeft = seconds;
    localTimer = setInterval(() => {
      localTimeLeft = Math.max(0, localTimeLeft - 1);
      const el = document.getElementById('solo-timer-num');
      if (el) { el.textContent = localTimeLeft; el.classList.toggle('danger', localTimeLeft <= 3); }
    }, 1000);
  }
  function stopLocalTimer() { if (localTimer) { clearInterval(localTimer); localTimer = null; } }
  function startCountdownUI(seconds) {
    stopLocalTimer();
    let n = seconds;
    renderSolo();
    localTimer = setInterval(() => {
      n--;
      const el = document.getElementById('solo-countdown-num');
      if (el) el.textContent = n > 0 ? String(n) : '🔔';
      if (n <= 0) { clearInterval(localTimer); localTimer = null; }
    }, 1000);
  }

  // ============================================================
  // HÀNH ĐỘNG NGƯỜI DÙNG
  // ============================================================
  function openLobby() {
    const u = me();
    if (!u.username) { showToast('Vui lòng đăng nhập trước.'); return; }
    myUsername = u.username; myAvatar = u.avatar;
    AUDIO.init(CONFIG.AUDIO_URLS);
    const bz = document.getElementById('audio-buzzer');
    if (bz && CONFIG.AUDIO_URLS.buzzer) bz.src = CONFIG.AUDIO_URLS.buzzer;
    connectPresence();
    showScreen('solo-screen');
    renderSolo();
  }

  function backToHome() {
    if (room.code) {
      if (!confirm('Rời khỏi phòng thi đấu hiện tại?')) return;
      sendRoom({ type: 'leave_room' });
      closeRoom(true);
    }
    goHome();
  }

  function setComposeSheet(sheet) { composeSheet = sheet; renderSolo(); }

  function goToServerAddress() {
    const el = document.getElementById('solo-server-address');
    if (!el) return;
    let addr = el.value.trim();
    if (!addr) { showToast('Nhập địa chỉ máy chủ nhóm.'); return; }
    if (!/^https?:\/\//i.test(addr)) addr = 'http://' + addr;
    window.location.href = addr.replace(/\/+$/, '') + '/';
  }

  async function createAndInvite() {
    if (!backendReady()) { showToast('Chưa cấu hình CONFIG.SOLO_WS_URL.'); return; }
    const raw = document.getElementById('solo-invite-usernames');
    if (!raw) return;
    const usernames = raw.value.split(',').map(s => s.trim()).filter(Boolean).slice(0, 3);
    if (usernames.length === 0) { showToast('Nhập ít nhất 1 tên người chơi để mời.'); return; }
    try {
      const res = await fetch(httpBase() + '/rooms', { method: 'POST' });
      const data = await res.json();
      if (!data.roomCode) throw new Error('no code');
      isHost = true;
      connectRoom(data.roomCode, () => {
        sendRoom({ type: 'set_game', sheet: composeSheet });
        sendPresence({ type: 'invite', toUsernames: usernames, roomCode: data.roomCode, gameMode: 'gianh_chuong', sheet: composeSheet, fromAvatar: myAvatar });
        showToast('📨 Đã gửi lời mời — đang chờ mọi người chấp nhận...');
      });
    } catch (e) {
      showToast('❌ Không tạo được phòng. Kiểm tra CONFIG.SOLO_WS_URL.');
    }
  }

  function joinByCode() {
    if (!backendReady()) { showToast('Chưa cấu hình CONFIG.SOLO_WS_URL.'); return; }
    const el = document.getElementById('solo-join-code');
    if (!el) return;
    const code = el.value.trim().toUpperCase();
    if (!code) { showToast('Nhập mã phòng.'); return; }
    isHost = false;
    connectRoom(code);
  }

  function hostStartMatch() {
    if (!isHost) return;
    const connectedCount = room.players.filter(p => p.connected).length;
    if (connectedCount < 2) { showToast('Cần tối thiểu 2 người chơi đang ở trong phòng.'); return; }
    showToast('⏳ Đang tải câu hỏi...');
    const loader = room.sheet === 've_dich' ? loadVeDich() : loadKhoiDong();
    loader.then(result => {
      if (!result.success) { showToast('❌ ' + (result.error || 'Không tải được câu hỏi.')); return; }
      sendRoom({ type: 'set_questions', questions: result.questions });
    });
  }

  function pressReady() {
    room.myReady = true;
    sendRoom({ type: 'ready_buzz' });
    renderSolo();
  }

  function onAnswerInput(e) { room.myAnswer = e.target.value; }
  function onAnswerKeydown(e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const val = e.target.value.trim();
    room.myAnswer = val;
    sendRoom({ type: 'save_answer', text: val });
    const ind = document.getElementById('solo-saved-indicator');
    if (ind) {
      ind.classList.remove('hidden');
      ind.textContent = val ? `📝 Đã ghi nhận: "${val}"` : '📝 Đã ghi nhận: (để trống)';
    }
  }

  function pressBuzz() {
    if (room.buzzedUsername) return;
    sendRoom({ type: 'buzz' });
  }

  function playAgain() { closeRoom(true); renderSolo(); }

  // ============================================================
  // RENDER
  // ============================================================
  function renderSolo() {
    const el = document.getElementById('solo-screen');
    if (!el || el.classList.contains('hidden')) return;
    if (!backendReady()) { el.innerHTML = htmlNotConfigured(); return; }

    let body;
    switch (room.phase) {
      case 'idle':          body = htmlHome(); break;
      case 'lobby':         body = htmlRoomLobby(); break;
      case 'ready_check':   body = htmlReadyCheck(); break;
      case 'countdown':     body = htmlCountdown(); break;
      case 'question_reading':
      case 'question_answering':
      case 'grading':       body = htmlQuestion(); break;
      case 'result':        body = htmlResult(); break;
      case 'finished':      body = htmlFinished(); break;
      default:              body = htmlHome();
    }
    el.innerHTML = `
      <div class="solo-topbar">
        <button class="solo-back-btn" onclick="SOLO.backToHome()" title="Về trang chủ">←</button>
        <div style="flex:1">
          <div class="solo-title">🎮 Solo${room.code ? ' · Phòng ' + esc(room.code) : ''}</div>
          <div class="solo-subtitle">${subtitleFor(room.phase)}</div>
        </div>
      </div>
      ${body}
    `;
    if (room.phase === 'question_answering') {
      const input = document.getElementById('solo-answer-input');
      if (input) { input.value = room.myAnswer || ''; input.focus(); }
    }
  }

  function subtitleFor(phase) {
    const map = {
      idle: 'Mời bạn bè cùng thi đấu, hoặc nhập mã phòng để vào',
      lobby: 'Chờ mọi người vào phòng',
      ready_check: 'Bấm chuông khi bạn đã sẵn sàng',
      countdown: 'Chuẩn bị...',
      question_reading: 'Đọc câu hỏi',
      question_answering: 'Giành chuông & trả lời',
      grading: 'Đang chấm điểm...',
      result: 'Kết quả',
      finished: 'Kết thúc'
    };
    return map[phase] || '';
  }

  function htmlNotConfigured() {
    return `<div class="solo-card">
      <div class="solo-card-title">⚠️ Không tìm thấy máy chủ Solo</div>
      <div class="solo-hint">Trang này có vẻ đang được mở trực tiếp từ file (không qua server), nên Solo không tự nhận diện được máy chủ. Hãy nhờ người "host" chạy <code>local-server</code> (xem <code>local-server/README.md</code>) rồi mở trang qua địa chỉ <code>http://...</code> mà server đó in ra.</div>
    </div>`;
  }

  function htmlHome() {
    const onLocalhost = /^(localhost|127\.0\.0\.1)/.test(window.location.host);
    const guestJoinCard = onLocalhost ? '' : `
      <div class="solo-card">
        <div class="solo-card-title">🔗 Đã có người tạo máy chủ nhóm?</div>
        <div class="solo-hint" style="margin-bottom:10px">Nhập đúng địa chỉ "Cùng Wi-Fi" mà máy chủ nhóm (host) đã gửi cho bạn (dạng http://192.168.x.x:3000), trình duyệt sẽ tự chuyển qua đó.</div>
        <div class="solo-field">
          <input type="text" class="solo-input" id="solo-server-address" placeholder="http://192.168.1.23:3000">
        </div>
        <button class="btn btn-outline" style="width:100%" onclick="SOLO.goToServerAddress()">Vào máy chủ nhóm</button>
      </div>`;
    const hostDownloadCard = `
      <div class="solo-card">
        <div class="solo-card-title">🖥️ Bạn muốn làm chủ phòng (host)?</div>
        <div class="solo-hint" style="margin-bottom:10px">Tải file chạy sẵn bên dưới (không cần cài Node.js) — bấm đúp để chạy, nó sẽ hiện ra một địa chỉ, gửi địa chỉ đó cho cả nhóm (đang chung Wi-Fi) để họ dán vào ô "Vào máy chủ nhóm" ở trên.</div>
        <div class="solo-choice-row">
          <a class="btn btn-outline" style="text-decoration:none;text-align:center" href="local-server-builds/olym63-solo-server-windows.exe" download>⬇️ Windows</a>
          <a class="btn btn-outline" style="text-decoration:none;text-align:center" href="local-server-builds/olym63-solo-server-macos" download>⬇️ macOS</a>
          <a class="btn btn-outline" style="text-decoration:none;text-align:center" href="local-server-builds/olym63-solo-server-linux" download>⬇️ Linux</a>
        </div>
        <div class="solo-hint" style="margin-top:10px">⚠️ File tải về phải nằm trong thư mục <code>local-server/</code> của project (đúng vị trí file gốc) thì mới đọc được web app. macOS/Linux cần cấp quyền chạy: <code>chmod +x tên-file</code> rồi <code>./tên-file</code>.</div>
        <div class="solo-hint">Sau khi chạy, cửa sổ hiện ra sẽ in 2 địa chỉ — <b>chính host cũng nên mở địa chỉ "Trên máy này" (http://localhost:3000)</b> thay vì ở lại trang này, vì trang GitHub (https) không tự kết nối được vào máy chủ chạy trên Wi-Fi nội bộ (giới hạn bảo mật của trình duyệt).</div>
      </div>`;
    return `
      <div class="solo-hint" style="text-align:center;margin-bottom:14px">Đang dùng máy chủ: <code>${esc(wsBase())}</code> — mọi người cần mở trang qua cùng địa chỉ này (chung Wi-Fi) mới chơi cùng nhau được.</div>
      ${guestJoinCard}
      ${hostDownloadCard}
      <div class="solo-card">
        <div class="solo-card-title">📨 Mời bạn bè thi đấu</div>
        <div class="solo-field">
          <label class="solo-label">Bộ câu hỏi cho Giành chuông</label>
          <div class="solo-choice-row">
            <div class="solo-choice ${composeSheet === 'khoi_dong' ? 'active' : ''}" onclick="SOLO.setComposeSheet('khoi_dong')">Khởi động chung</div>
            <div class="solo-choice ${composeSheet === 've_dich' ? 'active' : ''}" onclick="SOLO.setComposeSheet('ve_dich')">Về đích</div>
          </div>
        </div>
        <div class="solo-field">
          <label class="solo-label">Tên người chơi muốn mời (tối đa 3, cách nhau bởi dấu phẩy)</label>
          <input type="text" class="solo-input" id="solo-invite-usernames" placeholder="vd: minh, lan, hoa">
        </div>
        <button class="btn btn-primary" style="width:100%" onclick="SOLO.createAndInvite()">🔔 Tạo phòng & Gửi lời mời</button>
      </div>
      <div class="solo-card">
        <div class="solo-card-title">🔑 Vào phòng bằng mã</div>
        <div class="solo-field">
          <input type="text" class="solo-input" id="solo-join-code" placeholder="Nhập mã phòng (vd: A1B2C3)" style="text-transform:uppercase">
        </div>
        <button class="btn btn-outline" style="width:100%" onclick="SOLO.joinByCode()">Vào phòng</button>
      </div>
      <div class="solo-card">
        <div class="solo-card-title">⚡ Tăng tốc</div>
        <div class="solo-hint">Sắp ra mắt trong Solo.</div>
      </div>
    `;
  }

  function renderPlayerRow(p, extraClass) {
    const cls = ['solo-player-row'];
    if (!p.connected) cls.push('offline');
    if (extraClass) cls.push(extraClass);
    return `<div class="${cls.join(' ')}">
      <div class="avatar-fallback" style="width:36px;height:36px;font-size:15px">${esc((p.username||'?').charAt(0).toUpperCase())}</div>
      <div class="solo-player-name">${esc(p.username)} ${p.isHost ? '<span class="solo-player-badge">Chủ phòng</span>' : ''}</div>
      <div class="solo-player-status">${p.connected ? '' : 'mất kết nối'}</div>
      <div class="solo-player-score">${p.score || 0}đ</div>
    </div>`;
  }

  function htmlRoomLobby() {
    const players = room.players.map(p => renderPlayerRow(p)).join('');
    const sheetLabel = room.sheet === 've_dich' ? 'Về đích' : 'Khởi động chung';
    return `
      <div class="solo-card">
        <div class="solo-room-code">${esc(room.code)}</div>
        <div class="solo-hint" style="text-align:center;margin-top:6px">Chia sẻ mã này, hoặc chờ lời mời được chấp nhận</div>
      </div>
      <div class="solo-card">
        <div class="solo-card-title">Giành chuông · ${esc(sheetLabel)}</div>
        <div class="solo-player-list">${players || '<div class="solo-hint">Chưa có ai vào phòng.</div>'}</div>
      </div>
      ${isHost
        ? `<button class="btn btn-primary" style="width:100%" onclick="SOLO.hostStartMatch()">🚀 Vào thi đấu (${room.players.filter(p=>p.connected).length}/${MAXP()})</button>`
        : `<div class="solo-hint" style="text-align:center">Đang chờ chủ phòng bắt đầu...</div>`}
    `;
  }
  function MAXP() { return 4; }

  function htmlReadyCheck() {
    const total = room.players.filter(p => p.connected).length;
    const readyCount = room.readyUsernames.length;
    const players = room.players.map(p => renderPlayerRow(p, room.readyUsernames.includes(p.username) ? 'ready' : '')).join('');
    return `
      <div class="solo-buzzer-wrap">
        <button class="solo-buzzer-btn ${room.myReady ? 'claimed' : ''}" ${room.myReady ? 'disabled' : ''} onclick="SOLO.pressReady()">
          🔔<br>Bấm chuông<br>để bắt đầu thi
        </button>
        <div class="solo-hint">${readyCount}/${total} người chơi đã sẵn sàng</div>
      </div>
      <div class="solo-card">
        <div class="solo-player-list">${players}</div>
      </div>
    `;
  }

  function htmlCountdown() {
    return `<div class="solo-countdown" id="solo-countdown-num">3</div>`;
  }

  function htmlQuestion() {
    const q = room.currentQuestion || {};
    const pc = q.points === 10 ? 'p10' : (q.points === 20 ? 'p20' : 'p30');
    const isReading = room.phase === 'question_reading';
    const isGrading = room.phase === 'grading';
    const buzzedPlayer = room.players.find(p => p.username === room.buzzedUsername);

    let meta = '';
    if (room.sheet === 've_dich') {
      meta = `<span class="points-badge ${pc}">+${q.points || 10} điểm</span>
        <span class="phase-badge ${isReading ? 'reading' : 'answering'}">${isReading ? 'Đọc câu hỏi' : 'Trả lời'}</span>`;
    } else {
      meta = `<span class="points-badge p10">+10 điểm</span>`;
    }

    return `
      <div class="solo-timer-row">
        ${!isGrading ? `<div class="solo-timer-num" id="solo-timer-num">${localTimeLeft}</div>` : `<div class="spinner"></div>`}
      </div>
      <div class="question-meta" style="justify-content:center;display:flex;gap:8px;margin-bottom:10px">${meta}</div>
      <div class="solo-question-box"><div class="solo-question-text">${esc(q.question || '...')}</div></div>

      ${isGrading
        ? `<div class="solo-hint" style="text-align:center">🤔 Đang chấm điểm cho <b>${esc(room.buzzedUsername)}</b>...</div>`
        : `
      <div class="solo-buzzer-wrap" style="padding-top:6px">
        <button class="solo-buzzer-btn ${room.buzzedUsername ? 'claimed' : ''}" ${(isReading || room.buzzedUsername) ? 'disabled' : ''} onclick="SOLO.pressBuzz()">
          🔔<br>${room.buzzedUsername ? esc(room.buzzedUsername) + '<br>đã giành!' : 'Giành<br>chuông'}
        </button>
      </div>
      <div class="solo-field">
        <input type="text" class="solo-input" id="solo-answer-input" placeholder="${isReading ? 'Chờ hết thời gian đọc...' : 'Nhập câu trả lời rồi bấm Enter để ghi nhận...'}"
          autocomplete="off" spellcheck="false" ${isReading ? 'disabled' : ''}
          oninput="SOLO.onAnswerInput(event)" onkeydown="SOLO.onAnswerKeydown(event)">
      </div>
      <div class="saved-answer-indicator hidden" id="solo-saved-indicator"></div>
      `}

      <div class="solo-card" style="margin-top:14px">
        <div class="solo-player-list">${room.players.map(p => renderPlayerRow(p, p.username === room.buzzedUsername ? 'buzzed' : '')).join('')}</div>
      </div>
    `;
  }

  function htmlResult() {
    const r = room.lastResult || {};
    let bannerClass = 'none', bannerText = '⌛ Không ai giành chuông kịp — không ai được điểm.';
    if (r.username) {
      bannerClass = r.correct ? 'correct' : 'wrong';
      bannerText = r.correct
        ? `✅ ${esc(r.username)} trả lời đúng! +${r.points} điểm`
        : `❌ ${esc(r.username)} trả lời sai. Đáp án đúng: ${esc(r.correctAnswer)}`;
    }
    const players = [...room.players].sort((a, b) => b.score - a.score).map(p => renderPlayerRow(p)).join('');
    return `
      <div class="solo-result-banner ${bannerClass}">${bannerText}</div>
      ${r.username && r.userAnswer ? `<div class="solo-hint" style="text-align:center;margin-bottom:14px">Đáp án đã nhập: "${esc(r.userAnswer)}"</div>` : ''}
      <div class="solo-card"><div class="solo-player-list">${players}</div></div>
      <div class="solo-hint" style="text-align:center">Câu tiếp theo sẽ tự động hiện sau vài giây...</div>
    `;
  }

  function htmlFinished() {
    const players = room.finalPlayers || [];
    const rows = players.map((p, i) => `
      <div class="solo-leaderboard-row">
        <div class="solo-leaderboard-rank">${i === 0 ? '🏆' : (i + 1)}</div>
        <div class="avatar-fallback" style="width:32px;height:32px;font-size:14px">${esc((p.username||'?').charAt(0).toUpperCase())}</div>
        <div class="solo-player-name">${esc(p.username)}</div>
        <div class="solo-player-score">${p.score || 0}đ</div>
      </div>`).join('');
    return `
      <div class="solo-card">
        <div class="solo-card-title">🏆 Kết quả chung cuộc</div>
        ${rows}
      </div>
      <button class="btn btn-primary" style="width:100%" onclick="SOLO.playAgain()">Chơi ván mới</button>
    `;
  }

  return {
    openLobby, backToHome, setComposeSheet, goToServerAddress, createAndInvite, joinByCode, hostStartMatch,
    pressReady, onAnswerInput, onAnswerKeydown, pressBuzz, playAgain,
    acceptInvite, declineInvite, connectPresence, disconnectPresence
  };
})();
