// ============================================================
// OLYM63 — LOCAL SERVER (phục vụ web app + real-time cho Solo)
// Chạy trên máy của 1 người ("host") trong cùng mạng Wi-Fi.
// Những người còn lại chỉ cần mở trình duyệt vào địa chỉ LAN
// mà server này in ra khi khởi động — không cần cài gì thêm,
// không cần tài khoản Cloudflare trả phí.
//
// Kiến trúc giữ nguyên giao thức WebSocket như bản Cloudflare
// Durable Objects trước đó (Directory = presence/mời, SoloRoom =
// trạng thái 1 phòng + luật Giành chuông) — chỉ đổi "nơi chạy":
// từ Durable Objects (cần trả phí) sang 1 tiến trình Node.js
// chạy ngay trên máy host (miễn phí, chỉ cần máy đó đang bật và
// mọi người chung Wi-Fi).
// ============================================================

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer } = require('ws');

const ROOT = path.join(__dirname, '..'); // thư mục gốc project (chứa index.html) — khi đóng gói bằng pkg, các file này được nhúng sẵn bên trong nên không cần nằm cùng thư mục thật ngoài đĩa
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

const KD_ANSWER_SECONDS = 10;
const COUNTDOWN_SECONDS = 3;
const GRADE_TIMEOUT_MS = 7000;
const MAX_PLAYERS = 4;
const MIN_PLAYERS = 2;
const ROOM_IDLE_CLEANUP_MS = 15 * 60 * 1000; // dọn phòng trống sau 15 phút

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // bỏ ký tự dễ nhầm (0/O, 1/I)
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function normalizeStr(s) {
  if (!s) return '';
  return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
}
function fallbackCorrect(u, c) {
  const nu = normalizeStr(u), nc = normalizeStr(c);
  if (!nu || !nc) return false;
  if (nu === nc) return true;
  if (nu.length >= 3 && nc.length >= 3 && (nu.includes(nc) || nc.includes(nu))) return true;
  const words = nc.split(' ').filter(w => w.length > 2);
  return words.length > 0 && (words.filter(w => nu.includes(w)).length / words.length) >= 0.7;
}
function getVeDichTimes(points) {
  if (points === 10) return { read: 15, answer: 15 };
  if (points === 20) return { read: 15, answer: 30 };
  return { read: 30, answer: 30 };
}

// ============================================================
// SOLO ROOM — trạng thái 1 phòng + luật "Giành chuông"
// (Không còn hệ thống "mời qua username/presence" nữa — người chơi
// vào phòng bằng LINK (?join=CODE) hoặc nhập mã phòng, rồi tự đặt
// tên hiển thị lúc vào.)
// ============================================================
class SoloRoom {
  constructor(code, onEmpty) {
    this.code = code;
    this.onEmpty = onEmpty;
    this.sockets = new Map();   // connId -> { ws, username }
    this.players = new Map();   // username -> { avatar, score, connected }
    this.hostUsername = null;
    this.phase = 'lobby';
    this.gameMode = null;
    this.sheet = null;
    this.questions = [];
    this.currentIndex = -1;
    this.readySet = new Set();
    this.buzzedBy = null;
    this.answers = new Map();
    this.timers = [];
    this.emptyTimer = null;
  }

  clearTimers() { this.timers.forEach(t => clearTimeout(t)); this.timers = []; }
  playersSnapshot() {
    return Array.from(this.players.entries()).map(([username, p]) => ({
      username, avatar: p.avatar || null, score: p.score || 0,
      connected: !!p.connected, isHost: username === this.hostUsername
    }));
  }
  broadcast(obj) {
    const data = JSON.stringify(obj);
    for (const info of this.sockets.values()) { try { info.ws.send(data); } catch (e) {} }
  }
  connectedCount() { return Array.from(this.players.values()).filter(p => p.connected).length; }

  handleConnection(ws, username, avatar, connId) {
    if (this.emptyTimer) { clearTimeout(this.emptyTimer); this.emptyTimer = null; }
    if (!this.players.has(username) && this.connectedCount() >= MAX_PLAYERS) {
      try { ws.close(4003, 'room full'); } catch (e) {}
      return;
    }
    this.sockets.set(connId, { ws, username });
    if (!this.hostUsername) this.hostUsername = username;
    const existing = this.players.get(username);
    if (existing) { existing.connected = true; if (avatar) existing.avatar = avatar; }
    else this.players.set(username, { avatar, score: 0, connected: true });

    ws.send(JSON.stringify({
      type: 'room_state', hostUsername: this.hostUsername, phase: this.phase,
      gameMode: this.gameMode, sheet: this.sheet, players: this.playersSnapshot(),
      currentIndex: this.currentIndex, total: this.questions.length,
      questions: this.phase !== 'lobby' ? this.questions : []
    }));
    this.broadcast({ type: 'player_joined', players: this.playersSnapshot() });

    ws.on('message', (data) => this.onMessage(connId, data));
    const onClose = () => this.onClose(connId);
    ws.on('close', onClose);
    ws.on('error', onClose);
  }

  onClose(connId) {
    const info = this.sockets.get(connId);
    this.sockets.delete(connId);
    if (info) {
      const p = this.players.get(info.username);
      if (p) p.connected = false;
      this.broadcast({ type: 'player_left', players: this.playersSnapshot() });
    }
    if (this.sockets.size === 0 && typeof this.onEmpty === 'function') {
      this.emptyTimer = setTimeout(() => this.onEmpty(this.code), ROOM_IDLE_CLEANUP_MS);
    }
  }

  onMessage(connId, data) {
    const info = this.sockets.get(connId);
    if (!info) return;
    let msg; try { msg = JSON.parse(data); } catch (e) { return; }
    const username = info.username;

    switch (msg.type) {
      case 'set_game': {
        if (username !== this.hostUsername || this.phase !== 'lobby') return;
        this.gameMode = 'gianh_chuong';
        this.sheet = msg.sheet === 've_dich' ? 've_dich' : 'khoi_dong';
        this.broadcast({ type: 'game_selected', gameMode: this.gameMode, sheet: this.sheet });
        break;
      }
      case 'set_questions': {
        if (username !== this.hostUsername) return;
        if (this.connectedCount() < MIN_PLAYERS) {
          this.broadcast({ type: 'error', message: 'Cần tối thiểu 2 người chơi đang kết nối để bắt đầu.' });
          return;
        }
        if (!Array.isArray(msg.questions) || msg.questions.length === 0) return;
        this.questions = msg.questions.slice(0, 20);
        this.currentIndex = -1;
        this.phase = 'ready_check';
        this.readySet.clear();
        this.broadcast({ type: 'questions_ready', sheet: this.sheet, total: this.questions.length, questions: this.questions });
        break;
      }
      case 'ready_buzz': {
        if (this.phase !== 'ready_check') return;
        this.readySet.add(username);
        this.broadcast({ type: 'ready_update', readyUsernames: Array.from(this.readySet), totalConnected: this.connectedCount() });
        if (this.readySet.size >= this.connectedCount() && this.connectedCount() >= MIN_PLAYERS) this.startCountdown();
        break;
      }
      case 'save_answer': {
        if (this.phase !== 'question_answering') return;
        this.answers.set(username, String(msg.text || '').slice(0, 500));
        break;
      }
      case 'buzz': {
        if (this.phase !== 'question_answering') return;
        if (this.buzzedBy) return;
        this.buzzedBy = username;
        this.broadcast({ type: 'buzzed', username, index: this.currentIndex });
        break;
      }
      case 'grade_result': {
        if (this.phase !== 'grading') return;
        if (username !== this.buzzedBy) return;
        this.finishQuestion({ correct: !!msg.correct, userAnswer: String(msg.userAnswer || ''), gradedBy: 'client' });
        break;
      }
      case 'leave_room': { this.onClose(connId); break; }
    }
  }

  startCountdown() {
    this.phase = 'countdown';
    this.broadcast({ type: 'countdown_start', seconds: COUNTDOWN_SECONDS });
    this.timers.push(setTimeout(() => this.nextQuestion(), COUNTDOWN_SECONDS * 1000));
  }

  nextQuestion() {
    this.clearTimers();
    this.currentIndex++;
    this.buzzedBy = null;
    this.answers.clear();
    if (this.currentIndex >= this.questions.length) { this.endGame(); return; }
    const q = this.questions[this.currentIndex];

    if (this.sheet === 've_dich') {
      const times = getVeDichTimes(q.points || 10);
      this.phase = 'question_reading';
      this.broadcast({ type: 'question_start', index: this.currentIndex, total: this.questions.length, text: q.question, points: q.points || 10, subphase: 'reading', duration: times.read });
      this.timers.push(setTimeout(() => this.startAnswering(times.answer, q.points || 10), times.read * 1000));
    } else {
      this.phase = 'question_answering';
      this.broadcast({ type: 'question_start', index: this.currentIndex, total: this.questions.length, text: q.question, points: 10, subphase: 'answering', duration: KD_ANSWER_SECONDS });
      this.timers.push(setTimeout(() => this.onAnswerTimeUp(), KD_ANSWER_SECONDS * 1000));
    }
  }

  startAnswering(answerSeconds, points) {
    this.phase = 'question_answering';
    this.broadcast({ type: 'answer_phase_start', index: this.currentIndex, duration: answerSeconds, points });
    this.timers.push(setTimeout(() => this.onAnswerTimeUp(), answerSeconds * 1000));
  }

  onAnswerTimeUp() {
    if (!this.buzzedBy) { this.finishQuestion({ correct: false, userAnswer: '', gradedBy: 'none' }); return; }
    this.phase = 'grading';
    this.broadcast({ type: 'grading_started', index: this.currentIndex, username: this.buzzedBy });
    this.timers.push(setTimeout(() => {
      if (this.phase !== 'grading') return;
      const q = this.questions[this.currentIndex];
      const ans = this.answers.get(this.buzzedBy) || '';
      const correct = fallbackCorrect(ans, q.answer);
      this.finishQuestion({ correct, userAnswer: ans, gradedBy: 'fallback' });
    }, GRADE_TIMEOUT_MS));
  }

  finishQuestion({ correct, userAnswer, gradedBy }) {
    this.clearTimers();
    const q = this.questions[this.currentIndex];
    const points = this.sheet === 've_dich' ? (q.points || 10) : 10;
    const buzzer = this.buzzedBy;
    if (buzzer && correct) {
      const p = this.players.get(buzzer);
      if (p) p.score = (p.score || 0) + points;
    }
    this.phase = 'result';
    this.broadcast({
      type: 'question_result', index: this.currentIndex, username: buzzer, userAnswer,
      correct, correctAnswer: q.answer, points: (buzzer && correct) ? points : 0, gradedBy,
      players: this.playersSnapshot()
    });
    this.timers.push(setTimeout(() => this.nextQuestion(), 3200));
  }

  endGame() {
    this.phase = 'finished';
    const ranked = this.playersSnapshot().sort((a, b) => b.score - a.score);
    this.broadcast({ type: 'game_over', players: ranked });
  }
}

// ============================================================
// PHỤC VỤ FILE TĨNH (chính web app) + ROUTER
// ============================================================
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.webmanifest': 'application/manifest+json'
};

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(ROOT, urlPath);
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) { res.writeHead(404); res.end('Không tìm thấy'); return; }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });
}

const rooms = new Map(); // roomCode -> SoloRoom
function deleteRoom(code) { rooms.delete(code); }
function getOrCreateRoom(code) {
  code = code.toUpperCase();
  let r = rooms.get(code);
  if (!r) { r = new SoloRoom(code, deleteRoom); rooms.set(code, r); }
  return r;
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
    res.end();
    return;
  }
  if (req.url === '/rooms' && req.method === 'POST') {
    const roomCode = genCode();
    getOrCreateRoom(roomCode);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ roomCode }));
    return;
  }
  serveStatic(req, res);
});

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://internal');
  const m = url.pathname.match(/^\/rooms\/([A-Za-z0-9]{4,10})\/ws$/);
  if (m) {
    const username = (url.searchParams.get('username') || '').trim();
    const avatar = url.searchParams.get('avatar') || '';
    if (!username) { socket.destroy(); return; }
    const room = getOrCreateRoom(m[1]);
    wss.handleUpgrade(req, socket, head, (ws) => {
      const connId = Math.random().toString(36).slice(2);
      room.handleConnection(ws, username, avatar, connId);
    });
    return;
  }
  socket.destroy();
});

function getLanIps() {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) ips.push(net.address);
    }
  }
  return ips;
}

server.listen(PORT, () => {
  console.log('\n🎮 Olym63 (kèm module Solo) đang chạy!\n');
  console.log(`   Trên máy này:     http://localhost:${PORT}`);
  const ips = getLanIps();
  if (ips.length) {
    ips.forEach(ip => console.log(`   Cùng Wi-Fi:       http://${ip}:${PORT}`));
    console.log('\n   👉 Gửi địa chỉ "Cùng Wi-Fi" ở trên cho bạn bè để họ mở bằng trình duyệt.');
  } else {
    console.log('\n   ⚠️  Không tìm thấy địa chỉ mạng LAN — kiểm tra máy đã kết nối Wi-Fi/LAN chưa.');
  }
  console.log('   (Nhấn Ctrl+C để tắt server)\n');
});
