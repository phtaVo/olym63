// ============================================================
// TRẢ LỜI BẰNG GIỌNG NÓI — mic bật xuyên suốt khi đang chơi
//  • Web Speech API (Chrome / Edge / Android), tiếng Việt
//  • Nói xong là nộp luôn đáp án (kết quả "chốt" hoặc câu nói đã ổn định ~0,6 giây) → chấm và sang câu kế ngay
//  • Nói "bỏ qua" để bỏ câu hiện tại
// ============================================================
const VOICE = (() => {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const KEY = 'olym63_voice';
  const STABLE_MS = 600;           // câu nói không đổi trong 0,6 giây → coi như đã nói xong
  const ls = { get: () => { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } }, set: v => { try { localStorage.setItem(KEY, v ? '1' : '0'); } catch (e) {} } };
  let on = ls.get(), rec = null, active = false, inGame = false, stableT = null, restartT = null, netWarned = false, lastInterim = '', skipFinalUntil = 0;
  const $ = id => document.getElementById(id);
  const toast = m => { try { showToast(m); } catch (e) {} };

  function ensureBtn() {
    const wrap = document.querySelector('#game-screen .input-wrapper'); if (!wrap) return null;
    let b = $('voice-btn');
    if (!b) {
      b = document.createElement('button'); b.id = 'voice-btn'; b.type = 'button'; b.className = 'voice-btn';
      b.onclick = toggle; wrap.insertBefore(b, wrap.firstChild);
    }
    paint(b); return b;
  }
  function paint(b) {
    b = b || $('voice-btn'); if (!b) return;
    b.classList.toggle('on', on); b.classList.toggle('live', on && active);
    b.title = on ? 'Đang trả lời bằng giọng nói. Bấm để tắt' : 'Bật trả lời bằng giọng nói';
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>' + (on ? '' : '<path d="M4 4l16 16"/>') + '</svg><span>' + (on ? 'Đang nghe' : 'Giọng nói') + '</span>';
    const inp = $('answer-input'); if (inp) inp.placeholder = (on && active) ? 'Hãy nói đáp án…' : 'Nhập câu trả lời...';
  }

  function toggle() {
    if (!SR) { toast('Trình duyệt này chưa hỗ trợ nhận giọng nói. Hãy dùng Chrome hoặc Edge.'); return; }
    on = !on; ls.set(on); on ? start() : stop(); paint();
    toast(on ? 'Đã bật mic: nói đáp án, hệ thống chấm và sang câu ngay. Nói "bỏ qua" để bỏ câu.' : 'Đã tắt trả lời bằng giọng nói.');
  }

  function clean(t) { return String(t || '').replace(/[.,!?;:"“”]+/g, ' ').replace(/\s+/g, ' ').trim(); }

  function submit(raw, abortAfter) {
    clearTimeout(stableT); stableT = null; lastInterim = '';
    let text = clean(raw); if (!text) return;
    const inp = $('answer-input'); if (!inp || inp.disabled) return;
    if (/^(bỏ qua|bo qua|qua|chuyển câu|pass|next)$/i.test(text)) text = '';
    inp.value = text;
    try { onInputKeydown({ key: 'Enter', preventDefault() {} }); } catch (e) {}
    if (abortAfter) { skipFinalUntil = Date.now() + 400; try { rec.abort(); } catch (e) {} }
  }

  function build() {
    rec = new SR(); rec.lang = 'vi-VN'; rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 1;
    rec.onresult = e => {
      if (Date.now() < skipFinalUntil) return;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i], t = r[0].transcript;
        if (r.isFinal) { submit(t, false); }
        else {
          const inp = $('answer-input'); if (inp && !inp.disabled) inp.value = clean(t);   // hiện chữ đang nghe được
          if (t !== lastInterim) { lastInterim = t; clearTimeout(stableT); stableT = setTimeout(() => submit(lastInterim, true), STABLE_MS); }
        }
      }
    };
    rec.onerror = e => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { on = false; ls.set(false); stop(); paint(); toast('Chưa cấp quyền micro. Bấm biểu tượng ổ khóa cạnh địa chỉ web → cho phép Micro.'); }
      else if (e.error === 'network' && !netWarned) { netWarned = true; toast('Nhận giọng nói cần có mạng. Kiểm tra kết nối.'); }
    };
    rec.onend = () => { active = false; paint(); if (on && inGame) { clearTimeout(restartT); restartT = setTimeout(start, 120); } };
    rec.onstart = () => { active = true; paint(); };
  }
  function start() {
    if (!SR || !on || !inGame || active) return;
    try { if (!rec) build(); rec.start(); } catch (e) { /* đang chạy rồi */ }
  }
  function stop() {
    clearTimeout(stableT); clearTimeout(restartT); active = false;
    try { rec && rec.abort(); } catch (e) {}
    paint();
  }
  function onScreen(id) {
    inGame = (id === 'game-screen');
    if (inGame) { ensureBtn(); if (on) start(); } else stop();
  }
  return { onScreen, toggle, supported: !!SR };
})();
