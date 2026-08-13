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
  // Nếu sau khi chuẩn hóa (bỏ ký tự đặc biệt/emoji) mà rỗng -> không có nội dung
  // để so sánh, luôn coi là SAI. Đây là lỗi gốc khiến gõ bậy (vd "=))", "!!!", "...")
  // bị chấm đúng, vì "abc".includes("") luôn trả về true trong JavaScript.
  if (!nu || !nc) return false;
  if (nu === nc) return true;
  // Chỉ áp dụng kiểu so khớp "chứa nhau" khi cả hai chuỗi đủ dài (>= 3 ký tự),
  // tránh trường hợp đáp án ngắn (vd "1", "có") bị khớp bậy chỉ vì tình cờ
  // xuất hiện đâu đó trong một câu trả lời dài không liên quan.
  if (nu.length >= 3 && nc.length >= 3 && (nu.includes(nc) || nc.includes(nu))) return true;
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
      <button class="btn btn-research" onclick="openResearch()">🔎 Nghiên cứu</button>
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

// ============================================================
// 🔎 NGHIÊN CỨU (biến bộ câu hỏi vừa làm thành kho kiến thức)
// ============================================================
const RESEARCH = { data: null, hash: null, learned: {}, bookmarks: {} };

function hashQuizContent(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return 'q' + Math.abs(h).toString(36);
}
function getResearchCacheKey() {
  const content = STATE.mode + '|' + STATE.answers.map(a => (a.question || '') + '::' + (a.correctAnswer || '')).join('||');
  return 'olympia_research_' + hashQuizContent(content);
}
function loadResearchLocalState(key) {
  try { RESEARCH.learned = JSON.parse(localStorage.getItem(key + '_learned') || '{}'); } catch (e) { RESEARCH.learned = {}; }
  try { RESEARCH.bookmarks = JSON.parse(localStorage.getItem(key + '_bookmarks') || '{}'); } catch (e) { RESEARCH.bookmarks = {}; }
}

function openResearch() {
  if (!STATE.answers || STATE.answers.length === 0) { showToast('Chưa có dữ liệu để nghiên cứu'); return; }
  showScreen('research-screen');
  const key = getResearchCacheKey();
  RESEARCH.hash = key;
  loadResearchLocalState(key);
  let cached = null;
  try { const raw = localStorage.getItem(key); if (raw) cached = JSON.parse(raw); } catch (e) {}
  if (cached) { RESEARCH.data = normalizeResearchData(cached); renderResearch(); }
  else fetchResearch();
}

function renderResearchLoading() {
  document.getElementById('research-screen').innerHTML = `
    <div class="research-loading">
      <div class="spinner"></div>
      <div class="research-loading-text">Gemini đang phân tích bộ câu hỏi và xây dựng kho kiến thức...</div>
      <button class="btn btn-outline" onclick="showScreen('result-screen')">Hủy</button>
    </div>`;
}
function renderResearchError(msg) {
  document.getElementById('research-screen').innerHTML = `
    <div class="research-loading">
      <div style="font-size:40px;">⚠️</div>
      <div class="research-loading-text">Không thể tạo bản nghiên cứu.<br><span style="font-size:12px;color:var(--text-muted)">${escapeHTML(msg || '')}</span></div>
      <div style="display:flex;gap:10px;">
        <button class="btn btn-primary" onclick="fetchResearch()">Thử lại</button>
        <button class="btn btn-outline" onclick="showScreen('result-screen')">Quay lại kết quả</button>
      </div>
    </div>`;
}

function buildResearchPrompt(mode, answers) {
  const qaList = answers.map((a, i) =>
    `${i + 1}. Câu hỏi: ${a.question}\nĐáp án đúng: ${a.correctAnswer}\nThí sinh trả lời: ${a.userAnswer || '(bỏ qua)'}\nKết quả: ${a.correct ? 'Đúng' : 'Sai'}`
  ).join('\n\n');

  return `Bạn là một chuyên gia xây dựng kho kiến thức cho thí sinh Đường Lên Đỉnh Olympia.

Nhiệm vụ: phân tích TOÀN BỘ bộ câu hỏi + đáp án dưới đây và rút ra một hệ thống kiến thức ngắn gọn, cô đọng để người học ghi nhớ. KHÔNG chỉ giải thích từng câu một cách rời rạc — hãy tìm những kiến thức có giá trị học tập cao nhất, xây dựng mối liên hệ giữa chúng.

Ưu tiên theo thứ tự: từ khóa, mốc thời gian, nhân vật, địa danh, sự kiện, quốc gia, tổ chức, tác phẩm, tác giả, khái niệm, thuật ngữ, số liệu quan trọng, câu thơ/câu văn đáng nhớ, thành ngữ/tục ngữ, kiến thức liên ngành.

QUY TẮC BẮT BUỘC:
- Chỉ dùng kiến thức có độ tin cậy cao, có trong câu hỏi hoặc suy ra trực tiếp từ câu hỏi. KHÔNG được bịa thông tin.
- Nếu không chắc chắn về một chi tiết (ngày tháng, số liệu, tên riêng, câu thơ...), hãy thêm "⚠️ Chưa xác minh" vào cuối bullet đó thay vì khẳng định chắc chắn.
- Trình bày cực kỳ cô đọng bằng bullet point / từ khóa, KHÔNG viết đoạn văn dài.
- Mỗi mục kiến thức tối đa 3-7 bullet.
- Chỉ đưa các mục thực sự xuất hiện hoặc liên quan trực tiếp đến nội dung bộ câu hỏi — nếu một phần không có dữ liệu liên quan, trả về mảng rỗng [] cho phần đó.
- Đánh giá độ quan trọng ("importance") của mỗi mục kiến thức dựa trên: có xuất hiện trực tiếp trong câu hỏi, là đáp án đúng, liên quan đến nhiều câu, có tính nền tảng, có khả năng xuất hiện lại trong các cuộc thi kiến thức.

BỘ CÂU HỎI (${answers.length} câu, chế độ ${mode === 'khoi_dong' ? 'Khởi Động' : 'Về Đích'}):

${qaList}

CHỈ TRẢ VỀ JSON THUẦN theo đúng schema sau, không markdown, không giải thích thêm, không thêm field khác:

{
  "topics": ["<chủ đề chính, vd: Lịch sử Việt Nam>"],
  "keywordsBySubject": [{"subject":"<môn/chủ đề>","keywords":["<từ khóa>"]}],
  "knowledge": [{"title":"<tên kiến thức>","importance":"high|medium|low","bullets":["<bullet ngắn>"]}],
  "timeline": [{"year":"<năm hoặc ngày>","event":"<sự kiện>"}],
  "people": [{"name":"<tên nhân vật>","bullets":["<bullet ngắn>"]}],
  "places": [{"name":"<tên địa danh>","bullets":["<bullet ngắn>"]}],
  "literature": [{"title":"<tác phẩm>","bullets":["<bullet ngắn, vd: Tác giả:..., Thể loại:...>"]}],
  "events": [{"name":"<sự kiện>","bullets":["<bullet ngắn>"]}],
  "connections": [{"chain":["<mắt xích 1>","<mắt xích 2>","..."]}],
  "potentialQuestions": ["<câu hỏi có khả năng gặp lại trong các cuộc thi kiến thức, 5-15 câu>"]
}`;
}

function normalizeResearchData(d) {
  d = d || {};
  return {
    topics: Array.isArray(d.topics) ? d.topics : [],
    keywordsBySubject: Array.isArray(d.keywordsBySubject) ? d.keywordsBySubject : [],
    knowledge: Array.isArray(d.knowledge) ? d.knowledge : [],
    timeline: Array.isArray(d.timeline) ? d.timeline : [],
    people: Array.isArray(d.people) ? d.people : [],
    places: Array.isArray(d.places) ? d.places : [],
    literature: Array.isArray(d.literature) ? d.literature : [],
    events: Array.isArray(d.events) ? d.events : [],
    connections: Array.isArray(d.connections) ? d.connections : [],
    potentialQuestions: Array.isArray(d.potentialQuestions) ? d.potentialQuestions : []
  };
}

async function fetchResearch() {
  renderResearchLoading();
  try {
    const prompt = buildResearchPrompt(STATE.mode, STATE.answers);
    let text = await callGemini(prompt, 4096, 0.3);
    text = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    let data;
    try { data = JSON.parse(text); }
    catch (e) {
      const m = text.match(/\{[\s\S]*\}/);
      if (m) data = JSON.parse(m[0]);
      else throw new Error('Không đọc được kết quả JSON từ Gemini');
    }
    data = normalizeResearchData(data);
    RESEARCH.data = data;
    try { localStorage.setItem(RESEARCH.hash, JSON.stringify(data)); } catch (e) {}
    renderResearch();
  } catch (e) {
    renderResearchError(String((e && e.message) || e));
  }
}

function importanceRank(imp) { return imp === 'high' ? 0 : imp === 'medium' ? 1 : 2; }
function importanceBadge(imp) {
  if (imp === 'high') return '<span class="imp-badge imp-high">🔥 Rất quan trọng</span>';
  if (imp === 'medium') return '<span class="imp-badge imp-medium">⭐ Quan trọng</span>';
  return '<span class="imp-badge imp-low">• Bổ sung</span>';
}

function renderResearch() {
  const d = RESEARCH.data;
  const screen = document.getElementById('research-screen');
  const totalKeywords = d.keywordsBySubject.reduce((s, g) => s + ((g.keywords && g.keywords.length) || 0), 0);
  const sortedKnowledge = d.knowledge.slice().sort((a, b) => importanceRank(a.importance) - importanceRank(b.importance));

  const navItems = [
    ['rs-keywords', '🔑 Từ khóa', d.keywordsBySubject.length],
    ['rs-knowledge', '🧠 Kiến thức', d.knowledge.length],
    ['rs-timeline', '⏳ Mốc thời gian', d.timeline.length],
    ['rs-people', '👤 Nhân vật', d.people.length],
    ['rs-places', '🌏 Địa danh', d.places.length],
    ['rs-literature', '📖 Văn học', d.literature.length],
    ['rs-events', '⚡ Sự kiện', d.events.length],
    ['rs-connections', '🔗 Liên kết', d.connections.length],
    ['rs-questions', '🎯 Có thể gặp lại', d.potentialQuestions.length]
  ].filter(x => x[2] > 0);

  const cardHead = (title, section, i, extra) => `
    <div class="research-card-head">
      <div class="research-card-title">${escapeHTML(title || '')}</div>
      ${extra || ''}
      <button class="icon-btn bookmark-btn ${RESEARCH.bookmarks[section + ':' + i] ? 'active' : ''}" onclick="toggleBookmark(this,'${section}',${i})" title="Đánh dấu">🔖</button>
    </div>`;
  const simpleCards = (items, section, nameField) => items.map((it, i) => `
    <div class="research-card" data-search="${escapeHTML(((it[nameField] || '') + ' ' + (it.bullets || []).join(' ')).toLowerCase())}">
      ${cardHead(it[nameField], section, i)}
      <ul class="research-bullets">${(it.bullets || []).map(b => `<li>${escapeHTML(b)}</li>`).join('')}</ul>
    </div>`).join('');

  screen.innerHTML = `
    <div class="research-topbar">
      <div class="research-topbar-left">
        <button class="btn btn-outline btn-sm" onclick="showScreen('result-screen')">← Kết quả</button>
        <div class="research-title">🔎 NGHIÊN CỨU BỘ CÂU HỎI</div>
      </div>
      <input type="text" id="research-search" class="research-search" placeholder="Tìm kiếm trong bản nghiên cứu..." oninput="filterResearch()">
    </div>
    <div class="research-body">
      <div class="research-sidebar">
        ${navItems.map(([id, label, count]) => `<a href="#${id}" class="research-nav-link">${label}<span class="research-nav-count">${count}</span></a>`).join('')}
      </div>
      <div class="research-main" id="research-main">
        <div class="research-summary-row">
          <div class="research-summary-box"><div class="research-summary-num">${STATE.answers.length}</div><div class="research-summary-label">Câu đã phân tích</div></div>
          <div class="research-summary-box"><div class="research-summary-num">${totalKeywords}</div><div class="research-summary-label">Từ khóa</div></div>
          <div class="research-summary-box"><div class="research-summary-num">${d.knowledge.length}</div><div class="research-summary-label">Kiến thức quan trọng</div></div>
        </div>
        ${d.topics.length ? `<div class="research-topics">📚 Chủ đề chính: ${d.topics.map(t => `<span class="topic-chip">${escapeHTML(t)}</span>`).join('')}</div>` : ''}

        ${d.keywordsBySubject.length ? `
        <section class="research-section" id="rs-keywords">
          <div class="research-section-head"><h3>🔑 Từ khóa quan trọng</h3><button class="icon-btn" onclick="copyResearchSection('rs-keywords','Từ khóa')">⧉ Copy</button></div>
          <div class="subject-chips">${d.keywordsBySubject.map(g => `<span class="subject-chip" data-subject="${escapeHTML(g.subject)}" onclick="filterBySubject(this)">${escapeHTML(g.subject)}</span>`).join('')}</div>
          ${d.keywordsBySubject.map(g => `
            <div class="subject-block" data-subject="${escapeHTML(g.subject)}">
              <div class="subject-block-title">${escapeHTML(g.subject)}</div>
              <div class="keyword-list">${(g.keywords || []).map(k => `<span class="keyword-chip" data-search="${escapeHTML(String(k).toLowerCase())}" data-keyword="${escapeHTML(k)}" onclick="researchDeepDive(this.dataset.keyword)" title="Bấm để nghiên cứu sâu">${escapeHTML(k)}</span>`).join('')}</div>
            </div>`).join('')}
        </section>` : ''}

        ${d.knowledge.length ? `
        <section class="research-section" id="rs-knowledge">
          <div class="research-section-head">
            <h3>🧠 Kiến thức cần nhớ</h3>
            <div class="imp-filters">
              <button class="imp-filter-btn active" onclick="filterByImportance('all', this)">Tất cả</button>
              <button class="imp-filter-btn" onclick="filterByImportance('high', this)">🔥</button>
              <button class="imp-filter-btn" onclick="filterByImportance('medium', this)">⭐</button>
              <button class="imp-filter-btn" onclick="filterByImportance('low', this)">•</button>
            </div>
            <button class="icon-btn" onclick="copyResearchSection('rs-knowledge','Kiến thức')">⧉ Copy</button>
          </div>
          ${sortedKnowledge.map((k, i) => `
            <div class="research-card ${RESEARCH.learned['knowledge:' + i] ? 'learned' : ''}" data-importance="${k.importance || 'low'}" data-search="${escapeHTML(((k.title || '') + ' ' + (k.bullets || []).join(' ')).toLowerCase())}">
              ${cardHead(k.title, 'knowledge', i, importanceBadge(k.importance))}
              <ul class="research-bullets">${(k.bullets || []).map(b => `<li>${escapeHTML(b)}</li>`).join('')}</ul>
              <label class="learned-toggle"><input type="checkbox" ${RESEARCH.learned['knowledge:' + i] ? 'checked' : ''} onchange="toggleLearned(this,${i})"> Đã học</label>
            </div>`).join('')}
        </section>` : ''}

        ${d.timeline.length ? `
        <section class="research-section" id="rs-timeline">
          <div class="research-section-head"><h3>⏳ Mốc thời gian</h3><button class="icon-btn" onclick="copyResearchSection('rs-timeline','Mốc thời gian')">⧉ Copy</button></div>
          <div class="timeline-list">${d.timeline.map(t => `<div class="timeline-item" data-search="${escapeHTML(((t.year || '') + ' ' + (t.event || '')).toLowerCase())}"><span class="timeline-year">${escapeHTML(t.year || '')}</span><span class="timeline-event">${escapeHTML(t.event || '')}</span></div>`).join('')}</div>
        </section>` : ''}

        ${d.people.length ? `
        <section class="research-section" id="rs-people">
          <div class="research-section-head"><h3>👤 Nhân vật</h3><button class="icon-btn" onclick="copyResearchSection('rs-people','Nhân vật')">⧉ Copy</button></div>
          ${simpleCards(d.people, 'people', 'name')}
        </section>` : ''}

        ${d.places.length ? `
        <section class="research-section" id="rs-places">
          <div class="research-section-head"><h3>🌏 Địa danh</h3><button class="icon-btn" onclick="copyResearchSection('rs-places','Địa danh')">⧉ Copy</button></div>
          ${simpleCards(d.places, 'places', 'name')}
        </section>` : ''}

        ${d.literature.length ? `
        <section class="research-section" id="rs-literature">
          <div class="research-section-head"><h3>📖 Văn học</h3><button class="icon-btn" onclick="copyResearchSection('rs-literature','Văn học')">⧉ Copy</button></div>
          ${simpleCards(d.literature, 'literature', 'title')}
        </section>` : ''}

        ${d.events.length ? `
        <section class="research-section" id="rs-events">
          <div class="research-section-head"><h3>⚡ Sự kiện</h3><button class="icon-btn" onclick="copyResearchSection('rs-events','Sự kiện')">⧉ Copy</button></div>
          ${simpleCards(d.events, 'events', 'name')}
        </section>` : ''}

        ${d.connections.length ? `
        <section class="research-section" id="rs-connections">
          <div class="research-section-head"><h3>🔗 Kiến thức liên kết</h3><button class="icon-btn" onclick="copyResearchSection('rs-connections','Liên kết')">⧉ Copy</button></div>
          ${d.connections.map(c => `<div class="connection-chain">${(c.chain || []).map(x => escapeHTML(x)).join(' <span class="chain-arrow">→</span> ')}</div>`).join('')}
        </section>` : ''}

        ${d.potentialQuestions.length ? `
        <section class="research-section" id="rs-questions">
          <div class="research-section-head"><h3>🎯 Olympia có thể hỏi gì?</h3><button class="icon-btn" onclick="copyResearchSection('rs-questions','Câu hỏi tiềm năng')">⧉ Copy</button></div>
          <ol class="potential-q-list">${d.potentialQuestions.map(q => `<li data-search="${escapeHTML(String(q).toLowerCase())}">${escapeHTML(q)}</li>`).join('')}</ol>
        </section>` : ''}

        <div class="research-footer-note">⚠️ Nội dung do AI tạo ra dựa trên bộ câu hỏi vừa làm — nên đối chiếu lại với nguồn chính thức trước khi ghi nhớ tuyệt đối.</div>
      </div>
    </div>`;
}

function bmSave() { try { localStorage.setItem(RESEARCH.hash + '_bookmarks', JSON.stringify(RESEARCH.bookmarks)); } catch (e) {} }
function toggleBookmark(btn, section, idx) {
  const key = section + ':' + idx;
  if (RESEARCH.bookmarks[key]) delete RESEARCH.bookmarks[key]; else RESEARCH.bookmarks[key] = true;
  bmSave();
  btn.classList.toggle('active');
}
function toggleLearned(checkbox, idx) {
  const key = 'knowledge:' + idx;
  if (checkbox.checked) RESEARCH.learned[key] = true; else delete RESEARCH.learned[key];
  try { localStorage.setItem(RESEARCH.hash + '_learned', JSON.stringify(RESEARCH.learned)); } catch (e) {}
  const card = checkbox.closest('.research-card');
  if (card) card.classList.toggle('learned', checkbox.checked);
}

function filterResearch() {
  const q = (document.getElementById('research-search').value || '').trim().toLowerCase();
  document.querySelectorAll('#research-main [data-search]').forEach(el => {
    const text = el.getAttribute('data-search') || '';
    el.style.display = (!q || text.indexOf(q) !== -1) ? '' : 'none';
  });
}
function filterByImportance(level, btn) {
  document.querySelectorAll('.imp-filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('#rs-knowledge .research-card').forEach(el => {
    el.style.display = (level === 'all' || el.dataset.importance === level) ? '' : 'none';
  });
}
function filterBySubject(btn) {
  btn.classList.toggle('active');
  const activeSubjects = Array.from(document.querySelectorAll('.subject-chip.active')).map(b => b.dataset.subject);
  document.querySelectorAll('.subject-block').forEach(el => {
    el.style.display = (activeSubjects.length === 0 || activeSubjects.indexOf(el.dataset.subject) !== -1) ? '' : 'none';
  });
}

function copyResearchSection(id, label) {
  const el = document.getElementById(id);
  if (!el) return;
  const text = el.innerText;
  const done = () => showToast((label || 'Nội dung') + ' đã được sao chép');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopyText(text, done));
  } else fallbackCopyText(text, done);
}
function fallbackCopyText(text, cb) {
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); } catch (e) {}
  document.body.removeChild(ta);
  if (cb) cb();
}

// -------------------- 🔬 Nghiên cứu sâu một từ khóa --------------------
function markdownLiteToHtml(text) {
  const lines = String(text).split('\n');
  let html = '', inList = false;
  lines.forEach(line => {
    const t = line.trim();
    if (!t) return;
    if (t.startsWith('### ') || t.startsWith('## ') || t.startsWith('# ')) {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<div class="rdm-heading">${escapeHTML(t.replace(/^#{1,3}\s*/, ''))}</div>`;
    } else if (t.startsWith('- ') || t.startsWith('* ')) {
      if (!inList) { html += '<ul class="rdm-list">'; inList = true; }
      html += `<li>${escapeHTML(t.slice(2))}</li>`;
    } else {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<div class="rdm-para">${escapeHTML(t)}</div>`;
    }
  });
  if (inList) html += '</ul>';
  return html;
}

function researchDeepDive(keyword) {
  const modal = document.getElementById('research-deep-modal');
  document.getElementById('rdm-title').textContent = '🔬 ' + keyword;
  const body = document.getElementById('rdm-body');
  modal.classList.add('show');

  const cacheKey = RESEARCH.hash + '_deep_' + keyword;
  let cached = null;
  try { cached = localStorage.getItem(cacheKey); } catch (e) {}
  if (cached) { body.innerHTML = cached; return; }

  body.innerHTML = '<div class="spinner" style="margin:20px auto;"></div>';
  const context = STATE.answers.map(a => (a.question || '') + ' -> ' + (a.correctAnswer || '')).join('; ');
  const prompt = `Bạn là chuyên gia kiến thức Olympia. Hãy mở rộng kiến thức về từ khóa sau, liên hệ với bối cảnh bộ câu hỏi đã cho.
Trình bày dạng bullet cô đọng, chia theo các khía cạnh liên quan (vd: Lịch sử, Địa lý, Nhân vật, Thời gian, Bối cảnh...). Mỗi khía cạnh 2-5 bullet.
KHÔNG bịa thông tin, nếu không chắc chắn thêm "⚠️ Chưa xác minh". Trả lời bằng heading nhỏ "### " cho mỗi khía cạnh và bullet "- " bên dưới, không thêm lời dẫn hay kết luận.

Từ khóa: ${keyword}

Bối cảnh bộ câu hỏi: ${context}`;

  callGemini(prompt, 800, 0.3).then(text => {
    const html = markdownLiteToHtml(text) || '<div class="rdm-para">Không có thêm dữ liệu.</div>';
    body.innerHTML = html;
    try { localStorage.setItem(cacheKey, html); } catch (e) {}
  }).catch(err => {
    body.innerHTML = `<div class="rdm-para" style="color:var(--text-muted)">Không thể tải: ${escapeHTML(String(err))}</div>`;
  });
}
function closeDeepModal() { document.getElementById('research-deep-modal').classList.remove('show'); }

updateIntroToggleUI();
