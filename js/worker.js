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
//   --- NGHIÊN CỨU ---  GET /research/status | POST /research/consent | POST /research/withdraw | POST /research/log | GET /research/model | GET /research/my-attempts | POST /ai/use | GET /ai/usage | GET|POST /research/test | POST /admin/research/form|config | GET /admin/research/summary|learners|learner|export
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


      // ---------- Route CÔNG KHAI (không cần đăng nhập): xem link chia sẻ + tin tức ----------
      const ytId = u => { const m = String(u || '').match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([A-Za-z0-9_-]{11})/); return m ? m[1] : (/^[A-Za-z0-9_-]{11}$/.test(String(u || '').trim()) ? String(u).trim() : null); };
      const ensureX = async () => {
        await env.DB.prepare('CREATE TABLE IF NOT EXISTS shares (id TEXT PRIMARY KEY, user_id INTEGER, type TEXT, title TEXT, data TEXT, created INTEGER, views INTEGER DEFAULT 0)').run();
        await env.DB.prepare('CREATE TABLE IF NOT EXISTS news_videos (id INTEGER PRIMARY KEY AUTOINCREMENT, program TEXT, yt_id TEXT, title TEXT, created INTEGER)').run();
        await env.DB.prepare('CREATE TABLE IF NOT EXISTS store_items (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, author TEXT, title TEXT, subject TEXT, kind TEXT, url TEXT, description TEXT, rights TEXT, status TEXT DEFAULT \'pending\', note TEXT, created INTEGER)').run();
      };
      const shareMatch = path.match(/^\/share\/([A-Za-z0-9]{6,16})$/);
      if (shareMatch && request.method === 'GET') {
        await ensureX();
        const row = await env.DB.prepare('SELECT id, type, title, data, created FROM shares WHERE id = ?').bind(shareMatch[1]).first();
        if (!row) return fail('Liên kết không tồn tại hoặc đã bị thu hồi.', 404);
        env.DB.prepare('UPDATE shares SET views = views + 1 WHERE id = ?').bind(row.id).run().catch(() => {});
        return respond({ id: row.id, type: row.type, title: row.title, created: row.created, data: JSON.parse(row.data) });
      }
      if (path === '/news' && request.method === 'GET') {
        await ensureX();
        const { results } = await env.DB.prepare('SELECT id, program, yt_id, title, created FROM news_videos ORDER BY created DESC LIMIT 60').all();
        return respond({ videos: results || [] });
      }
      if (path === '/store' && request.method === 'GET') {
        await ensureX();
        const { results } = await env.DB.prepare("SELECT id, author, title, subject, kind, url, description, rights, created FROM store_items WHERE status = 'approved' ORDER BY created DESC LIMIT 200").all();
        return respond({ items: results || [] });
      }

      // ---------- Các route còn lại đều cần đăng nhập ----------
      const authUser = await getAuthUser(request, env);
      if (!authUser) return fail('Chưa đăng nhập hoặc phiên đã hết hạn.', 401);


      // ---------- Chia sẻ & Cửa hàng (người dùng đã đăng nhập) ----------
      if (path === '/share' && request.method === 'POST') {
        await ensureX();
        const body = await safeJson(request);
        const type = String(body.type || '').slice(0, 20), title = String(body.title || 'Chia sẻ').slice(0, 160);
        if (!['summary', 'flash', 'mind', 'tree', 'quiz', 'mcq', 'links', 'doc', 'note'].includes(type)) return fail('Loại nội dung không được chia sẻ.');
        const data = JSON.stringify(body.data == null ? null : body.data);
        if (data.length > 400000) return fail('Nội dung quá lớn để chia sẻ (tối đa ~400 KB).');
        const id = Array.from(crypto.getRandomValues(new Uint8Array(8))).map(b => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');
        await env.DB.prepare('INSERT INTO shares (id, user_id, type, title, data, created) VALUES (?, ?, ?, ?, ?, ?)').bind(id, authUser.id, type, title, data, Date.now()).run();
        return respond({ ok: true, id });
      }
      const unshare = path.match(/^\/share\/([A-Za-z0-9]{6,16})$/);
      if (unshare && request.method === 'DELETE') {
        await ensureX();
        await env.DB.prepare('DELETE FROM shares WHERE id = ? AND (user_id = ? OR ? = 1)').bind(unshare[1], authUser.id, authUser.role === 'admin' ? 1 : 0).run();
        return respond({ ok: true });
      }
      if (path === '/store' && request.method === 'POST') {
        await ensureX();
        const b = await safeJson(request);
        const title = String(b.title || '').trim().slice(0, 160), url = String(b.url || '').trim().slice(0, 500);
        if (!title || !/^https?:\/\//i.test(url)) return fail('Cần có tiêu đề và đường dẫn (https://…) tới tài liệu.');
        if (!b.agree) return fail('Bạn cần xác nhận quyền chia sẻ tài liệu.');
        const kind = ['pdf', 'word', 'excel', 'slide', 'other'].includes(b.kind) ? b.kind : 'other';
        const rights = ['own', 'school', 'cc', 'other'].includes(b.rights) ? b.rights : 'own';
        await env.DB.prepare("INSERT INTO store_items (user_id, author, title, subject, kind, url, description, rights, status, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)")
          .bind(authUser.id, authUser.full_name || authUser.username, title, String(b.subject || '').slice(0, 60), kind, url, String(b.description || '').slice(0, 600), rights, Date.now()).run();
        return respond({ ok: true });
      }
      if (path === '/store/mine' && request.method === 'GET') {
        await ensureX();
        const { results } = await env.DB.prepare('SELECT id, title, subject, kind, url, status, note, created FROM store_items WHERE user_id = ? ORDER BY created DESC LIMIT 50').bind(authUser.id).all();
        return respond({ items: results || [] });
      }


      // ---------- KHO DỮ LIỆU CÁ NHÂN (thư mục/tệp kiểu Drive; tệp nằm ở Cloudflare R2, tải thẳng bằng link ký sẵn) ----------
      if (authUser._ext && !path.startsWith('/vault/')) return fail('Token extension chỉ dùng cho Kho dữ liệu.', 403);
      if (path.startsWith('/vault/')) {
        await ensureVault(env);
        const uid = authUser.id, now = Date.now();
        const r2On = !!(env.VAULT && env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET), kvMode = !r2On && !!env.VAULT_KV;   // không có R2 (cần thẻ) → lưu tệp vào Workers KV (miễn phí, không cần thẻ)
        const quota = (Number(env.VAULT_QUOTA_MB) || (kvMode ? 100 : 1024)) * 1048576, maxFile = (Number(env.VAULT_MAX_FILE_MB) || (kvMode ? 50 : 2048)) * 1048576, KV_CHUNK = 5 * 1048576;
        const kvKey = (n, i) => n.r2_key + '/' + String(i).padStart(3, '0');
        const kvList = async n => { const out = []; let cursor; do { const r = await env.VAULT_KV.list({ prefix: n.r2_key + '/', cursor }); out.push(...r.keys); cursor = r.list_complete ? null : r.cursor; } while (cursor); return out; };
        const nid = () => Array.from(crypto.getRandomValues(new Uint8Array(10))).map(b => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');
        const cleanName = s => String(s || '').replace(/[\\/\u0000-\u001f]/g, ' ').trim().slice(0, 160);
        const own = async id => id ? await env.DB.prepare('SELECT * FROM vault_nodes WHERE id = ? AND user_id = ? AND deleted = 0').bind(String(id), uid).first() : null;
        const checkParent = async p => { if (!p) return null; const n = await own(p); return n && n.kind === 'folder' ? n : false; };
        const used = async () => (await env.DB.prepare("SELECT COALESCE(SUM(size),0) AS s FROM vault_nodes WHERE user_id = ? AND deleted = 0 AND kind = 'file'").bind(uid).first()).s || 0;
        const COLS = 'id, parent_id, kind, name, size, mime, url, meta, created, updated, (CASE WHEN text IS NULL THEN 0 ELSE length(text) END) AS tlen, status';

        if (path === '/vault/ext-token' && request.method === 'POST') {
          if (authUser._ext) return fail('Không tạo được từ token extension.', 403);
          const token = await signToken({ uid, tv: authUser.token_version, exp: now + 365 * 864e5, ext: 1 }, env.JWT_SECRET);
          return respond({ token });
        }
        if (path === '/vault/list' && request.method === 'GET') {
          const parent = url.searchParams.get('parent') || '';
          if (parent && !(await checkParent(parent))) return fail('Không tìm thấy thư mục.', 404);
          const { results } = await env.DB.prepare(`SELECT ${COLS} FROM vault_nodes WHERE user_id = ? AND deleted = 0 AND status = 'ready' AND COALESCE(parent_id,'') = ? ORDER BY (kind = 'folder') DESC, name COLLATE NOCASE LIMIT 1000`).bind(uid, parent).all();
          const crumbs = []; let c = parent;
          for (let i = 0; c && i < 30; i++) { const n = await env.DB.prepare('SELECT id, parent_id, name FROM vault_nodes WHERE id = ? AND user_id = ?').bind(c, uid).first(); if (!n) break; crumbs.unshift({ id: n.id, name: n.name }); c = n.parent_id || ''; }
          return respond({ nodes: results || [], crumbs, used: await used(), quota });
        }
        if (path === '/vault/tree' && request.method === 'GET') {
          const { results } = await env.DB.prepare("SELECT id, parent_id, name FROM vault_nodes WHERE user_id = ? AND deleted = 0 AND kind = 'folder' ORDER BY name COLLATE NOCASE LIMIT 2000").bind(uid).all();
          return respond({ folders: results || [] });
        }
        if (path === '/vault/search' && request.method === 'GET') {
          const q = '%' + String(url.searchParams.get('q') || '').replace(/[%_]/g, '').slice(0, 60) + '%';
          const { results } = await env.DB.prepare(`SELECT ${COLS} FROM vault_nodes WHERE user_id = ? AND deleted = 0 AND status = 'ready' AND (name LIKE ? OR text LIKE ?) ORDER BY updated DESC LIMIT 60`).bind(uid, q, q).all();
          return respond({ nodes: results || [] });
        }
        if (path === '/vault/node' && request.method === 'GET') {
          const n = await own(url.searchParams.get('id')); if (!n) return fail('Không tìm thấy.', 404);
          delete n.r2_key; return respond({ node: n });
        }
        if (path === '/vault/folder' && request.method === 'POST') {
          const b = await safeJson(request); const name = cleanName(b.name); if (!name) return fail('Cần tên thư mục.');
          if ((await checkParent(b.parent)) === false) return fail('Thư mục cha không hợp lệ.');
          const dup = await env.DB.prepare("SELECT id FROM vault_nodes WHERE user_id = ? AND deleted = 0 AND kind = 'folder' AND COALESCE(parent_id,'') = ? AND name = ? COLLATE NOCASE").bind(uid, b.parent || '', name).first();
          if (dup) return respond({ ok: true, id: dup.id, existed: true });
          const id = nid();
          await env.DB.prepare("INSERT INTO vault_nodes (id, user_id, parent_id, kind, name, status, created, updated) VALUES (?, ?, ?, 'folder', ?, 'ready', ?, ?)").bind(id, uid, b.parent || null, name, now, now).run();
          return respond({ ok: true, id });
        }
        // ghi chú / đoạn trích từ extension / liên kết
        if ((path === '/vault/note' || path === '/vault/link') && request.method === 'POST') {
          const b = await safeJson(request); const isLink = path === '/vault/link';
          if ((await checkParent(b.parent)) === false) return fail('Thư mục không hợp lệ.');
          const name = cleanName(b.name) || (isLink ? 'Liên kết' : 'Ghi chú');
          const link = String(b.url || '').trim().slice(0, 1000);
          if (isLink && !/^https?:\/\//i.test(link)) return fail('Liên kết phải bắt đầu bằng http:// hoặc https://');
          const text = b.text == null ? null : String(b.text).slice(0, 200000);
          if (!isLink && !text) return fail('Ghi chú đang trống.');
          const meta = b.meta ? JSON.stringify(b.meta).slice(0, 2000) : null;
          if (b.id) {   // sửa ghi chú
            const n = await own(b.id); if (!n) return fail('Không tìm thấy.', 404);
            await env.DB.prepare('UPDATE vault_nodes SET name = ?, text = ?, url = ?, meta = COALESCE(?, meta), updated = ? WHERE id = ? AND user_id = ?').bind(name, text, isLink ? link : n.url, meta, now, n.id, uid).run();
            return respond({ ok: true, id: n.id });
          }
          const id = nid();
          await env.DB.prepare("INSERT INTO vault_nodes (id, user_id, parent_id, kind, name, text, url, meta, status, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ready', ?, ?)").bind(id, uid, b.parent || null, isLink ? 'link' : 'note', name, text, isLink ? link : (b.url ? String(b.url).slice(0, 1000) : null), meta, now, now).run();
          return respond({ ok: true, id });
        }
        // tải tệp lớn: web xin link ký sẵn → tự PUT thẳng lên R2 (không đi qua Worker), xong gọi upload-done
        if (path === '/vault/upload-init' && request.method === 'POST') {
          if (!r2On && !kvMode) return fail('Chưa cấu hình nơi lưu tệp cho Kho dữ liệu (cần gắn KV tên VAULT_KV hoặc R2).', 501);
          const b = await safeJson(request); const name = cleanName(b.name), size = Math.max(0, Number(b.size) || 0), mime = String(b.mime || '').slice(0, 100);
          if (!name || !size) return fail('Thiếu tên hoặc kích thước tệp.');
          if (/^video\//i.test(mime) || /\.(mp4|mov|avi|mkv|webm|flv|wmv|m4v|mpg|mpeg|3gp)$/i.test(name)) return fail('Kho dữ liệu không nhận video. Hãy dán link YouTube/Drive vào mục Liên kết.');
          if (size > maxFile) return fail('Tệp lớn hơn ' + Math.round(maxFile / 1048576) + ' MB.');
          if ((await used()) + size > quota) return fail('Kho đã gần đầy (' + Math.round(quota / 1048576) + ' MB mỗi người). Hãy xóa bớt tệp cũ.');
          if ((await checkParent(b.parent)) === false) return fail('Thư mục không hợp lệ.');
          const id = nid(), key = (kvMode ? 'kv/' : '') + 'u' + uid + '/' + id;
          await env.DB.prepare("INSERT INTO vault_nodes (id, user_id, parent_id, kind, name, size, mime, r2_key, status, created, updated) VALUES (?, ?, ?, 'file', ?, ?, ?, ?, 'pending', ?, ?)").bind(id, uid, b.parent || null, name, size, mime, key, now, now).run();
          if (kvMode) return respond({ ok: true, id, kv: true, chunk: KV_CHUNK });
          return respond({ ok: true, id, url: await r2Presign(env, 'PUT', key, 3600) });
        }
        if (path === '/vault/kv-put' && request.method === 'PUT') {
          if (!kvMode) return fail('Không dùng KV.', 400);
          const n = await own(url.searchParams.get('id')); const i = parseInt(url.searchParams.get('i'), 10);
          if (!n || n.kind !== 'file' || n.status !== 'pending' || !(i >= 0 && i < 40)) return fail('Yêu cầu không hợp lệ.');
          if ((Number(request.headers.get('content-length')) || 0) > KV_CHUNK + 4096) return fail('Mảnh tải lên quá lớn.');
          const buf = await request.arrayBuffer(); if (!buf.byteLength || buf.byteLength > KV_CHUNK + 4096) return fail('Mảnh tải lên không hợp lệ.');
          await env.VAULT_KV.put(kvKey(n, i), buf, { metadata: { s: buf.byteLength } });
          return respond({ ok: true });
        }
        if (path === '/vault/kv-get' && request.method === 'GET') {
          if (!kvMode) return fail('Không dùng KV.', 400);
          const n = await own(url.searchParams.get('id')); const i = parseInt(url.searchParams.get('i'), 10);
          if (!n || n.kind !== 'file' || !(i >= 0)) return fail('Không tìm thấy.', 404);
          const buf = await env.VAULT_KV.get(kvKey(n, i), { type: 'arrayBuffer' }); if (!buf) return fail('Thiếu mảnh dữ liệu.', 404);
          return new Response(buf, { headers: { ...corsHeaders, 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' } });
        }
        if (path === '/vault/upload-done' && request.method === 'POST' && kvMode) {
          const b = await safeJson(request); const n = await own(b.id); if (!n || n.kind !== 'file') return fail('Không tìm thấy.', 404);
          const ks = await kvList(n), total = ks.reduce((x, k) => x + ((k.metadata && k.metadata.s) || 0), 0);
          if (!ks.length || Math.abs(total - n.size) > 16) { for (const k of ks) await env.VAULT_KV.delete(k.name); await env.DB.prepare('UPDATE vault_nodes SET deleted = 1 WHERE id = ?').bind(n.id).run(); return fail('Tệp chưa tải lên đủ. Hãy thử lại.'); }
          await env.DB.prepare("UPDATE vault_nodes SET status = 'ready', size = ?, updated = ? WHERE id = ?").bind(total, now, n.id).run();
          return respond({ ok: true });
        }
        if (path === '/vault/upload-done' && request.method === 'POST') {
          const b = await safeJson(request); const n = await own(b.id); if (!n || n.kind !== 'file') return fail('Không tìm thấy.', 404);
          const head = await env.VAULT.head(n.r2_key);
          if (!head) { await env.DB.prepare('UPDATE vault_nodes SET deleted = 1 WHERE id = ?').bind(n.id).run(); return fail('Tệp chưa tải lên đủ. Hãy thử lại.'); }
          await env.DB.prepare("UPDATE vault_nodes SET status = 'ready', size = ?, updated = ? WHERE id = ?").bind(head.size, now, n.id).run();
          return respond({ ok: true });
        }
        if (path === '/vault/file' && request.method === 'GET') {
          const n = await own(url.searchParams.get('id')); if (!n || n.kind !== 'file') return fail('Không tìm thấy.', 404);
          const dl = url.searchParams.get('dl') === '1';
          if (String(n.r2_key || '').startsWith('kv/')) { if (!env.VAULT_KV) return fail('Chưa gắn KV.', 501); return respond({ kv: true, chunks: (await kvList(n)).length, name: n.name, mime: n.mime, size: n.size }); }
          const disp = (dl ? 'attachment' : 'inline') + "; filename*=UTF-8''" + encodeURIComponent(n.name);
          return respond({ url: await r2Presign(env, 'GET', n.r2_key, 900, { 'response-content-disposition': disp, ...(n.mime ? { 'response-content-type': n.mime } : {}) }), name: n.name, mime: n.mime, size: n.size });
        }
        if (path === '/vault/rename' && request.method === 'POST') {
          const b = await safeJson(request); const n = await own(b.id); const name = cleanName(b.name); if (!n || !name) return fail('Không hợp lệ.');
          await env.DB.prepare('UPDATE vault_nodes SET name = ?, updated = ? WHERE id = ?').bind(name, now, n.id).run(); return respond({ ok: true });
        }
        if (path === '/vault/move' && request.method === 'POST') {
          const b = await safeJson(request); const n = await own(b.id); if (!n) return fail('Không tìm thấy.', 404);
          const target = b.parent || null; if ((await checkParent(target)) === false) return fail('Thư mục đích không hợp lệ.');
          for (let c = target, i = 0; c && i < 40; i++) { if (c === n.id) return fail('Không thể chuyển thư mục vào chính nó.'); const p = await env.DB.prepare('SELECT parent_id FROM vault_nodes WHERE id = ?').bind(c).first(); c = p && p.parent_id; }
          await env.DB.prepare('UPDATE vault_nodes SET parent_id = ?, updated = ? WHERE id = ?').bind(target, now, n.id).run(); return respond({ ok: true });
        }
        if (path === '/vault/node' && request.method === 'DELETE') {
          const n = await own(url.searchParams.get('id')); if (!n) return fail('Không tìm thấy.', 404);
          const ids = [n.id]; for (let i = 0; i < ids.length && ids.length < 5000; i++) { const { results } = await env.DB.prepare('SELECT id FROM vault_nodes WHERE parent_id = ? AND user_id = ? AND deleted = 0').bind(ids[i], uid).all(); (results || []).forEach(r => ids.push(r.id)); }
          const keys = [];
          for (const id of ids) { const r = await env.DB.prepare('SELECT r2_key FROM vault_nodes WHERE id = ?').bind(id).first(); if (r && r.r2_key && String(r.r2_key).startsWith('kv/')) { try { for (const k of await kvList(r)) await env.VAULT_KV.delete(k.name); } catch (e) {} } else if (r && r.r2_key) keys.push(r.r2_key); await env.DB.prepare('UPDATE vault_nodes SET deleted = 1, text = NULL WHERE id = ?').bind(id).run(); }
          try { if (env.VAULT) for (let i = 0; i < keys.length; i += 900) await env.VAULT.delete(keys.slice(i, i + 900)); } catch (e) {}
          return respond({ ok: true, removed: ids.length });
        }
        return fail('Không có chức năng này.', 404);
      }

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
        const open = { pre: false, post: false }, done = { pre: false, post: false }; let unlock = false;
        try {   // an toàn nếu chưa chạy migration_002
          const cfg = await env.DB.prepare('SELECT k, v FROM research_config').all();
          for (const r of (cfg.results || [])) { if (r.k === 'open_pre') open.pre = r.v === '1'; if (r.k === 'open_post') open.post = r.v === '1'; if (r.k === 'unlock_all') unlock = r.v === '1'; }
          if (l) { const t = await env.DB.prepare('SELECT phase FROM test_result WHERE learner_id = ?').bind(l.learner_id).all(); for (const r of (t.results || [])) done[r.phase] = true; }
        } catch (e) {}
        return respond({ consented: !!(l && l.consent_at), group_code: l ? l.group_code : 'none', test_open: open, test_done: done, unlock });
      }
      if (path === '/research/my-attempts' && request.method === 'GET') {   // lịch sử của chính học sinh (đã đồng ý) để dựng lại hồ sơ môn yếu khi đổi thiết bị
        const l = await env.DB.prepare('SELECT learner_id, consent_at FROM learner WHERE user_id = ?').bind(authUser.id).first();
        if (!l || !l.consent_at) return respond({ rows: [] });
        let res;
        try { res = await env.DB.prepare('SELECT a.qid, q.subject, a.correct, a.ts FROM attempt a LEFT JOIN question q ON q.qid = a.qid WHERE a.learner_id = ? AND a.skipped = 0 ORDER BY a.ts LIMIT 3000').bind(l.learner_id).all(); }
        catch (e) { res = await env.DB.prepare('SELECT qid, NULL AS subject, correct, ts FROM attempt WHERE learner_id = ? AND skipped = 0 ORDER BY ts LIMIT 3000').bind(l.learner_id).all(); }
        return respond({ rows: res.results || [] });
      }
      // ---------- ĐỌC LINK WEB / PHỤ ĐỀ YOUTUBE (cho tab Nghiên cứu) ----------
      if (path === '/yt/transcript' && request.method === 'GET') {
        const id = String(url.searchParams.get('id') || '').trim();
        if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return fail('Mã video không hợp lệ.');
        try {
          const pr = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip', 'Accept-Language': 'vi,en;q=0.8' }, body: JSON.stringify({ context: { client: { clientName: 'ANDROID', clientVersion: '19.09.37', androidSdkVersion: 30, hl: 'vi', gl: 'VN' } }, videoId: id }) });
          const j = await pr.json().catch(() => ({}));
          const vd = j.videoDetails || {}; const title = vd.title || '', channel = vd.author || '', desc = String(vd.shortDescription || '').slice(0, 2500);
          const tracks = (((j.captions || {}).playerCaptionsTracklistRenderer || {}).captionTracks) || [];
          const pick = ['vi', 'en'].map(l => tracks.find(t => t.languageCode === l && t.kind !== 'asr') || tracks.find(t => t.languageCode === l)).find(Boolean) || tracks[0];
          if (!title && !pick) return respond({ ok: false, reason: 'Không lấy được thông tin video (video riêng tư hoặc bị chặn).' });
          let text = '', lang = '', auto = false;
          if (pick) {
            const tr = await fetch(pick.baseUrl.replace(/&fmt=[^&]*/, '') + '&fmt=json3');
            const tj = await tr.json().catch(() => ({}));
            text = (tj.events || []).map(e => (e.segs || []).map(s => s.utf8 || '').join('')).join(' ').replace(/\s+/g, ' ').trim();
            lang = pick.languageCode; auto = pick.kind === 'asr';
          }
          return respond({ ok: text.length > 120, title, channel, desc, lang, auto, text: text.slice(0, 120000), reason: text.length > 120 ? '' : 'Video này không có phụ đề để đọc.' });
        } catch (e) { return respond({ ok: false, reason: 'Không kết nối được YouTube: ' + e.message }); }
      }
      if (path === '/web/read' && request.method === 'POST') {
        const b = await safeJson(request); let target = String(b.url || '').trim();
        if (!/^https?:\/\//i.test(target)) target = 'https://' + target;
        let u; try { u = new URL(target); } catch (e) { return fail('Đường dẫn chưa đúng.'); }
        if (!/^https?:$/.test(u.protocol) || (u.port && !['80', '443'].includes(u.port)) || !u.hostname.includes('.') || /^(localhost|.*\.local|.*\.internal)$/i.test(u.hostname) || /^[\d.]+$/.test(u.hostname) || u.hostname.includes(':')) return fail('Đường dẫn này không được phép đọc.');
        let src = u.href, note = '';
        let m = u.pathname.match(/^\/(document|spreadsheets|presentation)\/d\/([\w-]+)/);
        if (u.hostname === 'docs.google.com' && m) { src = `https://docs.google.com/${m[1]}/d/${m[2]}/export?format=${m[1] === 'spreadsheets' ? 'csv' : 'txt'}`; note = 'Google ' + ({ document: 'Docs', spreadsheets: 'Sheets', presentation: 'Slides' })[m[1]]; }
        m = u.pathname.match(/^\/file\/d\/([\w-]+)/);
        if (u.hostname === 'drive.google.com' && m) { src = 'https://drive.google.com/uc?export=download&id=' + m[1]; note = 'Google Drive'; }
        let res;
        try { res = await fetch(src, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Olym63Reader/1.0)', 'Accept': 'text/html,application/xhtml+xml,text/plain,application/pdf;q=0.9,*/*;q=0.5', 'Accept-Language': 'vi,en;q=0.8' }, cf: { cacheTtl: 300 } }); }
        catch (e) { return fail('Không kết nối được tới trang này.'); }
        if (!res.ok) return fail(`Trang trả về lỗi ${res.status}. Nếu là tài liệu riêng tư, hãy mở quyền “Bất kỳ ai có liên kết” hoặc tải về rồi tải tệp lên.`, 422);
        const ct = (res.headers.get('content-type') || '').toLowerCase();
        const lenH = Number(res.headers.get('content-length') || 0);
        if (lenH > 12 * 1048576) return fail('Tệp quá lớn (tối đa 12 MB). Hãy tải về rồi tải lên Kho dữ liệu.', 413);
        const isBin = /application\/pdf|officedocument|msword/.test(ct) || /\.(pdf|docx)(\?|$)/i.test(u.pathname);
        if (isBin) {
          const buf = new Uint8Array(await res.arrayBuffer());
          if (buf.length > 9 * 1048576) return fail('Tệp quá lớn để đọc qua link (tối đa 9 MB). Hãy tải về rồi tải lên.', 413);
          let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
          const ext = /pdf/.test(ct) || /\.pdf/i.test(u.pathname) ? 'pdf' : 'docx';
          return respond({ ok: true, kind: 'binary', ext, name: decodeURIComponent((u.pathname.split('/').pop() || 'tai-lieu')).slice(0, 80) || ('tai-lieu.' + ext), b64: btoa(bin) });
        }
        const raw = (await res.text()).slice(0, 2500000);
        let title = '', text = raw;
        if (/html|xml/.test(ct) || /^\s*<(!doctype|html)/i.test(raw)) {
          const tm = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i); title = tm ? tm[1] : '';
          let h = raw.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(script|style|noscript|svg|iframe|form|nav|header|footer|aside)[\s\S]*?<\/\1>/gi, ' ');
          const main = h.match(/<(article|main)[\s\S]*<\/\1>/i); if (main && main[0].length > 800) h = main[0];
          text = h.replace(/<\/?(p|div|br|li|tr|h[1-6]|section|blockquote|table|ul|ol)[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' ');
        }
        const ent = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
        const dec = s => s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (x, c) => { if (c[0] === '#') { const n = c[1].toLowerCase() === 'x' ? parseInt(c.slice(2), 16) : parseInt(c.slice(1), 10); try { return String.fromCodePoint(n); } catch (e) { return ' '; } } return ent[c.toLowerCase()] != null ? ent[c.toLowerCase()] : ' '; });
        text = dec(text).replace(/[ \t ]+/g, ' ').replace(/\n\s*\n\s*\n+/g, '\n\n').split('\n').map(s => s.trim()).filter((s, i, a) => s || (a[i - 1])).join('\n').trim();
        title = dec(title).replace(/\s+/g, ' ').trim().slice(0, 160);
        if (text.length < 80) return fail('Trang này gần như không có chữ đọc được (có thể cần đăng nhập hoặc dựng bằng JavaScript). Hãy sao chép nội dung vào mục “Dán văn bản”.', 422);
        return respond({ ok: true, kind: 'text', title: title || u.hostname, site: u.hostname, note, text: text.slice(0, 150000) });
      }

      // ---------- QUẢN LÝ API KEY GEMINI + THỐNG KÊ CHI PHÍ (chỉ admin) ----------
      if (path.startsWith('/admin/ai/')) {
        if (authUser.role !== 'admin') return fail('Chỉ admin mới dùng được chức năng này.', 403);
        await env.DB.prepare('CREATE TABLE IF NOT EXISTS ai_keys (id INTEGER PRIMARY KEY AUTOINCREMENT, label TEXT, api_key TEXT NOT NULL, active INTEGER DEFAULT 1, created INTEGER, last_used INTEGER DEFAULT 0, cooldown_until INTEGER DEFAULT 0, fail_count INTEGER DEFAULT 0, last_error TEXT, calls INTEGER DEFAULT 0, in_tok INTEGER DEFAULT 0, out_tok INTEGER DEFAULT 0)').run();
        await env.DB.prepare('CREATE TABLE IF NOT EXISTS ai_log (day TEXT NOT NULL, model TEXT NOT NULL, key_id INTEGER NOT NULL, calls INTEGER DEFAULT 0, in_tok INTEGER DEFAULT 0, out_tok INTEGER DEFAULT 0, errors INTEGER DEFAULT 0, PRIMARY KEY (day, model, key_id))').run();
        const mask = k => k.length > 12 ? k.slice(0, 6) + '…' + k.slice(-4) : '••••';
        if (path === '/admin/ai/keys' && request.method === 'GET') {
          const { results } = await env.DB.prepare('SELECT id, label, api_key, active, created, last_used, cooldown_until, fail_count, last_error, calls, in_tok, out_tok FROM ai_keys ORDER BY id').all();
          const day = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
          const { results: today } = await env.DB.prepare('SELECT key_id, SUM(calls) c, SUM(errors) e FROM ai_log WHERE day = ? GROUP BY key_id').bind(day).all();
          const tm = {}; (today || []).forEach(r => { tm[r.key_id] = r; });
          return respond({ keys: (results || []).map(r => ({ id: r.id, label: r.label, key: mask(r.api_key), active: !!r.active, created: r.created, last_used: r.last_used, cooling: r.cooldown_until > Date.now(), cooldown_until: r.cooldown_until, fail_count: r.fail_count, last_error: r.last_error, calls: r.calls, in_tok: r.in_tok, out_tok: r.out_tok, today_calls: (tm[r.id] || {}).c || 0, today_errors: (tm[r.id] || {}).e || 0 })), env_keys: ['GEMINI_API_KEY', 'GEMINI_API_KEY_2'].filter(n => env[n]).length });
        }
        if (path === '/admin/ai/keys' && request.method === 'POST') {
          const b = await safeJson(request); const key = String(b.key || '').trim();
          if (!/^AIza[\w-]{30,60}$/.test(key)) return fail('API key chưa đúng định dạng (bắt đầu bằng AIza…).');
          const dup = await env.DB.prepare('SELECT id FROM ai_keys WHERE api_key = ?').bind(key).first(); if (dup) return fail('Key này đã có trong danh sách.');
          await env.DB.prepare('INSERT INTO ai_keys (label, api_key, active, created) VALUES (?, ?, 1, ?)').bind(String(b.label || 'Key mới').slice(0, 60), key, Date.now()).run();
          return respond({ ok: true });
        }
        const km = path.match(/^\/admin\/ai\/keys\/(\d+)$/);
        if (km && request.method === 'PUT') {
          const b = await safeJson(request); const id = Number(km[1]);
          if (b.label != null) await env.DB.prepare('UPDATE ai_keys SET label = ? WHERE id = ?').bind(String(b.label).slice(0, 60), id).run();
          if (b.active != null) await env.DB.prepare('UPDATE ai_keys SET active = ?, cooldown_until = 0, fail_count = 0 WHERE id = ?').bind(b.active ? 1 : 0, id).run();
          if (b.key) { const key = String(b.key).trim(); if (!/^AIza[\w-]{30,60}$/.test(key)) return fail('API key chưa đúng định dạng.'); await env.DB.prepare('UPDATE ai_keys SET api_key = ?, cooldown_until = 0, fail_count = 0, last_error = NULL WHERE id = ?').bind(key, id).run(); }
          return respond({ ok: true });
        }
        if (km && request.method === 'DELETE') { await env.DB.prepare('DELETE FROM ai_keys WHERE id = ?').bind(Number(km[1])).run(); return respond({ ok: true }); }
        const tm2 = path.match(/^\/admin\/ai\/keys\/(\d+)\/test$/);
        if (tm2 && request.method === 'POST') {
          const r = await env.DB.prepare('SELECT api_key FROM ai_keys WHERE id = ?').bind(Number(tm2[1])).first(); if (!r) return fail('Không thấy key.', 404);
          const t0 = Date.now();
          const gr = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(String(env.TEST_MODEL || 'gemini-2.5-flash-lite')) + ':generateContent', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': r.api_key }, body: JSON.stringify({ contents: [{ parts: [{ text: 'Trả lời đúng một chữ: OK' }] }], generationConfig: { maxOutputTokens: 8 } }) });
          const gj = await gr.json().catch(() => ({}));
          if (gr.ok) { await env.DB.prepare('UPDATE ai_keys SET cooldown_until = 0, fail_count = 0, last_error = NULL WHERE id = ?').bind(Number(tm2[1])).run(); return respond({ ok: true, ms: Date.now() - t0 }); }
          return respond({ ok: false, status: gr.status, error: (gj.error && gj.error.message) || 'Lỗi không rõ' });
        }
        if (path === '/admin/ai/usage' && request.method === 'GET') {
          const days = Math.max(1, Math.min(90, parseInt(url.searchParams.get('days'), 10) || 30));
          const since = new Date(Date.now() + 7 * 3600e3 - days * 86400e3).toISOString().slice(0, 10);
          const { results: byDay } = await env.DB.prepare('SELECT day, model, SUM(calls) calls, SUM(in_tok) in_tok, SUM(out_tok) out_tok, SUM(errors) errors FROM ai_log WHERE day >= ? GROUP BY day, model ORDER BY day').bind(since).all();
          let users = []; try { const r = await env.DB.prepare("SELECT u.username, u.full_name, SUM(a.units) units FROM ai_usage a JOIN users u ON u.id = a.user_id WHERE a.day >= ? GROUP BY a.user_id ORDER BY units DESC LIMIT 20").bind(since).all(); users = r.results || []; } catch (e) {}
          let limit = 60, prices = null;
          try { const c = await env.DB.prepare("SELECT v FROM research_config WHERE k = 'ai_daily_limit'").first(); if (c && Number(c.v) > 0) limit = Number(c.v); } catch (e) {}
          try { const c = await env.DB.prepare("SELECT v FROM research_config WHERE k = 'ai_prices'").first(); if (c) prices = JSON.parse(c.v); } catch (e) {}
          return respond({ days, by_day: byDay || [], users, limit, prices });
        }
        if (path === '/admin/ai/settings' && request.method === 'POST') {
          const b = await safeJson(request);
          await env.DB.prepare('CREATE TABLE IF NOT EXISTS research_config (k TEXT PRIMARY KEY, v TEXT)').run();
          if (b.limit != null) { const n = Math.max(5, Math.min(1000, parseInt(b.limit, 10) || 60)); await env.DB.prepare("INSERT INTO research_config (k, v) VALUES ('ai_daily_limit', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(String(n)).run(); }
          if (b.prices && typeof b.prices === 'object') await env.DB.prepare("INSERT INTO research_config (k, v) VALUES ('ai_prices', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(JSON.stringify(b.prices).slice(0, 4000)).run();
          return respond({ ok: true });
        }
        return fail('Không có chức năng này.', 404);
      }

      // ---------- HẠN MỨC LƯỢT AI MỖI NGÀY (mềm: web gọi trước khi dùng Gemini) ----------
      if (path === '/ai/use' || path === '/ai/usage') {
        const day = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
        await env.DB.prepare('CREATE TABLE IF NOT EXISTS ai_usage (user_id INTEGER NOT NULL, day TEXT NOT NULL, units INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, day))').run();
        let limit = 60;
        try { const c = await env.DB.prepare("SELECT v FROM research_config WHERE k = 'ai_daily_limit'").first(); if (c && Number(c.v) > 0) limit = Number(c.v); } catch (e) {}
        const row = await env.DB.prepare('SELECT units FROM ai_usage WHERE user_id = ? AND day = ?').bind(authUser.id, day).first();
        let used = row ? row.units : 0;
        if (path === '/ai/usage') return respond({ used, limit, day });
        const body = await safeJson(request); const units = Math.max(1, Math.min(10, parseInt(body.units, 10) || 1));
        if (used + units > limit) return respond({ ok: false, used, limit, day });
        await env.DB.prepare('INSERT INTO ai_usage (user_id, day, units) VALUES (?, ?, ?) ON CONFLICT(user_id, day) DO UPDATE SET units = units + excluded.units').bind(authUser.id, day, units).run();
        return respond({ ok: true, used: used + units, limit, day });
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
          if (body.deleteData === true) { try { await env.DB.prepare('DELETE FROM test_result WHERE learner_id = ?').bind(l.learner_id).run(); } catch (e) {} }
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
        const build = (withSubject) => {
          const ops = [];
          for (const a of list) {
            if (!/^[0-9a-f-]{16,40}$/i.test(String(a.id || '')) || !/^[0-9a-f]{16}$/.test(String(a.qid || ''))) continue;
            if (a.correct !== 0 && a.correct !== 1) continue;
            const ts = new Date(a.ts); if (isNaN(ts)) continue;
            ops.push(env.DB.prepare('INSERT OR IGNORE INTO question (qid, mode) VALUES (?, ?)').bind(a.qid, mode));
            if (withSubject && typeof a.subject === 'string' && a.subject.trim())
              ops.push(env.DB.prepare('UPDATE question SET subject = ? WHERE qid = ? AND subject IS NULL').bind(a.subject.trim().slice(0, 40), a.qid));
            ops.push(env.DB.prepare('INSERT OR IGNORE INTO attempt (attempt_id, learner_id, qid, round_id, mode, ts, correct, skipped) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
              .bind(a.id, l.learner_id, a.qid, round, mode, ts.toISOString(), a.correct, a.skipped ? 1 : 0));
          }
          return ops;
        };
        let ops = build(true);
        if (ops.length) {
          try { await env.DB.batch(ops); }                          // 1 batch = 1 truy vấn theo giới hạn D1
          catch (e) {                                               // chưa chạy migration_003 (thiếu cột subject) → ghi như cũ
            if (!/no such column/i.test(String(e && e.message || e))) throw e;
            ops = build(false); await env.DB.batch(ops);
          }
        }
        return respond({ ok: true, saved: ops.length });
      }
      if (path === '/research/model' && request.method === 'GET') {
        // Độ khó ban đầu: b = ln((1-p)/p), p = (đúng+1)/(lượt+2) (làm mượt Laplace); chỉ câu có >= 5 lượt
        const { results } = await env.DB.prepare(
          `SELECT qid, COUNT(*) AS n, SUM(correct) AS c FROM attempt WHERE skipped = 0 GROUP BY qid HAVING COUNT(*) >= 5`).all();
        const b = {};
        for (const r of (results || [])) { const p = (r.c + 1) / (r.n + 2); b[r.qid] = Math.round(Math.log((1 - p) / p) * 100) / 100; }
        return new Response(JSON.stringify({ b, n_items: Object.keys(b).length }), { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=300', ...corsHeaders } });
      }
      // ---------- BÀI KIỂM TRA TRƯỚC / SAU ----------
      // Đề A/B đối trọng: học sinh có mã học sinh chẵn làm A trước, B sau; lẻ thì ngược lại
      const formFor = (learnerId, phase) => {
        const even = parseInt(String(learnerId).charAt(0), 16) % 2 === 0;
        return (phase === 'pre') === even ? 'A' : 'B';
      };
      if (path === '/research/test' && request.method === 'GET') {
        const phase = url.searchParams.get('phase');
        if (phase !== 'pre' && phase !== 'post') return fail('phase không hợp lệ.');
        const l = await env.DB.prepare('SELECT learner_id, consent_at FROM learner WHERE user_id = ?').bind(authUser.id).first();
        if (!l || !l.consent_at) return fail('Chưa đồng ý tham gia nghiên cứu.', 403);
        const cfg = await env.DB.prepare('SELECT v FROM research_config WHERE k = ?').bind('open_' + phase).first();
        if (!cfg || cfg.v !== '1') return fail('Bài kiểm tra này chưa được mở.', 403);
        const done = await env.DB.prepare('SELECT 1 AS x FROM test_result WHERE learner_id = ? AND phase = ?').bind(l.learner_id, phase).first();
        if (done) return fail('Bạn đã làm bài kiểm tra này rồi.', 409);
        const form_id = formFor(l.learner_id, phase);
        const { results } = await env.DB.prepare('SELECT qid FROM test_form WHERE form_id = ? ORDER BY position').bind(form_id).all();
        if (!results || !results.length) return fail('Đề kiểm tra chưa được tạo.', 404);
        return respond({ form_id, qids: results.map(r => r.qid) });
      }
      if (path === '/research/test' && request.method === 'POST') {
        const body = await safeJson(request);
        const phase = body.phase;
        if (phase !== 'pre' && phase !== 'post') return fail('phase không hợp lệ.');
        const l = await env.DB.prepare('SELECT learner_id, consent_at FROM learner WHERE user_id = ?').bind(authUser.id).first();
        if (!l || !l.consent_at) return fail('Chưa đồng ý tham gia nghiên cứu.', 403);
        const form_id = formFor(l.learner_id, phase);
        const { results } = await env.DB.prepare('SELECT qid FROM test_form WHERE form_id = ?').bind(form_id).all();
        const valid = new Set((results || []).map(r => r.qid));
        const items = Array.isArray(body.items) ? body.items : [];
        if (!valid.size || items.length !== valid.size) return fail('Bài làm không khớp với đề.');
        const seen = new Set(); let correct = 0;
        for (const it of items) {
          if (!valid.has(it.qid) || seen.has(it.qid) || (it.correct !== 0 && it.correct !== 1)) return fail('Bài làm không hợp lệ.');
          seen.add(it.qid); correct += it.correct;
        }
        await env.DB.prepare('INSERT OR IGNORE INTO test_result (learner_id, phase, form_id, ts, n_items, n_correct, items_json) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .bind(l.learner_id, phase, form_id, new Date().toISOString(), items.length, correct, JSON.stringify(items.map(i => [i.qid, i.correct]))).run();
        return respond({ ok: true });
      }
      if (path === '/admin/research/form' && request.method === 'POST') {
        if (authUser.role !== 'admin') return fail('Chỉ admin mới dùng được chức năng này.', 403);
        const body = await safeJson(request);
        const ok = a => Array.isArray(a) && a.length >= 5 && a.length <= 60 && a.every(q => /^[0-9a-f]{16}$/.test(String(q)));
        if (!ok(body.A) || !ok(body.B)) return fail('Đề A/B không hợp lệ (5–60 mã câu hỏi mỗi đề).');
        if (body.A.some(q => body.B.includes(q))) return fail('Đề A và B không được trùng câu.');
        const done = await env.DB.prepare('SELECT COUNT(*) AS c FROM test_result').first();
        if (done && done.c > 0) return fail('Đã có học sinh làm bài kiểm tra, không thể đổi đề.', 409);
        const ops = [env.DB.prepare('DELETE FROM test_form')];
        body.A.forEach((q, i) => ops.push(env.DB.prepare('INSERT INTO test_form (form_id, qid, position) VALUES (?, ?, ?)').bind('A', q, i)));
        body.B.forEach((q, i) => ops.push(env.DB.prepare('INSERT INTO test_form (form_id, qid, position) VALUES (?, ?, ?)').bind('B', q, i)));
        await env.DB.batch(ops);
        return respond({ ok: true, A: body.A.length, B: body.B.length });
      }
      if (path === '/admin/research/config' && request.method === 'POST') {
        if (authUser.role !== 'admin') return fail('Chỉ admin mới dùng được chức năng này.', 403);
        const body = await safeJson(request);
        const ops = [];
        for (const k of ['open_pre', 'open_post', 'unlock_all']) if (k in body) ops.push(env.DB.prepare('INSERT INTO research_config (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind(k, body[k] ? '1' : '0'));
        if ('ai_daily_limit' in body) { const n = Math.max(1, Math.min(1000, parseInt(body.ai_daily_limit, 10) || 60)); ops.push(env.DB.prepare('INSERT INTO research_config (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind('ai_daily_limit', String(n))); }
        if (ops.length) await env.DB.batch(ops);
        return respond({ ok: true });
      }
      if (path === '/admin/research/summary' && request.method === 'GET') {
        if (authUser.role !== 'admin') return fail('Chỉ admin mới dùng được chức năng này.', 403);
        const q = async (sql) => (await env.DB.prepare(sql).all()).results || [];
        const out = {
          learners: await q(`SELECT group_code, COUNT(*) AS n FROM learner WHERE consent_at IS NOT NULL GROUP BY group_code`),
          practice: await q(`SELECT l.group_code, COUNT(DISTINCT a.learner_id) AS learners, COUNT(*) AS attempts, ROUND(AVG(a.correct), 3) AS accuracy FROM attempt a JOIN learner l ON l.learner_id = a.learner_id WHERE a.skipped = 0 GROUP BY l.group_code`),
          per_day: await q(`SELECT substr(ts, 1, 10) AS day, COUNT(*) AS attempts FROM attempt GROUP BY day ORDER BY day DESC LIMIT 14`),
        };
        try {
          out.tests = await q(`SELECT l.group_code, r.phase, COUNT(*) AS n, ROUND(AVG(1.0 * r.n_correct / r.n_items), 3) AS mean_score FROM test_result r JOIN learner l ON l.learner_id = r.learner_id GROUP BY l.group_code, r.phase`);
          out.forms = await q(`SELECT form_id, COUNT(*) AS n_items FROM test_form GROUP BY form_id`);
          const cfg = await q(`SELECT k, v FROM research_config`); out.config = Object.fromEntries(cfg.map(r => [r.k, r.v]));
        } catch (e) { out.tests_note = 'Chưa chạy migration_002_tests.sql'; }
        return respond(out);
      }
      if (path === '/admin/research/learners' && request.method === 'GET') {
        if (authUser.role !== 'admin') return fail('Chỉ admin mới dùng được chức năng này.', 403);
        const { results } = await env.DB.prepare(
          `SELECT l.learner_id, l.group_code, l.consent_at, u.full_name, u.school, u.class,
                  COUNT(a.attempt_id) AS n, ROUND(AVG(a.correct), 3) AS acc, MAX(a.ts) AS last_ts
           FROM learner l JOIN users u ON u.id = l.user_id
           LEFT JOIN attempt a ON a.learner_id = l.learner_id AND a.skipped = 0
           WHERE l.consent_at IS NOT NULL GROUP BY l.learner_id ORDER BY last_ts DESC`).all();
        let tests = [];
        try { tests = (await env.DB.prepare('SELECT learner_id, phase, form_id, n_correct, n_items FROM test_result').all()).results || []; } catch (e) {}
        return respond({ learners: results || [], tests });
      }
      if (path === '/admin/research/learner' && request.method === 'GET') {
        if (authUser.role !== 'admin') return fail('Chỉ admin mới dùng được chức năng này.', 403);
        const id = String(url.searchParams.get('id') || '');
        if (!/^[0-9a-f-]{36}$/i.test(id)) return fail('Mã học sinh không hợp lệ.');
        let rows;
        try {
          rows = (await env.DB.prepare(`SELECT a.ts, a.qid, a.mode, a.correct, q.subject FROM attempt a LEFT JOIN question q ON q.qid = a.qid
            WHERE a.learner_id = ? AND a.skipped = 0 ORDER BY a.ts LIMIT 5000`).bind(id).all()).results;
        } catch (e) {   // chưa có cột subject
          rows = (await env.DB.prepare(`SELECT ts, qid, mode, correct FROM attempt WHERE learner_id = ? AND skipped = 0 ORDER BY ts LIMIT 5000`).bind(id).all()).results;
        }
        return respond({ attempts: rows || [] });
      }
      if (path === '/admin/research/export' && request.method === 'GET') {
        if (authUser.role !== 'admin') return fail('Chỉ admin mới dùng được chức năng này.', 403);
        if (url.searchParams.get('table') === 'test') {
          const t = await env.DB.prepare(
            `SELECT r.learner_id, l.group_code, r.phase, r.form_id, r.n_items, r.n_correct, r.ts FROM test_result r JOIN learner l ON l.learner_id = r.learner_id ORDER BY r.ts`).all();
          const csvT = ['learner_id,group_code,phase,form_id,n_items,n_correct,ts', ...(t.results || []).map(r => [r.learner_id, r.group_code, r.phase, r.form_id, r.n_items, r.n_correct, r.ts].join(','))].join('\n');
          return new Response(csvT, { status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8', ...corsHeaders } });
        }
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


        // ----- Tin tức: video YouTube mới nhất của các chương trình -----
        if (path === '/admin/news' && request.method === 'POST') {
          await ensureX();
          const b = await safeJson(request); const id = ytId(b.url);
          if (!id) return fail('Không nhận ra đường dẫn YouTube. Hãy dán link dạng https://www.youtube.com/watch?v=…');
          const program = ['olympia', 'ddvq', 'trieuphu', 'vuatv', 'khac'].includes(b.program) ? b.program : 'olympia';
          await env.DB.prepare('INSERT INTO news_videos (program, yt_id, title, created) VALUES (?, ?, ?, ?)').bind(program, id, String(b.title || '').slice(0, 200) || 'Video mới', Date.now()).run();
          return respond({ ok: true });
        }
        const delNews = path.match(/^\/admin\/news\/(\d+)$/);
        if (delNews && request.method === 'DELETE') { await ensureX(); await env.DB.prepare('DELETE FROM news_videos WHERE id = ?').bind(Number(delNews[1])).run(); return respond({ ok: true }); }

        // ----- Cửa hàng: duyệt tài liệu -----
        if (path === '/admin/store' && request.method === 'GET') {
          await ensureX();
          const st = ['pending', 'approved', 'rejected'].includes(url.searchParams.get('status')) ? url.searchParams.get('status') : 'pending';
          const { results } = await env.DB.prepare('SELECT * FROM store_items WHERE status = ? ORDER BY created DESC LIMIT 200').bind(st).all();
          const cnt = await env.DB.prepare("SELECT status, COUNT(*) AS n FROM store_items GROUP BY status").all();
          return respond({ items: results || [], counts: Object.fromEntries((cnt.results || []).map(r => [r.status, r.n])) });
        }
        const stMatch = path.match(/^\/admin\/store\/(\d+)$/);
        if (stMatch && request.method === 'POST') {
          await ensureX(); const b = await safeJson(request);
          const st = ['approved', 'rejected', 'pending'].includes(b.status) ? b.status : null; if (!st) return fail('Trạng thái không hợp lệ.');
          await env.DB.prepare('UPDATE store_items SET status = ?, note = ? WHERE id = ?').bind(st, String(b.note || '').slice(0, 300), Number(stMatch[1])).run();
          return respond({ ok: true });
        }
        if (stMatch && request.method === 'DELETE') { await ensureX(); await env.DB.prepare('DELETE FROM store_items WHERE id = ?').bind(Number(stMatch[1])).run(); return respond({ ok: true }); }

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


// ---- Kho dữ liệu: bảng + link ký sẵn R2 (AWS SigV4, chỉ ký host) ----
let _vaultReady = false;
async function ensureVault(env) {
  if (_vaultReady) return;
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS vault_nodes (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, parent_id TEXT, kind TEXT NOT NULL, name TEXT NOT NULL, size INTEGER NOT NULL DEFAULT 0, mime TEXT, r2_key TEXT, url TEXT, text TEXT, meta TEXT, status TEXT NOT NULL DEFAULT \'ready\', deleted INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL, updated INTEGER NOT NULL)').run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_vault_user_parent ON vault_nodes (user_id, parent_id, deleted)').run();
  _vaultReady = true;
}
const _enc = new TextEncoder();
async function _hmac(key, data) {
  const k = await crypto.subtle.importKey('raw', typeof key === 'string' ? _enc.encode(key) : key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, _enc.encode(data)));
}
const _rfc = s => encodeURIComponent(s).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
async function r2Presign(env, method, key, expires, extra) {
  const host = env.R2_ACCOUNT_ID + '.r2.cloudflarestorage.com';
  const amz = new Date().toISOString().replace(/[:-]|\.\d{3}/g, ''), date = amz.slice(0, 8), scope = date + '/auto/s3/aws4_request';
  const q = Object.assign({ 'X-Amz-Algorithm': 'AWS4-HMAC-SHA256', 'X-Amz-Credential': env.R2_ACCESS_KEY_ID + '/' + scope, 'X-Amz-Date': amz, 'X-Amz-Expires': String(expires), 'X-Amz-SignedHeaders': 'host' }, extra || {});
  const qs = Object.keys(q).sort().map(k => _rfc(k) + '=' + _rfc(q[k])).join('&');
  const uri = '/' + env.R2_BUCKET + '/' + key.split('/').map(_rfc).join('/');
  const canon = [method, uri, qs, 'host:' + host + '\n', 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const hash = bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256', _enc.encode(canon))));
  const sts = ['AWS4-HMAC-SHA256', amz, scope, hash].join('\n');
  let k = await _hmac('AWS4' + env.R2_SECRET_ACCESS_KEY, date); k = await _hmac(k, 'auto'); k = await _hmac(k, 's3'); k = await _hmac(k, 'aws4_request');
  return 'https://' + host + uri + '?' + qs + '&X-Amz-Signature=' + bytesToHex(await _hmac(k, sts));
}

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
  user._ext = !!payload.ext;
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
