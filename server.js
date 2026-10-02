// TaskFlow - zero-dependency Node.js server. Run: node server.js
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const PORT = process.env.PORT || 3000;
const DB = path.join(__dirname, 'data', 'db.json');
const hash = (p, s) => crypto.scryptSync(p, s, 32).toString('hex');
function mkUser(username, name, role, pw) {
  const salt = crypto.randomBytes(8).toString('hex');
  return { id: crypto.randomUUID(), username, name, role, salt, hash: hash(pw, salt) };
}
let db;
function save() { fs.mkdirSync(path.dirname(DB), { recursive: true }); fs.writeFileSync(DB, JSON.stringify(db, null, 2)); }
if (fs.existsSync(DB)) db = JSON.parse(fs.readFileSync(DB));
else {
  db = { users: [
    mkUser('head', 'Head of Department', 'head', 'head123'),
    mkUser('admin', 'Admin', 'admin', 'admin123'),
    mkUser('emp1', 'Employee One', 'employee', 'emp123'),
    mkUser('emp2', 'Employee Two', 'employee', 'emp123')], tasks: [], log: [] };
  save();
}
const sessions = new Map();
const send = (res, code, obj, headers = {}) => { res.writeHead(code, { 'Content-Type': 'application/json', ...headers }); res.end(JSON.stringify(obj)); };
const readBody = req => new Promise(r => { let b = ''; req.on('data', c => b += c); req.on('end', () => { try { r(JSON.parse(b || '{}')); } catch { r({}); } }); });
const getUser = req => {
  const m = /sid=([a-f0-9]+)/.exec(req.headers.cookie || '');
  const id = m && sessions.get(m[1]);
  return id ? db.users.find(u => u.id === id) : null;
};
const pub = u => ({ id: u.id, username: u.username, name: u.name, role: u.role });
const log = (u, action) => { db.log.unshift({ time: new Date().toISOString(), actor: u.name, role: u.role, action }); db.log = db.log.slice(0, 200); };
// Hidden fields (internalNote, rating) are stripped for employees on the SERVER.
const view = (t, role) => { if (role !== 'employee') return t; const { internalNote, rating, ...rest } = t; return rest; };
const STATUS = ['todo', 'in-progress', 'done'];

async function api(req, res, url) {
  const u = getUser(req), m = req.method, p = url.pathname;
  if (p === '/api/login' && m === 'POST') {
    const { username, password, role } = await readBody(req);
    const usr = db.users.find(x => x.username === username);
    if (!usr || usr.role !== role || hash(String(password || ''), usr.salt) !== usr.hash)
      return send(res, 401, { error: 'Wrong username, password, or login type.' });
    const sid = crypto.randomBytes(24).toString('hex'); sessions.set(sid, usr.id);
    log(usr, 'Logged in');
    return send(res, 200, pub(usr), { 'Set-Cookie': `sid=${sid}; HttpOnly; SameSite=Strict; Path=/` });
  }
  if (p === '/api/logout' && m === 'POST') {
    const c = /sid=([a-f0-9]+)/.exec(req.headers.cookie || ''); if (c) sessions.delete(c[1]);
    return send(res, 200, { ok: true }, { 'Set-Cookie': 'sid=; Max-Age=0; Path=/' });
  }
  if (!u) return send(res, 401, { error: 'Please log in.' });
  if (p === '/api/me') return send(res, 200, pub(u));
  if (p === '/api/tasks' && m === 'GET') {
    const list = u.role === 'employee' ? db.tasks.filter(t => t.assignedTo === u.id) : db.tasks;
    return send(res, 200, list.map(t => view(t, u.role)));
  }
  if (p === '/api/tasks' && m === 'POST') {
    if (u.role !== 'admin') return send(res, 403, { error: 'Only admin can assign tasks.' });
    const b = await readBody(req);
    if (!b.title || !db.users.find(x => x.id === b.assignedTo && x.role === 'employee')) return send(res, 400, { error: 'Title and an employee are required.' });
    const t = { id: crypto.randomUUID(), title: String(b.title).slice(0, 120), description: String(b.description || '').slice(0, 1000),
      assignedTo: b.assignedTo, priority: ['low', 'medium', 'high'].includes(b.priority) ? b.priority : 'medium', dueDate: b.dueDate || '',
      status: 'todo', createdAt: new Date().toISOString(), internalNote: String(b.internalNote || '').slice(0, 1000), rating: b.rating || '' };
    db.tasks.push(t); log(u, `Assigned "${t.title}" to ${db.users.find(x => x.id === t.assignedTo).name}`); save();
    return send(res, 201, t);
  }
  const tm = /^\/api\/tasks\/([\w-]+)$/.exec(p);
  if (tm) {
    const t = db.tasks.find(x => x.id === tm[1]); if (!t) return send(res, 404, { error: 'Task not found.' });
    if (m === 'PATCH') {
      const b = await readBody(req);
      if (u.role === 'employee') {
        if (t.assignedTo !== u.id) return send(res, 403, { error: 'Not your task.' });
        if (!STATUS.includes(b.status)) return send(res, 400, { error: 'Bad status.' });
        t.status = b.status; log(u, `Marked "${t.title}" as ${t.status}`); save(); return send(res, 200, view(t, u.role));
      }
      if (u.role === 'admin') {
        for (const k of ['title', 'description', 'priority', 'dueDate', 'internalNote', 'rating', 'assignedTo']) if (b[k] !== undefined) t[k] = b[k];
        if (STATUS.includes(b.status)) t.status = b.status;
        log(u, `Updated "${t.title}"`); save(); return send(res, 200, t);
      }
      return send(res, 403, { error: 'Head has read-only access.' });
    }
    if (m === 'DELETE') {
      if (u.role !== 'admin') return send(res, 403, { error: 'Only admin can delete.' });
      db.tasks = db.tasks.filter(x => x !== t); log(u, `Deleted "${t.title}"`); save(); return send(res, 200, { ok: true });
    }
  }
  if (p === '/api/users' && m === 'GET') {
    if (u.role === 'employee') return send(res, 403, { error: 'Forbidden.' });
    return send(res, 200, db.users.filter(x => x.role === 'employee').map(pub));
  }
  if (p === '/api/users' && m === 'POST') {
    if (u.role !== 'admin') return send(res, 403, { error: 'Only admin can add employees.' });
    const { name, username, password } = await readBody(req);
    if (!name || !username || !password || String(password).length < 6) return send(res, 400, { error: 'Name, username and a 6+ character password are required.' });
    if (db.users.some(x => x.username === username)) return send(res, 409, { error: 'Username already taken.' });
    const n = mkUser(username, name, 'employee', String(password)); db.users.push(n); log(u, `Added employee ${name}`); save();
    return send(res, 201, pub(n));
  }
  if (p === '/api/log' && m === 'GET') {
    if (u.role !== 'head') return send(res, 403, { error: 'Head only.' });
    return send(res, 200, db.log);
  }
  send(res, 404, { error: 'Not found.' });
}

const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/')) return api(req, res, url).catch(() => send(res, 500, { error: 'Server error.' }));
  const f = path.join(__dirname, 'public', url.pathname === '/' ? 'index.html' : url.pathname);
  if (!f.startsWith(path.join(__dirname, 'public')) || !fs.existsSync(f)) { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'text/plain' }); fs.createReadStream(f).pipe(res);
}).listen(PORT, () => console.log(`TaskFlow running at http://localhost:${PORT}`));
