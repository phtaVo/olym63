// ============================================================
// MODULE SOLO — thi đấu nhóm 2-4 người, real-time
// Hiện có: Giành chuông (bộ câu hỏi Khởi động chung / Về đích)
// Tăng tốc trong Solo sẽ được bổ sung sau.
//
// Cách mời: chủ phòng tạo phòng rồi gửi LINK phòng cho bạn bè
// (không cần biết username của nhau). Ai bấm vào link chỉ cần tự
// đặt tên hiển thị là vào chơi được ngay — không cần tài khoản.
//
// Dùng chung với app.js: verifyAnswer(), loadKhoiDong(), loadVeDich(),
// AUDIO, CONFIG, showToast(), showScreen(), goHome(), escapeHTML().
// ============================================================
const SOLO = (function () {
  let roomWS = null;
  let myUsername = null;
  let myAvatar = null;
  let isHost = false;
  let composeSheet = 'khoi_dong';
  let homeTab = 'host';
  let displayName = '';
  let joinGateCode = null; // khác null khi vào từ link mời (?join=CODE), chờ nhập tên
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
  // Phân biệt "đang mở qua server thật" (localhost / IP Wi-Fi nội bộ, nơi
  // tạo phòng/vào phòng thực sự hoạt động) với "đang ở trang tĩnh" như
  // GitHub Pages (nơi các nút Tạo/Vào phòng sẽ luôn báo lỗi vì không có
  // server thật đứng sau) — để chỉ hiện đúng phần dùng được.
  function looksLikeRealServer() {
    const h = window.location.hostname;
    if (!h) return false;
    if (h === 'localhost' || h === '127.0.0.1') return true;
    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
    return false;
  }
  function esc(s) { return typeof escapeHTML === 'function' ? escapeHTML(s) : String(s == null ? '' : s); }
  function me() {
    const u = (typeof AUTH !== 'undefined' && AUTH.getCurrentUser) ? (AUTH.getCurrentUser() || {}) : {};
    return { username: u.username || '' };
  }
  function loadSavedName() { try { return localStorage.getItem('olym63_solo_name') || ''; } catch (e) { return ''; } }
  function saveName(n) { try { localStorage.setItem('olym63_solo_name', n); } catch (e) {} }
  function playBuzzerSfx() {
    const el = document.getElementById('audio-buzzer');
    if (el && el.src) { el.currentTime = 0; el.play().catch(() => {}); }
  }

  // ============================================================
  // VÀO TỪ LINK MỜI (?join=CODE) — không cần đăng nhập
  // ============================================================
  function openJoinFromLink(code) {
    joinGateCode = String(code || '').toUpperCase();
    AUDIO.init(CONFIG.AUDIO_URLS);
    const bz = document.getElementById('audio-buzzer');
    if (bz && CONFIG.AUDIO_URLS.buzzer) bz.src = CONFIG.AUDIO_URLS.buzzer;
    if (!displayName) displayName = loadSavedName();
    showScreen('solo-screen');
    renderSolo();
  }

  function submitJoinGate() {
    const nameEl = document.getElementById('solo-gate-name');
    const name = (nameEl && nameEl.value || '').trim().slice(0, 24);
    if (!name) { showToast('Nhập tên của bạn.'); return; }
    displayName = name; saveName(name);
    myUsername = name; myAvatar = '';
    const code = joinGateCode; joinGateCode = null;
    isHost = false;
    connectRoom(code);
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
    if (!displayName) {
      displayName = loadSavedName() || me().username || '';
    }
    AUDIO.init(CONFIG.AUDIO_URLS);
    const bz = document.getElementById('audio-buzzer');
    if (bz && CONFIG.AUDIO_URLS.buzzer) bz.src = CONFIG.AUDIO_URLS.buzzer;
    showScreen('solo-screen');
    renderSolo();
  }

  function backToHome() {
    if (room.code) {
      if (!confirm('Rời khỏi phòng thi đấu hiện tại?')) return;
      sendRoom({ type: 'leave_room' });
      closeRoom(true);
    }
    joinGateCode = null;
    goHome();
  }

  function setComposeSheet(sheet) { composeSheet = sheet; renderSolo(); }
  function setHomeTab(tab) { homeTab = tab; renderSolo(); }

  async function createRoom() {
    if (!backendReady()) { showToast('Không xác định được máy chủ.'); return; }
    const nameEl = document.getElementById('solo-host-name');
    const name = (nameEl && nameEl.value || '').trim().slice(0, 24);
    if (!name) { showToast('Nhập tên hiển thị của bạn.'); return; }
    displayName = name; saveName(name);
    myUsername = name; myAvatar = '';
    try {
      const res = await fetch(httpBase() + '/rooms', { method: 'POST' });
      const data = await res.json();
      if (!data.roomCode) throw new Error('no code');
      isHost = true;
      connectRoom(data.roomCode, () => {
        sendRoom({ type: 'set_game', sheet: composeSheet });
      });
    } catch (e) {
      showToast('❌ Không tạo được phòng. Đảm bảo bạn đang mở đúng địa chỉ máy chủ nhóm (không phải trang GitHub).');
    }
  }

  function joinByCode() {
    if (!backendReady()) { showToast('Không xác định được máy chủ.'); return; }
    const nameEl = document.getElementById('solo-join-name');
    const codeEl = document.getElementById('solo-join-code');
    const name = (nameEl && nameEl.value || '').trim().slice(0, 24);
    const code = (codeEl && codeEl.value || '').trim().toUpperCase();
    if (!name) { showToast('Nhập tên của bạn.'); return; }
    if (!code) { showToast('Nhập mã phòng.'); return; }
    displayName = name; saveName(name);
    myUsername = name; myAvatar = '';
    isHost = false;
    connectRoom(code);
  }

  function copyShareLink() {
    const el = document.getElementById('solo-share-link');
    if (!el) return;
    el.select();
    el.setSelectionRange(0, 99999);
    const done = () => showToast('📋 Đã copy link phòng!');
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(el.value).then(done).catch(() => { document.execCommand('copy'); done(); });
      } else {
        document.execCommand('copy'); done();
      }
    } catch (e) { showToast('Không copy được — hãy tự bôi đen và copy.'); }
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

    if (joinGateCode) { el.innerHTML = htmlJoinGate(); return; }
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
      idle: 'Tạo phòng mới hoặc vào phòng có sẵn',
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

  function htmlJoinGate() {
    return `
      <div class="solo-join-gate">
        <div class="solo-join-gate-emoji">🎮</div>
        <div class="solo-join-gate-title">Bạn được mời vào phòng ${esc(joinGateCode)}</div>
        <div class="solo-hint" style="text-align:center;margin-bottom:18px">Nhập tên để vào chơi cùng mọi người</div>
        <div class="solo-field">
          <input type="text" class="solo-input" id="solo-gate-name" placeholder="Tên của bạn" maxlength="24" value="${esc(displayName)}"
            onkeydown="if(event.key==='Enter') SOLO.submitJoinGate()">
        </div>
        <button class="btn btn-primary" style="width:100%" onclick="SOLO.submitJoinGate()">Vào phòng</button>
      </div>
    `;
  }

  function htmlNotConfigured() {
    return `<div class="solo-card">
      <div class="solo-card-title">⚠️ Không tìm thấy máy chủ Solo</div>
      <div class="solo-hint">Trang này có vẻ đang được mở trực tiếp từ file (không qua server), nên Solo không tự nhận diện được máy chủ. Hãy tải và chạy máy chủ nhóm (xem <code>local-server/README.md</code>) rồi mở trang qua địa chỉ <code>http://...</code> mà nó in ra.</div>
    </div>`;
  }

  function htmlHome() {
    const isRealServer = looksLikeRealServer();
    const serverInfo = isRealServer
      ? `<div class="solo-hint" style="text-align:center;margin-bottom:16px">Đang dùng máy chủ: <code>${esc(wsBase())}</code></div>`
      : '';

    // Đang ở trang tĩnh (GitHub Pages...) — Tạo/Vào phòng sẽ không hoạt động
    // được ở đây (trình duyệt chặn https gọi tới máy chủ Wi-Fi nội bộ),
    // nên chỉ hiện phần tải máy chủ để tránh gây hiểu lầm.
    if (!isRealServer) {
      return `
        <div class="solo-card">
          <div class="solo-card-title">🖥️ Cần chạy máy chủ nhóm trước</div>
          <div class="solo-hint" style="margin-bottom:10px">Trang này đang chạy từ web tĩnh (không tự tạo/vào phòng được ở đây). Một bạn trong nhóm ("host") tải file chạy sẵn bên dưới — không cần cài Node.js, tải về là chạy được ngay:</div>
          <div class="solo-choice-row">
            <a class="btn btn-outline" style="text-decoration:none;text-align:center" href="local-server-builds/olym63-solo-server-windows.exe" download>⬇️ Windows</a>
            <a class="btn btn-outline" style="text-decoration:none;text-align:center" href="local-server-builds/olym63-solo-server-macos" download>⬇️ macOS</a>
            <a class="btn btn-outline" style="text-decoration:none;text-align:center" href="local-server-builds/olym63-solo-server-linux" download>⬇️ Linux</a>
          </div>
          <div class="solo-hint" style="margin-top:10px">macOS/Linux cần cấp quyền chạy lần đầu: mở Terminal, gõ <code>chmod +x tên-file</code> rồi <code>./tên-file</code>.</div>
          <div class="solo-hint">Chạy xong, cửa sổ hiện ra sẽ in địa chỉ dạng <code>http://localhost:3000</code> — <b>host mở đúng địa chỉ đó</b> (thay cho trang này) để tạo phòng và lấy link mời bạn bè. Bạn bè được mời chỉ cần bấm vào link, không cần làm bước nào ở đây cả.</div>
        </div>
        <div class="solo-card">
          <div class="solo-card-title">⚡ Tăng tốc</div>
          <div class="solo-hint">Sắp ra mắt trong Solo.</div>
        </div>
      `;
    }

    const tabs = `
      <div class="solo-tabs">
        <button class="solo-tab-btn ${homeTab === 'host' ? 'active' : ''}" onclick="SOLO.setHomeTab('host')">🚀 Tạo phòng mới</button>
        <button class="solo-tab-btn ${homeTab === 'join' ? 'active' : ''}" onclick="SOLO.setHomeTab('join')">🔗 Vào phòng có sẵn</button>
      </div>`;

    let content;
    if (homeTab === 'join') {
      content = `
        <div class="solo-card">
          <div class="solo-card-title">Tên hiển thị của bạn</div>
          <div class="solo-field">
            <input type="text" class="solo-input" id="solo-join-name" placeholder="vd: Lan" maxlength="24" value="${esc(displayName)}">
          </div>
        </div>
        <div class="solo-card">
          <div class="solo-card-title">Mã phòng</div>
          <div class="solo-field">
            <input type="text" class="solo-input" id="solo-join-code" placeholder="vd: A1B2C3" style="text-transform:uppercase">
          </div>
          <button class="btn btn-primary" style="width:100%" onclick="SOLO.joinByCode()">Vào phòng</button>
          <div class="solo-hint" style="margin-top:8px">Cách nhanh hơn: bấm thẳng vào link phòng mà bạn mình gửi — không cần nhập mã, cũng không cần bước dưới đây.</div>
        </div>
      `;
    } else {
      content = `
        <div class="solo-card">
          <div class="solo-card-title">Tên hiển thị của bạn</div>
          <div class="solo-field">
            <input type="text" class="solo-input" id="solo-host-name" placeholder="vd: Minh" maxlength="24" value="${esc(displayName)}">
          </div>
        </div>
        <div class="solo-card">
          <div class="solo-card-title">Bộ câu hỏi cho Giành chuông</div>
          <div class="solo-choice-row">
            <div class="solo-choice ${composeSheet === 'khoi_dong' ? 'active' : ''}" onclick="SOLO.setComposeSheet('khoi_dong')">Khởi động chung</div>
            <div class="solo-choice ${composeSheet === 've_dich' ? 'active' : ''}" onclick="SOLO.setComposeSheet('ve_dich')">Về đích</div>
          </div>
          <button class="btn btn-primary" style="width:100%;margin-top:14px" onclick="SOLO.createRoom()">🚀 Tạo phòng thi đấu</button>
        </div>
      `;
    }

    return `
      ${serverInfo}
      ${tabs}
      ${content}
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
    const shareLink = httpBase() + '/?join=' + room.code;
    return `
      <div class="solo-card">
        <div class="solo-room-code">${esc(room.code)}</div>
        ${isHost ? `
        <div class="solo-hint" style="text-align:center;margin:10px 0 8px">Gửi link này cho bạn bè (đang chung Wi-Fi) — bấm vào là vào thẳng phòng, không cần nhập mã:</div>
        <div class="solo-field" style="display:flex;gap:8px">
          <input type="text" class="solo-input" id="solo-share-link" value="${esc(shareLink)}" readonly onclick="this.select()">
          <button class="btn btn-outline" style="white-space:nowrap" onclick="SOLO.copyShareLink()">Copy</button>
        </div>` : `<div class="solo-hint" style="text-align:center;margin-top:6px">Đang ở trong phòng...</div>`}
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
    openLobby, openJoinFromLink, submitJoinGate, backToHome, setComposeSheet, setHomeTab,
    createRoom, joinByCode, copyShareLink, hostStartMatch,
    pressReady, onAnswerInput, onAnswerKeydown, pressBuzz, playAgain
  };
})();
