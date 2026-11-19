// ============================================================
// Cloudflare Worker — API tài khoản / bảng xếp hạng cho Olympia Web
// ============================================================
// Chạy song song với Worker Gemini proxy đã có (không đụng vào nó).
// Worker này cần được gắn với 1 D1 database tên "olympia-accounts"
// (xem hướng dẫn deploy trong README.md cùng thư mục).
//
// CÁC ENDPOINT:
//   POST /setup                (chỉ dùng được 1 lần, lúc DB còn trống — tạo tài khoản admin đầu tiên)
//   POST /login                { username, password } -> { token, user }
//   GET  /me                   (cần đăng nhập) -> { user }
//   POST /change-password      (cần đăng nhập) { oldPassword, newPassword }
//   POST /update-profile       (cần đăng nhập) { username?, avatar? }
//   POST /scores                (cần đăng nhập) { mode, score } -> lưu điểm 1 trận
//   GET  /leaderboard?mode=khoi_dong|ve_dich  (cần đăng nhập) -> bảng xếp hạng
//   GET  /admin/users          (chỉ admin)
//   POST /admin/users          (chỉ admin) tạo tài khoản mới
//   PUT  /admin/users/:id      (chỉ admin) sửa thông tin / đặt lại mật khẩu
//   DELETE /admin/users/:id    (chỉ admin) xoá tài khoản
//   --- NGHIÊN CỨU ---  GET /research/status | POST /research/consent | POST /research/withdraw | POST /research/log | GET /research/model | GET /admin/research/export
// ============================================================

const TOKEN_MAX_AGE_MS = 400 * 24 * 60 * 60 * 1000; // ~400 ngày — "giữ đăng nhập luôn"

export default {
  async fetch(request, env) {
    const ALLOWED_ORIGIN = env.ALLOWED_ORIGIN || '*';
    const corsHeaders = {
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      const url = new URL(request.url);
      const path = url.pathname.replace(/\/+$/, '') || '/';
      const respond = (data, status = 200) =>
        new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
      const fail = (message, status = 400) => respond({ error: message }, status);

      if (!env.DB) return fail('Worker chưa gắn D1 database (DB binding thiếu).', 500);
      if (!env.JWT_SECRET) return fail('Worker chưa cấu hình JWT_SECRET.', 500);

      // ---------- POST /setup ----------
      if (path === '/setup' && request.method === 'POST') {
        const countRow = await env.DB.prepare('SELECT COUNT(*) as c FROM users').first();
        if (countRow && countRow.c > 0) return fail('Đã có tài khoản admin, không thể setup lại. Nếu quên mật khẩu, hãy sửa trực tiếp trong D1.', 403);

        const body = await safeJson(request);
        const { username, password, full_name } = body || {};
        if (!username || !password || !full_name) return fail('Thiếu username / password / full_name.');
        if (password.length < 4) return fail('Mật khẩu cần tối thiểu 4 ký tự.');

        const { hash, salt } = await hashPassword(password);
        try {
          await env.DB.prepare(
            `INSERT INTO users (username, password_hash, password_salt, full_name, role) VALUES (?, ?, ?, ?, 'admin')`
          ).bind(username.trim(), hash, salt, full_name.trim()).run();
        } catch (e) {
          return fail(uniqueErr(e) ? 'Tên đăng nhập đã tồn tại.' : ('Lỗi tạo tài khoản: ' + String(e)), 400);
        }
        return respond({ ok: true, message: 'Đã tạo tài khoản admin đầu tiên. Giờ bạn có thể đăng nhập.' });
      }

      // ---------- POST /login ----------
      if (path === '/login' && request.method === 'POST') {
        const body = await safeJson(request);
        const { username, password } = body || {};
        if (!username || !password) return fail('Thiếu tên đăng nhập hoặc mật khẩu.');

        const user = await env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(username.trim()).first();
        if (!user) return fail('Sai tên đăng nhập hoặc mật khẩu.', 401);
        const ok = await verifyPassword(password, user.password_hash, user.password_salt);
        if (!ok) return fail('Sai tên đăng nhập hoặc mật khẩu.', 401);

        const token = await signToken({ uid: user.id, tv: user.token_version, exp: Date.now() + TOKEN_MAX_AGE_MS }, env.JWT_SECRET);
        return respond({ token, user: publicUser(user) });
      }

      // ---------- Các route còn lại đều cần đăng nhập ----------
      const authUser = await getAuthUser(request, env);
      if (!authUser) return fail('Chưa đăng nhập hoặc phiên đã hết hạn.', 401);

      // ---------- GET /me ----------
      if (path === '/me' && request.method === 'GET') {
        return respond({ user: publicUser(authUser) });
      }

      // ---------- POST /change-password ----------
      if (path === '/change-password' && request.method === 'POST') {
        const body = await safeJson(request);
        const { oldPassword, newPassword } = body || {};
        if (!oldPassword || !newPassword) return fail('Thiếu mật khẩu cũ / mới.');
        if (newPassword.length < 4) return fail('Mật khẩu mới cần tối thiểu 4 ký tự.');
        const ok = await verifyPassword(oldPassword, authUser.password_hash, authUser.password_salt);
        if (!ok) return fail('Mật khẩu hiện tại không đúng.', 401);

        const { hash, salt } = await hashPassword(newPassword);
        await env.DB.prepare('UPDATE users SET password_hash=?, password_salt=?, token_version=token_version+1 WHERE id=?')
          .bind(hash, salt, authUser.id).run();
        const newToken = await signToken({ uid: authUser.id, tv: authUser.token_version + 1, exp: Date.now() + TOKEN_MAX_AGE_MS }, env.JWT_SECRET);
        return respond({ ok: true, token: newToken });
      }

      // ---------- POST /update-profile (đổi avatar / tên người dùng) ----------
      if (path === '/update-profile' && request.method === 'POST') {
        const body = await safeJson(request);
        const fields = [];
        const values = [];
        if (typeof body.username === 'string' && body.username.trim() && body.username.trim() !== authUser.username) {
          fields.push('username = ?'); values.push(body.username.trim());
        }
        if (typeof body.avatar === 'string') {
          if (body.avatar.length > 700000) return fail('Ảnh đại diện quá lớn, hãy chọn ảnh nhỏ hơn.');
          fields.push('avatar = ?'); values.push(body.avatar || null);
        }
        if (!fields.length) return respond({ ok: true, user: publicUser(authUser) });

        values.push(authUser.id);
        try {
          await env.DB.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
        } catch (e) {
          return fail(uniqueErr(e) ? 'Tên người dùng đã có người khác dùng.' : ('Lỗi cập nhật: ' + String(e)), 400);
        }
        const updated = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(authUser.id).first();
        return respond({ ok: true, user: publicUser(updated) });
      }

      // ---------- POST /scores ----------
      if (path === '/scores' && request.method === 'POST') {
        const body = await safeJson(request);
        const { mode, score } = body || {};
        if (mode !== 'khoi_dong' && mode !== 've_dich') return fail('mode không hợp lệ.');
        if (typeof score !== 'number' || Number.isNaN(score)) return fail('score không hợp lệ.');
        await env.DB.prepare('INSERT INTO scores (user_id, mode, score) VALUES (?, ?, ?)')
          .bind(authUser.id, mode, Math.round(score)).run();
        return respond({ ok: true });
      }

      // ---------- GET /leaderboard ----------
      if (path === '/leaderboard' && request.method === 'GET') {
        const mode = url.searchParams.get('mode');
        if (mode !== 'khoi_dong' && mode !== 've_dich') return fail('mode không hợp lệ (khoi_dong | ve_dich).');
        const { results } = await env.DB.prepare(
          `SELECT u.id, u.username, u.full_name, u.avatar, u.school, u.class,
                  AVG(s.score) as avg_score, COUNT(s.id) as total_games, MAX(s.score) as best_score
           FROM users u JOIN scores s ON s.user_id = u.id
           WHERE s.mode = ?
           GROUP BY u.id
           ORDER BY avg_score DESC, total_games DESC`
        ).bind(mode).all();
        return respond({ leaderboard: (results || []).map(r => ({
          id: r.id, username: r.username, full_name: r.full_name, avatar: r.avatar,
          school: r.school, class: r.class,
          avg_score: Math.round(r.avg_score * 10) / 10, total_games: r.total_games, best_score: r.best_score
        })) });
      }

      // ---------- NGHIÊN CỨU (Olym63 v2) — chỉ ghi khi học sinh đã đồng ý ----------
      if (path === '/research/status' && request.method === 'GET') {
        const l = await env.DB.prepare('SELECT learner_id, consent_at, group_code FROM learner WHERE user_id = ?').bind(authUser.id).first();
        return respond({ consented: !!(l && l.consent_at), group_code: l ? l.group_code : 'none' });
      }
      if (path === '/research/consent' && request.method === 'POST') {
        const body = await safeJson(request);
        if (body.agree !== true) return fail('Thiếu xác nhận đồng ý.');
        const ver = String(body.version || 'v0').slice(0, 20);
        let l = await env.DB.prepare('SELECT * FROM learner WHERE user_id = ?').bind(authUser.id).first();
        if (!l) {
          const group = crypto.getRandomValues(new Uint8Array(1))[0] % 2 === 0 ? 'adaptive' : 'random'; // phân nhóm ngẫu nhiên
          await env.DB.prepare('INSERT INTO learner (learner_id, user_id, consent_at, consent_ver, group_code) VALUES (?, ?, ?, ?, ?)')
            .bind(crypto.randomUUID(), authUser.id, new Date().toISOString(), ver, group).run();
        } else if (!l.consent_at) {
          await env.DB.prepare('UPDATE learner SET consent_at = ?, consent_ver = ? WHERE user_id = ?')
            .bind(new Date().toISOString(), ver, authUser.id).run();
        }
        const g = await env.DB.prepare('SELECT group_code FROM learner WHERE user_id = ?').bind(authUser.id).first();
        return respond({ ok: true, consented: true, group_code: g.group_code });
      }
      if (path === '/research/withdraw' && request.method === 'POST') {
        const body = await safeJson(request);
        const l = await env.DB.prepare('SELECT learner_id FROM learner WHERE user_id = ?').bind(authUser.id).first();
        if (l) {
          const ops = [env.DB.prepare('UPDATE learner SET consent_at = NULL WHERE learner_id = ?').bind(l.learner_id)];
          if (body.deleteData === true) ops.push(env.DB.prepare('DELETE FROM attempt WHERE learner_id = ?').bind(l.learner_id));
          await env.DB.batch(ops);
        }
        return respond({ ok: true });
      }
      if (path === '/research/log' && request.method === 'POST') {
        const l = await env.DB.prepare('SELECT learner_id, consent_at FROM learner WHERE user_id = ?').bind(authUser.id).first();
        if (!l || !l.consent_at) return fail('Chưa đồng ý tham gia nghiên cứu.', 403);
        const body = await safeJson(request);
        const list = Array.isArray(body.attempts) ? body.attempts.slice(0, 50) : [];
        const mode = ['khoi_dong', 'vcnv', 'tang_toc', 've_dich', 'xuat_phat'].includes(body.mode) ? body.mode : null;
        if (!mode || !list.length) return fail('Dữ liệu nhật ký không hợp lệ.');
        const round = String(body.round_id || '').slice(0, 64) || null;
        const ops = [];
        for (const a of list) {
          if (!/^[0-9a-f-]{16,40}$/i.test(String(a.id || '')) || !/^[0-9a-f]{16}$/.test(String(a.qid || ''))) continue;
          if (a.correct !== 0 && a.correct !== 1) continue;
          const ts = new Date(a.ts); if (isNaN(ts)) continue;
          ops.push(env.DB.prepare('INSERT OR IGNORE INTO question (qid, mode) VALUES (?, ?)').bind(a.qid, mode));
          ops.push(env.DB.prepare('INSERT OR IGNORE INTO attempt (attempt_id, learner_id, qid, round_id, mode, ts, correct, skipped) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
            .bind(a.id, l.learner_id, a.qid, round, mode, ts.toISOString(), a.correct, a.skipped ? 1 : 0));
        }
        if (ops.length) await env.DB.batch(ops);   // 1 batch = 1 truy vấn theo giới hạn D1
        return respond({ ok: true, saved: ops.length / 2 });
      }
      if (path === '/research/model' && request.method === 'GET') {
        // Độ khó ban đầu: b = ln((1-p)/p), p = (đúng+1)/(lượt+2) (làm mượt Laplace); chỉ câu có >= 5 lượt
        const { results } = await env.DB.prepare(
          `SELECT qid, COUNT(*) AS n, SUM(correct) AS c FROM attempt WHERE skipped = 0 GROUP BY qid HAVING COUNT(*) >= 5`).all();
        const b = {};
        for (const r of (results || [])) { const p = (r.c + 1) / (r.n + 2); b[r.qid] = Math.round(Math.log((1 - p) / p) * 100) / 100; }
        return new Response(JSON.stringify({ b, n_items: Object.keys(b).length }), { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=300', ...corsHeaders } });
      }
      if (path === '/admin/research/export' && request.method === 'GET') {
        if (authUser.role !== 'admin') return fail('Chỉ admin mới dùng được chức năng này.', 403);
        const { results } = await env.DB.prepare(
          `SELECT a.attempt_id, a.learner_id, l.group_code, a.qid, a.round_id, a.mode, a.ts, a.correct, a.skipped
           FROM attempt a JOIN learner l ON l.learner_id = a.learner_id ORDER BY a.ts`).all();
        const head = 'attempt_id,learner_id,group_code,qid,round_id,mode,ts,correct,skipped';
        const csv = [head, ...(results || []).map(r => [r.attempt_id, r.learner_id, r.group_code, r.qid, r.round_id, r.mode, r.ts, r.correct, r.skipped].join(','))].join('\n');
        return new Response(csv, { status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8', ...corsHeaders } });
      }

      // ---------- ADMIN ----------
      if (path.startsWith('/admin/')) {
        if (authUser.role !== 'admin') return fail('Chỉ admin mới dùng được chức năng này.', 403);

        // GET /admin/users
        if (path === '/admin/users' && request.method === 'GET') {
          const { results } = await env.DB.prepare('SELECT * FROM users ORDER BY created_at DESC').all();
          return respond({ users: (results || []).map(publicUser) });
        }

        // POST /admin/users  (tạo tài khoản)
        if (path === '/admin/users' && request.method === 'POST') {
          const body = await safeJson(request);
          const { username, password, full_name, email, phone, school, class: klass, role } = body || {};
          if (!username || !password || !full_name) return fail('Thiếu username / password / full_name.');
          if (password.length < 4) return fail('Mật khẩu cần tối thiểu 4 ký tự.');
          const { hash, salt } = await hashPassword(password);
          try {
            const r = await env.DB.prepare(
              `INSERT INTO users (username, password_hash, password_salt, full_name, email, phone, school, class, role)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).bind(
              username.trim(), hash, salt, full_name.trim(),
              email || null, phone || null, school || null, klass || null,
              role === 'admin' ? 'admin' : 'user'
            ).run();
            const newUser = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(r.meta.last_row_id).first();
            return respond({ ok: true, user: publicUser(newUser) });
          } catch (e) {
            return fail(uniqueErr(e) ? 'Tên đăng nhập đã tồn tại.' : ('Lỗi tạo tài khoản: ' + String(e)), 400);
          }
        }

        // PUT /admin/users/:id (sửa thông tin / đặt lại mật khẩu)
        const editMatch = path.match(/^\/admin\/users\/(\d+)$/);
        if (editMatch && request.method === 'PUT') {
          const id = Number(editMatch[1]);
          const body = await safeJson(request);
          const target = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
          if (!target) return fail('Không tìm thấy tài khoản.', 404);

          const fields = []; const values = [];
          const map = { username: 'username', full_name: 'full_name', email: 'email', phone: 'phone', school: 'school', class: 'class' };
          for (const key in map) {
            if (typeof body[key] === 'string') { fields.push(`${map[key]} = ?`); values.push(body[key].trim() || null); }
          }
          if (body.role === 'admin' || body.role === 'user') { fields.push('role = ?'); values.push(body.role); }

          let bumpVersion = false;
          if (typeof body.newPassword === 'string' && body.newPassword) {
            if (body.newPassword.length < 4) return fail('Mật khẩu mới cần tối thiểu 4 ký tự.');
            const { hash, salt } = await hashPassword(body.newPassword);
            fields.push('password_hash = ?', 'password_salt = ?'); values.push(hash, salt);
            bumpVersion = true;
          }
          if (bumpVersion) fields.push('token_version = token_version + 1');
          if (!fields.length) return respond({ ok: true });

          values.push(id);
          try {
            await env.DB.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
          } catch (e) {
            return fail(uniqueErr(e) ? 'Tên đăng nhập đã tồn tại.' : ('Lỗi cập nhật: ' + String(e)), 400);
          }
          const updated = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
          return respond({ ok: true, user: publicUser(updated) });
        }

        // DELETE /admin/users/:id
        const delMatch = path.match(/^\/admin\/users\/(\d+)$/);
        if (delMatch && request.method === 'DELETE') {
          const id = Number(delMatch[1]);
          if (id === authUser.id) return fail('Không thể tự xoá chính mình.', 400);
          await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
          return respond({ ok: true });
        }
      }

      return fail('Không tìm thấy endpoint.', 404);
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Lỗi server: ' + String(e && e.message || e) }), {
        status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
  },
};

// ============================================================
// HELPERS
// ============================================================
async function safeJson(request) {
  try { return await request.json(); } catch (e) { return {}; }
}

function uniqueErr(e) {
  return String(e && e.message || e).toUpperCase().includes('UNIQUE');
}

function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id, username: u.username, full_name: u.full_name, email: u.email,
    phone: u.phone, school: u.school, class: u.class, avatar: u.avatar,
    role: u.role, created_at: u.created_at,
  };
}

async function getAuthUser(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  const payload = await verifyToken(token, env.JWT_SECRET);
  if (!payload || !payload.uid) return null;
  if (payload.exp && Date.now() > payload.exp) return null;
  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(payload.uid).first();
  if (!user) return null;
  if (user.token_version !== payload.tv) return null; // đã bị "đăng xuất" từ xa (đổi mật khẩu / admin reset)
  return user;
}

// ---- Mật khẩu: PBKDF2-SHA256 100k vòng ----
async function hashPassword(password, saltHex) {
  const enc = new TextEncoder();
  const salt = saltHex ? hexToBytes(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, keyMaterial, 256);
  return { hash: bytesToHex(new Uint8Array(bits)), salt: bytesToHex(salt) };
}
async function verifyPassword(password, hashHex, saltHex) {
  if (!hashHex || !saltHex) return false;
  const { hash } = await hashPassword(password, saltHex);
  return timingSafeEqual(hash, hashHex);
}

// ---- Token: base64(JSON payload) + chữ ký HMAC-SHA256 ----
async function signToken(payloadObj, secret) {
  const payload = b64urlEncode(JSON.stringify(payloadObj));
  const sig = await hmacSign(payload, secret);
  return `${payload}.${sig}`;
}
async function verifyToken(token, secret) {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expected = await hmacSign(payload, secret);
  if (!timingSafeEqual(sig, expected)) return null;
  try { return JSON.parse(b64urlDecode(payload)); } catch (e) { return null; }
}
async function hmacSign(data, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return bytesToHex(new Uint8Array(sig));
}

function b64urlEncode(str) {
  return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return decodeURIComponent(escape(atob(str)));
}
function bytesToHex(bytes) { return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(''); }
function hexToBytes(hex) {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < arr.length; i++) arr[i] = parseInt(hex.substr(i * 2, 2), 16);
  return arr;
}
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
