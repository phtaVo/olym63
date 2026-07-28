// ============================================================
// OLYMPIA WEB — bản JS/HTML thuần (không cần Google Apps Script)
// Toàn bộ logic server cũ (Code.gs) đã được chuyển vào file này,
// chạy trực tiếp trên trình duyệt.
// ============================================================

// ============================================================
// AUDIO MANAGER
// ============================================================
const AUDIO = {
  introKD: null, introVD: null, bgKD: null, correct: null,
  fail: null, cauhoiVD: null, cauhoi15sVD: null, starHopeEl: null,

  init(urls) {
    this.introKD     = document.getElementById('audio-intro-kd');
    this.introVD     = document.getElementById('audio-intro-vd');
    this.bgKD        = document.getElementById('audio-60s-kd');
    this.correct     = document.getElementById('audio-correct');
    this.fail        = document.getElementById('audio-fail');
    this.cauhoiVD    = document.getElementById('audio-cauhoi-vd');
    this.cauhoi15sVD = document.getElementById('audio-cauhoi-15s-vd');
    this.starHopeEl  = document.getElementById('audio-star-hope');
    if (!urls) return;
    if (urls.introKD     && this.introKD)     this.introKD.src     = urls.introKD;
    if (urls.introVD     && this.introVD)     this.introVD.src     = urls.introVD;
    if (urls.bgKD        && this.bgKD)        this.bgKD.src        = urls.bgKD;
    if (urls.correct     && this.correct)     this.correct.src     = urls.correct;
    if (urls.fail        && this.fail)        this.fail.src        = urls.fail;
    if (urls.cauhoiVD    && this.cauhoiVD)    this.cauhoiVD.src    = urls.cauhoiVD;
    if (urls.cauhoi15sVD && this.cauhoi15sVD) this.cauhoi15sVD.src = urls.cauhoi15sVD;
    if (urls.starHope    && this.starHopeEl)  this.starHopeEl.src  = urls.starHope;
  },

  play(el) {
    if (!el || !el.src || el.src === window.location.href) return;
    el.currentTime = 0;
    el.play().catch(e => console.log('Audio:', e));
  },

  stopAll() {
    [this.introKD, this.introVD, this.bgKD, this.correct, this.fail,
     this.cauhoiVD, this.cauhoi15sVD, this.starHopeEl]
      .forEach(a => { if (a) { a.pause(); a.currentTime = 0; } });
  },

  playSFX(ok)     { this.play(ok ? this.correct : this.fail); },
  playCauHoiVD()  { this.stopAll(); this.play(this.cauhoiVD); },
  playCauHoi15s() { this.stopAll(); this.play(this.cauhoi15sVD); },
  playBgKD()      { this.play(this.bgKD); },
  playStarHope()  { this.play(this.starHopeEl); },
  stopStarHope()  { if (this.starHopeEl) { this.starHopeEl.pause(); this.starHopeEl.currentTime = 0; } }
};

// Unlock autoplay
let _audioUnlocked = false;
document.addEventListener('click', function u() {
  if (_audioUnlocked) return; _audioUnlocked = true;
  new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=').play().catch(()=>{});
  document.removeEventListener('click', u);
}, { capture: true });

// ============================================================
// THEME
// ============================================================
const THEMES = ['navy','red','green','blue','gold','purple'];
const THEME_LABELS = { navy:'🔷 Olympia', red:'🔴 Đỏ', green:'🟢 Xanh lá', blue:'🔵 Xanh dương', gold:'🟡 Vàng', purple:'🟣 Tím' };
let currentThemeIdx = 0;
function cycleTheme() {
  currentThemeIdx = (currentThemeIdx + 1) % THEMES.length;
  const t = THEMES[currentThemeIdx];
  document.body.setAttribute('data-theme', t);
  showToast('🎨 ' + THEME_LABELS[t]);
}

// ============================================================
// INTRO ON/OFF SETTING
// ============================================================
let introEnabled = true;
try {
  const saved = localStorage.getItem('olympia_intro_enabled');
  if (saved !== null) introEnabled = saved === '1';
} catch (e) {}

function toggleIntroSetting() {
  introEnabled = !introEnabled;
  try { localStorage.setItem('olympia_intro_enabled', introEnabled ? '1' : '0'); } catch (e) {}
  updateIntroToggleUI();
  showToast(introEnabled ? '🎬 Đã bật màn giới thiệu' : '⏩ Đã tắt màn giới thiệu – vào thẳng câu hỏi');
}

function updateIntroToggleUI() {
  const btn = document.getElementById('intro-toggle-switch');
  if (btn) btn.classList.toggle('on', introEnabled);
}

// ============================================================
// STATE
// ============================================================
const STATE = {
  mode: null, questions: [], currentIndex: 0, score: 0,
  timerInterval: null, phaseTimer: null, answers: [], timeLeft: 70,
  starHope: false, starHopeUsed: false,
  vedich: { phase: 'reading', phaseTimeLeft: 0, readTime: 0, answerTime: 0, savedAnswer: null }
};

// ============================================================
// SCREENS
// ============================================================
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}
function goHome() {
  clearAllTimers(); AUDIO.stopAll();
  if (_introProgressTimer) { clearInterval(_introProgressTimer); _introProgressTimer = null; }
  showScreen('home-screen');
}
function showComingSoon(name) { document.getElementById('modal-section-name').textContent = name; document.getElementById('coming-soon-modal').classList.add('show'); }
function closeModal() { document.getElementById('coming-soon-modal').classList.remove('show'); }

// ============================================================
// TOAST
// ============================================================
let toastTimeout;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => t.classList.remove('show'), 2500);
}

// ============================================================
// INTRO SCREEN
// ============================================================
let _introProgressTimer = null;
const INTRO_CONFIG = {
  khoi_dong: { title: 'Khởi Động', subtitle: 'Phần Thi Khởi Động' },
  ve_dich:   { title: 'Về Đích',   subtitle: 'Phần Thi Về Đích'   }
};

function showIntroScreen(mode, audioEl, onDone) {
  const cfg = INTRO_CONFIG[mode] || { title: mode, subtitle: '' };
  document.getElementById('intro-title').textContent    = cfg.title;
  document.getElementById('intro-subtitle').textContent = cfg.subtitle;

  const fill = document.getElementById('intro-progress-fill');
  fill.style.transition = 'none'; fill.style.width = '0%';
  showScreen('intro-screen');

  if (!audioEl || !audioEl.src || audioEl.src === window.location.href) {
    setTimeout(onDone, 2500); return;
  }

  audioEl.currentTime = 0; audioEl.onended = null;
  audioEl.play().catch(() => { setTimeout(onDone, 2500); });

  audioEl.onended = () => {
    audioEl.onended = null;
    if (_introProgressTimer) { clearInterval(_introProgressTimer); _introProgressTimer = null; }
    fill.style.transition = 'width 0.3s ease'; fill.style.width = '100%';
    setTimeout(onDone, 300);
  };

  if (_introProgressTimer) clearInterval(_introProgressTimer);
  _introProgressTimer = setInterval(() => {
    if (!audioEl.duration || audioEl.paused) return;
    fill.style.transition = 'none';
    fill.style.width = Math.min((audioEl.currentTime / audioEl.duration) * 100, 100) + '%';
  }, 100);
}

// ============================================================
// TẢI CÂU HỎI TỪ GOOGLE SHEET (thay cho SpreadsheetApp phía server)
// Yêu cầu: Sheet phải để chế độ chia sẻ "Anyone with the link -> Viewer"
// ============================================================
function sheetCsvUrl(sheetName) {
  return `https://docs.google.com/spreadsheets/d/${CONFIG.SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
}

function fetchSheetRows(sheetName) {
  return new Promise((resolve, reject) => {
    const url = sheetCsvUrl(sheetName);
    fetch(url)
      .then(r => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      })
      .then(csvText => {
        const parsed = Papa.parse(csvText.trim(), { skipEmptyLines: true });
        resolve(parsed.data);
      })
      .catch(reject);
  });
}

function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function loadKhoiDong() {
  try {
    const rows = await fetchSheetRows(CONFIG.SHEET_NAMES.khoi_dong);
    // rows[0] là hàng tiêu đề -> bỏ qua
    const data = rows.slice(1);
    const questions = data
      .filter(r => r[0] && r[1])
      .map(r => ({ question: String(r[0]).trim(), answer: String(r[1]).trim() }));
    return { success: true, questions: shuffleArray(questions).slice(0, 12) };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

async function loadVeDich() {
  try {
    const rows = await fetchSheetRows(CONFIG.SHEET_NAMES.ve_dich);
    const data = rows.slice(1);
    const all = data
      .filter(r => r[0] && r[1])
      .map(r => ({ question: String(r[0]).trim(), answer: String(r[1]).trim(), points: parseInt(r[2]) || 10 }));
    const p10 = shuffleArray(all.filter(q => q.points === 10));
    const p20 = shuffleArray(all.filter(q => q.points === 20));
    const p30 = shuffleArray(all.filter(q => q.points === 30));
    if (p10.length < 2) return { success: false, error: 'Không đủ câu hỏi 10 điểm (cần ít nhất 2)' };
    if (p20.length < 2) return { success: false, error: 'Không đủ câu hỏi 20 điểm (cần ít nhất 2)' };
    if (p30.length < 2) return { success: false, error: 'Không đủ câu hỏi 30 điểm (cần ít nhất 2)' };
    return { success: true, questions: [...p10.slice(0,2), ...p20.slice(0,2), ...p30.slice(0,2)] };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// ============================================================
// CHẤM ĐIỂM (thay cho verifyAnswer / checkWithGeminiAdvanced phía server)
// ============================================================
function exactMatch(u, c) { return u.trim().toLowerCase() === c.trim().toLowerCase(); }

function normalizeStr(s) {
  if (!s) return '';
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\w\s]/g,'').replace(/\s+/g,' ').trim();
}

function simpleCompare(u, c) {
  const nu = normalizeStr(u), nc = normalizeStr(c);
  if (nu === nc) return true;
  if (nu.includes(nc) || nc.includes(nu)) return true;
  const words = nc.split(' ').filter(w => w.length > 2);
  return words.length > 0 && words.filter(w => nu.includes(w)).length / words.length >= 0.7;
}

async function callGemini(prompt, maxTokens, temperature) {
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: temperature ?? 0, maxOutputTokens: maxTokens ?? 150 }
  };
  const response = await fetch(CONFIG.GEMINI_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error.message || 'Gemini error');
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function checkWithGeminiAdvanced(questionText, userAnswer, correctAnswer) {
  try {
    const prompt = 'Bạn là giám khảo Olympia. Chấm câu trả lời theo 3 mức: "Đúng", "Chưa hoàn toàn chính xác", "Sai".\n\nCHỈ TRẢ VỀ ĐÚNG ĐỊNH DẠNG SAU:\n\nKết luận: [Đúng/Chưa hoàn toàn chính xác/Sai]\nGiải thích: [một câu ngắn gọn]\n\nCâu hỏi: ' + questionText + '\nĐáp án đúng: ' + correctAnswer + '\nCâu trả lời của thí sinh: ' + userAnswer;
    const text = await callGemini(prompt, 150, 0);
    let verdict = 'Sai', explanation = 'Không xác định';
    const vm = text.match(/Kết luận:\s*(Đúng|Chưa hoàn toàn chính xác|Sai)/);
    if (vm) verdict = vm[1];
    const em = text.match(/Giải thích:\s*(.+?)(?=\n|$)/);
    if (em) explanation = em[1].trim();
    return { correct: verdict === 'Đúng', verdict, explanation, method: 'gemini' };
  } catch (e) {
    return fallbackGrading(questionText, userAnswer, correctAnswer);
  }
}

function fallbackGrading(questionText, userAnswer, correctAnswer) {
  if (simpleCompare(userAnswer, correctAnswer)) return { correct: true, verdict: 'Đúng', explanation: 'Câu trả lời đúng (hệ thống)', method: 'fallback' };
  const kw = correctAnswer.toLowerCase().split(/[\s,;]+/).filter(w => w.length > 2);
  const r = kw.length > 0 ? kw.filter(k => userAnswer.toLowerCase().includes(k)).length / kw.length : 0;
  if (r >= 0.7) return { correct: true,  verdict: 'Đúng', explanation: 'Đúng ' + Math.round(r*100) + '% từ khóa.', method: 'fallback' };
  if (r >= 0.4) return { correct: false, verdict: 'Chưa hoàn toàn chính xác', explanation: 'Chỉ đúng ' + Math.round(r*100) + '% nội dung.', method: 'fallback' };
  return { correct: false, verdict: 'Sai', explanation: 'Câu trả lời không đúng với đáp án.', method: 'fallback' };
}

async function verifyAnswer({ question, userAnswer, correctAnswer }) {
  if (!userAnswer || userAnswer.trim() === '') return { correct: false, verdict: 'Sai', explanation: 'Thí sinh không đưa ra câu trả lời.', method: 'empty' };
  if (exactMatch(userAnswer, correctAnswer)) return { correct: true, verdict: 'Đúng', explanation: 'Câu trả lời chính xác tuyệt đối.', method: 'exact' };
  if (simpleCompare(userAnswer, correctAnswer)) return { correct: true, verdict: 'Đúng', explanation: 'Câu trả lời đúng về mặt nội dung.', method: 'simple' };
  try { return await checkWithGeminiAdvanced(question, userAnswer, correctAnswer); }
  catch (e) { return { correct: false, verdict: 'Sai', explanation: 'Lỗi hệ thống chấm điểm.', method: 'fallback' }; }
}

async function regradeAnswers(answers, questions) {
  const out = [];
  for (let i = 0; i < answers.length; i++) {
    const a = answers[i];
    if (!a.userAnswer || a.userAnswer.trim() === '') { out.push(Object.assign({}, a, { verdict: 'Sai', explanation: 'Không có câu trả lời', correct: false })); continue; }
    if (exactMatch(a.userAnswer, a.correctAnswer)) { out.push(Object.assign({}, a, { verdict: 'Đúng', explanation: 'Câu trả lời chính xác tuyệt đối.', correct: true })); continue; }
    if (simpleCompare(a.userAnswer, a.correctAnswer)) { out.push(Object.assign({}, a, { verdict: 'Đúng', explanation: 'Câu trả lời đúng về mặt nội dung.', correct: true })); continue; }
    try {
      const r = await checkWithGeminiAdvanced(questions[i].question, a.userAnswer, a.correctAnswer);
      out.push(Object.assign({}, a, { verdict: r.verdict, explanation: r.explanation, correct: r.correct }));
    } catch (e) {
      const r = fallbackGrading(questions[i].question, a.userAnswer, a.correctAnswer);
      out.push(Object.assign({}, a, { verdict: r.verdict, explanation: r.explanation, correct: r.correct }));
    }
  }
  return out;
}

async function geminiRegradeOnly(question, userAnswer) {
  try {
    if (!userAnswer || userAnswer.trim() === '') {
      return { success: true, data: { correct: false, verdict: 'Sai', explanation: 'Không có câu trả lời để đánh giá.' } };
    }
    const prompt = `Bạn là giám khảo của chương trình "Đường Lên Đỉnh Olympia".
Hãy đánh giá câu trả lời sau dựa trên câu hỏi. Không cần biết đáp án chính thức, hãy dùng kiến thức của bạn để kết luận.

Câu hỏi: ${question}
Câu trả lời của thí sinh: ${userAnswer}

CHỈ TRẢ VỀ JSON thuần, không markdown, không giải thích thêm:
{
  "correct": true/false,
  "verdict": "Đúng / Sai / Chưa hoàn toàn chính xác",
  "explanation": "lý do ngắn gọn, tối đa 2 câu"
}`;
    let text = await callGemini(prompt, 200, 0);
    text = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    let result;
    try { result = JSON.parse(text); }
    catch (e) {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) result = JSON.parse(match[0]);
      else throw new Error('Không parse được JSON từ Gemini: ' + text);
    }
    if (typeof result.correct !== 'boolean') result.correct = (result.verdict === 'Đúng');
    return { success: true, data: result };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// ============================================================
// START GAME
// ============================================================
function startGame(mode) {
  STATE.mode = mode; STATE.score = 0; STATE.answers = [];
  STATE.starHope = false; STATE.starHopeUsed = false; STATE.currentIndex = 0;
  AUDIO.stopAll(); showScreen('loading-overlay');

  AUDIO.init(CONFIG.AUDIO_URLS);

  const loader = mode === 'khoi_dong' ? loadKhoiDong() : loadVeDich();
  loader.then(onQuestionsLoaded).catch(err => onLoadError(err));
}

function onQuestionsLoaded(result) {
  if (!result || !result.success || !result.questions || result.questions.length === 0) {
    showToast(result && result.error ? result.error : 'Không tải được câu hỏi. Kiểm tra lại Google Sheets!');
    showScreen('home-screen'); return;
  }
  STATE.questions = result.questions; STATE.currentIndex = 0; STATE.score = 0; STATE.answers = [];
  setupGameUI();

  if (!introEnabled) {
    showScreen('game-screen');
    if (STATE.mode === 'khoi_dong') startKhoiDong();
    else startVeDich();
    return;
  }

  const introAudio = STATE.mode === 'khoi_dong' ? AUDIO.introKD : AUDIO.introVD;
  showIntroScreen(STATE.mode, introAudio, () => {
    showScreen('game-screen');
    if (STATE.mode === 'khoi_dong') startKhoiDong();
    else startVeDich();
  });
}

function onLoadError(err) { showToast('Lỗi kết nối: ' + err); showScreen('home-screen'); }

// ============================================================
// UI SETUP
// ============================================================
function setupGameUI() {
  const mode = STATE.mode;
  document.getElementById('mode-label').textContent = mode === 'khoi_dong' ? 'Khởi Động' : 'Về Đích';
  document.getElementById('score-display').textContent = '0';
  document.getElementById('score-display').className = 'score-number';
  document.getElementById('feedback-bar').className = 'feedback-bar hidden';
  document.getElementById('question-meta').innerHTML = '';

  const starBtn = document.getElementById('star-hope-btn');
  if (mode === 've_dich') {
    starBtn.style.display = 'block'; starBtn.classList.remove('active', 'used');
    starBtn.innerHTML = '<span class="star-hope-icon">⭐</span>Ngôi sao<br>hy vọng';
  } else { starBtn.style.display = 'none'; }

  const input = document.getElementById('answer-input');
  input.value = ''; input.disabled = false;
  const newInput = input.cloneNode(true);
  input.parentNode.replaceChild(newInput, input);
  newInput.addEventListener('keydown', onInputKeydown);
}

// ============================================================
// KHỞI ĐỘNG
// ============================================================
function startKhoiDong() {
  const total = Math.min(STATE.questions.length, 12);
  STATE.timeLeft = 70;
  updateTimerUI(70, 70); updateQCounter(1, total);
  showQuestion(STATE.questions[0]);
  AUDIO.playBgKD();

  STATE.timerInterval = setInterval(() => {
    STATE.timeLeft--;
    updateTimerUI(STATE.timeLeft, 70);
    if (STATE.timeLeft <= 0) endKhoiDong();
  }, 1000);

  document.getElementById('answer-input').disabled = false;
  document.getElementById('answer-input').focus();
}

function onInputKeydown(e) {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  if (STATE.mode === 'khoi_dong') handleKhoiDongAnswer();
  else if (STATE.mode === 've_dich') submitVeDichAnswerNow();
}

function submitVeDichAnswerNow() {
  if (STATE.vedich.phase !== 'answering') return;
  const input = document.getElementById('answer-input');
  if (input.disabled) return;

  // Ghi nhận đáp án hiện tại nhưng KHÔNG khoá nhập liệu và KHÔNG chấm điểm ngay.
  // Người dùng vẫn có thể tiếp tục sửa và bấm Enter lại để ghi nhận đáp án khác.
  // Chỉ khi hết thời gian trả lời (timer về 0) hệ thống mới khoá nhập và chấm điểm.
  const val = input.value.trim();
  STATE.vedich.savedAnswer = val;

  const savedEl = document.getElementById('saved-answer-indicator');
  if (savedEl) {
    savedEl.className = 'saved-answer-indicator';
    savedEl.textContent = val === ''
      ? '📝 Đã ghi nhận: (để trống) — vẫn có thể nhập lại'
      : `📝 Đã ghi nhận đáp án: "${val}" — vẫn có thể nhập lại`;
  }

  input.classList.remove('flash-saved');
  void input.offsetWidth;
  input.classList.add('flash-saved');
  setTimeout(() => input.classList.remove('flash-saved'), 300);
}

function handleKhoiDongAnswer() {
  const input = document.getElementById('answer-input');
  const userAnswer = input.value.trim();
  const q = STATE.questions[STATE.currentIndex];
  const total = Math.min(STATE.questions.length, 12);

  const entry = { question: q.question, userAnswer, correctAnswer: q.answer, correct: null, points: 10 };
  STATE.answers.push(entry);
  input.value = ''; STATE.currentIndex++;

  if (userAnswer === '') {
    AUDIO.playSFX(false); entry.correct = false;
    flashQuickFeedback(false, '');
  } else {
    const simpleCorrect = (userAnswer.trim().toLowerCase() === q.answer.trim().toLowerCase());
    AUDIO.playSFX(simpleCorrect);
    if (simpleCorrect) STATE.score += 10;
    flashQuickFeedback(simpleCorrect, userAnswer);

    gradeAnswerAsync(entry, (correct) => {
      entry.correct = correct;
      if (!simpleCorrect && correct) { STATE.score += 10; updateScoreUI(true); }
      else if (simpleCorrect && !correct) { STATE.score -= 10; updateScoreUI(false); }
    });
  }

  updateScoreUI(false);
  if (STATE.currentIndex >= total) { endKhoiDong(); return; }
  updateQCounter(STATE.currentIndex + 1, total);
  showQuestion(STATE.questions[STATE.currentIndex]);
}

function endKhoiDong() {
  clearAllTimers(); AUDIO.stopAll();
  document.getElementById('answer-input').disabled = true;
  showFeedback('info', '⏳ Đang chấm điểm...');
  setTimeout(() => showResults(), 1500);
}

// ============================================================
// VỀ ĐÍCH
// ============================================================
function startVeDich() { STATE.currentIndex = 0; showVeDichQuestion(); }

function getVeDichTimes(points) {
  if (points === 10) return { read: 15, answer: 15 };
  if (points === 20) return { read: 15, answer: 30 };
  return { read: 30, answer: 30 };
}

function showVeDichQuestion() {
  if (STATE.currentIndex >= STATE.questions.length) { endVeDich(); return; }
  const q = STATE.questions[STATE.currentIndex];
  const times = getVeDichTimes(q.points);
  STATE.vedich.phase = 'reading'; STATE.vedich.readTime = times.read;
  STATE.vedich.answerTime = times.answer; STATE.vedich.phaseTimeLeft = times.read;
  STATE.vedich.savedAnswer = null;

  const input = document.getElementById('answer-input');
  input.disabled = true; input.value = ''; input.placeholder = 'Chờ hết thời gian đọc...';
  document.getElementById('feedback-bar').className = 'feedback-bar hidden';
  const savedEl = document.getElementById('saved-answer-indicator');
  if (savedEl) { savedEl.className = 'saved-answer-indicator hidden'; savedEl.textContent = ''; }
  updateQCounter(STATE.currentIndex + 1, STATE.questions.length);

  if (STATE.starHopeUsed) { showQuestionContent(q, times); return; }
  showStarIntroBeforeQuestion(q, times);
}

function showStarIntroBeforeQuestion(q, times) {
  STATE.vedich.phase = 'star_intro'; STATE.starHope = false; updateStarBtn();
  const el = document.getElementById('question-text');
  el.classList.remove('entering', 'star-msg'); void el.offsetWidth;
  el.textContent = '⭐ Ngôi sao hy vọng sẽ giúp nhân đôi số điểm nếu trả lời đúng!';
  el.classList.add('entering', 'star-msg');

  const pc = q.points === 10 ? 'p10' : (q.points === 20 ? 'p20' : 'p30');
  document.getElementById('question-meta').innerHTML = `
    <span class="points-badge ${pc}">+${q.points} điểm</span>
    <span class="phase-badge star">⭐ Chuẩn bị – Bấm để dùng ngôi sao!</span>`;

  updateTimerUI(7, 7); AUDIO.stopAll();
  let countdown = 7; clearPhaseTimer();
  STATE.phaseTimer = setInterval(() => {
    countdown--; updateTimerUI(countdown, 7);
    if (countdown <= 0) { clearPhaseTimer(); showQuestionContent(q, times); }
  }, 1000);
}

function showQuestionContent(q, times) {
  STATE.vedich.phase = 'reading'; STATE.vedich.phaseTimeLeft = times.read;
  document.getElementById('question-text').classList.remove('star-msg');
  showQuestion(q);

  const pc = q.points === 10 ? 'p10' : (q.points === 20 ? 'p20' : 'p30');
  document.getElementById('question-meta').innerHTML = `
    <span class="points-badge ${pc}">+${q.points} điểm</span>
    <span class="phase-badge reading" id="phase-badge">Đọc câu hỏi</span>`;

  updateTimerUI(times.read, times.read); clearPhaseTimer();
  STATE.phaseTimer = setInterval(() => {
    STATE.vedich.phaseTimeLeft--; updateTimerUI(STATE.vedich.phaseTimeLeft, times.read);
    if (STATE.vedich.phaseTimeLeft <= 0) { clearPhaseTimer(); startVeDichAnswerPhase(); }
  }, 1000);
}

function startVeDichAnswerPhase() {
  const q = STATE.questions[STATE.currentIndex];
  const times = getVeDichTimes(q.points);
  STATE.vedich.phase = 'answering'; STATE.vedich.phaseTimeLeft = times.answer;
  STATE.vedich.savedAnswer = null;

  const badge = document.getElementById('phase-badge');
  if (badge) { badge.className = 'phase-badge answering'; badge.textContent = 'Trả lời'; }

  const input = document.getElementById('answer-input');
  input.disabled = false; input.placeholder = 'Nhập câu trả lời rồi bấm Enter để ghi nhận...'; input.focus();
  const savedEl = document.getElementById('saved-answer-indicator');
  if (savedEl) { savedEl.className = 'saved-answer-indicator hidden'; savedEl.textContent = ''; }
  updateTimerUI(times.answer, times.answer);

  if (q.points === 10) AUDIO.playCauHoi15s(); else AUDIO.playCauHoiVD();

  STATE.phaseTimer = setInterval(() => {
    STATE.vedich.phaseTimeLeft--; updateTimerUI(STATE.vedich.phaseTimeLeft, times.answer);
    if (STATE.vedich.phaseTimeLeft <= 0) { clearPhaseTimer(); gradeVeDichCurrent(); }
  }, 1000);
}

function gradeVeDichCurrent() {
  const q = STATE.questions[STATE.currentIndex];
  const input = document.getElementById('answer-input');
  // Ưu tiên đáp án đã được ghi nhận (bấm Enter) gần nhất; nếu người dùng chưa
  // bấm Enter lần nào thì lấy nội dung đang gõ dở trong ô nhập tại thời điểm hết giờ.
  const userAnswer = (STATE.vedich.savedAnswer !== null) ? STATE.vedich.savedAnswer : input.value.trim();
  const usedStar = STATE.starHope;
  input.disabled = true; // hết thời gian -> khoá nhập, không cho sửa nữa
  const savedEl = document.getElementById('saved-answer-indicator');
  if (savedEl) { savedEl.className = 'saved-answer-indicator hidden'; savedEl.textContent = ''; }
  showFeedback('info', 'Đang chấm điểm...');

  const entry = { question: q.question, userAnswer, correctAnswer: q.answer, correct: null, points: q.points, usedStar };

  gradeAnswerAsync(entry, (correct) => {
    entry.correct = correct; STATE.answers.push(entry);
    AUDIO.playSFX(correct);

    if (correct) {
      let pts = q.points; if (usedStar) pts *= 2;
      STATE.score += pts; updateScoreUI(true);
      showFeedback('correct', `✅ Đúng! +${pts} điểm${usedStar ? ' ⭐×2' : ''}`);
    } else {
      let penalty = 0;
      // Điểm số có thể âm: không giới hạn ở 0 khi bị trừ điểm do dùng ngôi sao hy vọng mà trả lời sai.
      if (usedStar) { penalty = q.points; STATE.score -= penalty; updateScoreUI(false); }
      showFeedback('wrong', `Đáp án: ${q.answer}${usedStar ? ` (−${penalty}đ)` : ''}`);
    }

    if (usedStar) { STATE.starHope = false; STATE.starHopeUsed = true; updateStarBtn(); }

    setTimeout(() => {
      STATE.currentIndex++;
      if (STATE.currentIndex >= STATE.questions.length) endVeDich();
      else showVeDichQuestion();
    }, 2500);
  });
}

function endVeDich() { clearAllTimers(); AUDIO.stopAll(); setTimeout(() => showResults(), 500); }

// ============================================================
// GRADING (wrapper async -> callback, để không đổi phần gọi cũ)
// ============================================================
function gradeAnswerAsync(entry, callback) {
  if (!entry.userAnswer || entry.userAnswer === '') { entry.correct = false; callback(false); return; }
  verifyAnswer({ question: entry.question, userAnswer: entry.userAnswer, correctAnswer: entry.correctAnswer })
    .then(r => { entry.correct = r.correct; callback(r.correct); })
    .catch(() => { entry.correct = false; callback(false); });
}

// ============================================================
// UI HELPERS
// ============================================================
function showQuestion(q) {
  const el = document.getElementById('question-text');
  el.classList.remove('entering', 'star-msg'); void el.offsetWidth;
  el.textContent = q.question; el.classList.add('entering');
}

function updateTimerUI(current, total) {
  const display = document.getElementById('timer-display');
  const fill    = document.getElementById('timeline-fill');
  display.textContent = current;
  fill.style.width = `${Math.max(0, (current / total) * 100)}%`;
  display.className = 'game-timer-display';
  if (current <= 10) display.classList.add('danger');
  else if (current <= 20) display.classList.add('warning');
}

function updateScoreUI(isCorrect) {
  const el = document.getElementById('score-display');
  el.textContent = STATE.score;
  el.className = 'score-number ' + (isCorrect ? 'bump' : 'wrong');
  setTimeout(() => { el.textContent = STATE.score; el.className = 'score-number'; }, 400);
}

function updateQCounter(current, total) {
  document.getElementById('q-counter').textContent = `Câu ${current}/${total}`;
}

function showFeedback(type, msg) {
  const el = document.getElementById('feedback-bar');
  el.className = 'feedback-bar ' + type; el.textContent = msg;
}

let _quickFeedbackTimeout;
function flashQuickFeedback(isCorrect, userAnswer) {
  if (userAnswer === '') { showFeedback('wrong', '⏭ Bỏ qua'); }
  else showFeedback(isCorrect ? 'correct' : 'wrong', isCorrect ? '✅ Chính xác!' : '❌ Chưa đúng');

  const input = document.getElementById('answer-input');
  if (input) {
    input.classList.remove('flash-correct', 'flash-wrong');
    void input.offsetWidth;
    input.classList.add(isCorrect ? 'flash-correct' : 'flash-wrong');
    setTimeout(() => input.classList.remove('flash-correct', 'flash-wrong'), 350);
  }

  clearTimeout(_quickFeedbackTimeout);
  _quickFeedbackTimeout = setTimeout(() => {
    document.getElementById('feedback-bar').className = 'feedback-bar hidden';
  }, 900);
}

// ============================================================
// STAR HOPE
// ============================================================
function toggleStarHope() {
  if (STATE.starHopeUsed) { showToast('⚠️ Ngôi sao hy vọng chỉ dùng được 1 lần mỗi trận!'); return; }
  // Ngôi sao hy vọng chỉ được BẬT, một khi đã bật thì không thể tắt lại.
  if (STATE.starHope) { showToast('⭐ Ngôi sao hy vọng đã bật rồi, không thể tắt!'); return; }
  if (STATE.vedich.phase !== 'star_intro') { showToast('⚠️ Chỉ bật được trong lúc hiện thông báo ngôi sao!'); return; }
  STATE.starHope = true;
  AUDIO.playStarHope(); showToast('⭐ Ngôi sao hy vọng đã bật! Không thể tắt lại.');
  updateStarBtn();
}

function updateStarBtn() {
  const btn = document.getElementById('star-hope-btn'); if (!btn) return;
  if (STATE.starHopeUsed) {
    btn.classList.remove('active'); btn.classList.add('used');
    btn.innerHTML = '<span class="star-hope-icon">⭐</span>Đã sử dụng'; return;
  }
  if (STATE.starHope) {
    btn.classList.add('active'); btn.classList.remove('used');
    btn.innerHTML = '<span class="star-hope-icon">⭐</span>Ngôi sao<br><strong>BẬT</strong>';
  } else {
    btn.classList.remove('active', 'used');
    btn.innerHTML = '<span class="star-hope-icon">⭐</span>Ngôi sao<br>hy vọng';
  }
}

// ============================================================
// GEMINI REGRADE (modal cờ ⚑ trong bảng kết quả)
// ============================================================
function requestGeminiRegrade(question, userAnswer) {
  const modal = document.getElementById('gemini-modal');
  const emojiEl = document.getElementById('gemini-modal-emoji');
  const titleEl = document.getElementById('gemini-modal-title');
  const verdictEl = document.getElementById('gemini-modal-verdict');
  const explEl = document.getElementById('gemini-modal-explanation');

  emojiEl.textContent = '⏳';
  titleEl.textContent = 'Đang gọi Gemini...';
  verdictEl.textContent = 'Vui lòng chờ giây lát';
  explEl.textContent = '';
  modal.classList.add('show');

  geminiRegradeOnly(question, userAnswer).then(result => {
    if (result && result.success) {
      const data = result.data;
      emojiEl.textContent = data.correct ? '✅' : '❌';
      titleEl.textContent = data.correct ? 'CHÍNH XÁC' : 'CHƯA CHÍNH XÁC';
      verdictEl.innerHTML = `<strong>Kết luận:</strong> ${data.verdict}`;
      explEl.innerHTML = `<strong>Giải thích:</strong><br>${escapeHTML(data.explanation)}`;
    } else {
      emojiEl.textContent = '⚠️';
      titleEl.textContent = 'Lỗi';
      verdictEl.textContent = 'Không thể liên hệ Gemini';
      explEl.textContent = (result && result.error) || 'Vui lòng thử lại sau.';
    }
  }).catch(err => {
    emojiEl.textContent = '⚠️';
    titleEl.textContent = 'Lỗi hệ thống';
    verdictEl.textContent = 'Gọi Gemini thất bại';
    explEl.textContent = String(err);
  });
}

function closeGeminiModal() {
  document.getElementById('gemini-modal').classList.remove('show');
}

// ============================================================
// RESULTS
// ============================================================
function showResults() {
  clearAllTimers(); AUDIO.stopAll();
  showFeedback('info', 'Đang chấm lại...');

  regradeAnswers(STATE.answers, STATE.questions).then(regradedAnswers => {
    STATE.answers = regradedAnswers;
    let newScore = 0;
    for (const a of STATE.answers) {
      if (a.correct) {
        if (STATE.mode === 'khoi_dong') { newScore += 10; }
        else { let pts = a.points || 10; if (a.usedStar) pts *= 2; newScore += pts; }
      } else if (STATE.mode === 've_dich' && a.usedStar) {
        // Dùng ngôi sao hy vọng mà trả lời sai -> bị trừ điểm; điểm cuối có thể âm.
        newScore -= (a.points || 10);
      }
    }
    STATE.score = newScore;
    displayResults();
  }).catch(() => displayResults());
}

function displayResults() {
  const correct = STATE.answers.filter(a => a.correct === true).length;
  const wrong   = STATE.answers.filter(a => a.correct === false && a.userAnswer && a.userAnswer !== '').length;

  const screen = document.getElementById('result-screen');
  screen.innerHTML = `
    <div class="result-score-header">
      <div class="result-stats-row">
        <div class="result-stat result-stat-score"><span class="result-stat-num gold">${STATE.score}</span><span class="result-stat-label">Điểm số</span></div>
        <div class="result-stat"><span class="result-stat-num green">${correct}</span><span class="result-stat-label">Câu đúng</span></div>
        <div class="result-stat"><span class="result-stat-num red">${wrong}</span><span class="result-stat-label">Câu sai</span></div>
        <div class="result-stat"><span class="result-stat-num muted">${STATE.answers.length}</span><span class="result-stat-label">Tổng câu</span></div>
      </div>
    </div>
    <div class="result-table-wrap">
      <table class="ans-table">
        <thead><tr><th style="text-align:left;">Câu hỏi</th><th>Người chơi</th><th style="text-align:left;">Đáp án</th><th></th></tr></thead>
        <tbody id="ans-tbody"></tbody>
      </table>
    </div>
    <div class="result-actions">
      <button class="btn btn-primary" onclick="restartGame()">Chơi lại</button>
      <button class="btn btn-outline" onclick="goHome()">Trang chủ</button>
    </div>
  `;

  const tbody = document.getElementById('ans-tbody');
  STATE.answers.forEach((a, i) => {
    const isCorrect = a.correct === true;
    const isSkipped = !a.userAnswer || a.userAnswer.trim() === '';
    const chipClass = isSkipped ? 'skipped' : (isCorrect ? 'correct' : 'wrong-ans');
    const chipText  = isSkipped ? 'Bỏ qua' : escapeHTML(a.userAnswer);

    let ptsHtml = '';
    if (STATE.mode === 've_dich') {
      const pc = a.points === 10 ? 'p10' : (a.points === 20 ? 'p20' : 'p30');
      ptsHtml = `<span class="pts-chip ${pc}">${a.points}đ${a.usedStar ? ' ⭐' : ''}</span>`;
    }
    let explanationHtml = '';
    if (!isCorrect && !isSkipped && a.explanation) {
      explanationHtml = `<div style="font-size:11px;color:#999;margin-top:3px;">📝 ${escapeHTML(a.explanation)}</div>`;
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="td-question"><span class="q-num">${i+1}.</span>${escapeHTML(a.question)}${ptsHtml}</td>
      <td class="td-player"><span class="player-chip ${chipClass}">${chipText}</span></td>
      <td class="td-answer">${escapeHTML(a.correctAnswer)}${explanationHtml}</td>
      <td class="td-actions">
        <button class="action-icon heart" disabled style="opacity:0.3;">♥</button>
        <button class="action-icon flag" data-q="${encodeURIComponent(a.question)}" data-a="${encodeURIComponent(a.userAnswer)}">⚑</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.action-icon.flag').forEach(btn => {
    btn.addEventListener('click', () => {
      requestGeminiRegrade(decodeURIComponent(btn.dataset.q), decodeURIComponent(btn.dataset.a));
    });
  });

  showScreen('result-screen');
}

function restartGame() { startGame(STATE.mode); }

// ============================================================
// TIMERS
// ============================================================
function clearAllTimers() {
  if (STATE.timerInterval) { clearInterval(STATE.timerInterval); STATE.timerInterval = null; }
  clearPhaseTimer();
}
function clearPhaseTimer() {
  if (STATE.phaseTimer) { clearInterval(STATE.phaseTimer); STATE.phaseTimer = null; }
}

// ============================================================
// UTIL
// ============================================================
function escapeHTML(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

updateIntroToggleUI();
