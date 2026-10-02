const $ = s => document.querySelector(s), app = $('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
async function call(url, method = 'GET', body) {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Something went wrong.'); return d;
}
let me, users = [], tasks = [];
const name = id => (users.find(u => u.id === id) || {}).name || (me?.id === id ? me.name : 'Unknown');
const overdue = t => t.dueDate && t.status !== 'done' && new Date(t.dueDate) < new Date(new Date().toDateString());
const statusLabel = s => ({ todo:'To do', 'in-progress':'In progress', done:'Completed' }[s] || s);
const priorityLabel = p => ({ low:'Low', medium:'Medium', high:'High' }[p] || p);

function loginView(role = 'employee') {
  const labels = { employee: 'Employee', admin: 'Admin', head: 'Head' };
  app.innerHTML = `<div class="login-page">
    <div class="login-brand"><div class="brand-mark">TF</div><div><b>TaskFlow</b><span>Work management</span></div></div>
    <div class="login-card">
      <div class="login-heading"><span class="eyebrow">WELCOME BACK</span><h1>Sign in to TaskFlow</h1><p>Manage work, assignments and progress from one place.</p></div>
      <div class="tabs">${Object.entries(labels).map(([k, v]) => `<button class="${k === role ? 'on' : ''}" data-r="${k}">${v}</button>`).join('')}</div>
      <form id="loginForm">
        <label>Username<input id="u" autocomplete="username" placeholder="Enter username" required></label>
        <label>Password<div class="password-wrap"><input id="p" type="password" autocomplete="current-password" placeholder="Enter password" required><button type="button" class="password-toggle" id="togglePw">Show</button></div></label>
        <div class="err" id="e"></div>
        <button id="go" class="primary wide" type="submit">Sign in as ${labels[role]}</button>
      </form>
      <div class="demo"><b>Demo access</b><div>Employee <code>emp1 / emp123</code> · Admin <code>admin / admin123</code> · Head <code>head / head123</code></div></div>
    </div>
    <div class="login-footer">Secure role-based workspace · TaskFlow</div>
  </div>`;
  document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => loginView(b.dataset.r));
  $('#togglePw').onclick = () => { const p = $('#p'); const show = p.type === 'password'; p.type = show ? 'text' : 'password'; $('#togglePw').textContent = show ? 'Hide' : 'Show'; };
  $('#loginForm').onsubmit = async e => { e.preventDefault(); try { $('#go').disabled = true; me = await call('/api/login', 'POST', { username: $('#u').value.trim(), password: $('#p').value, role }); await boot(); } catch (e) { $('#e').textContent = e.message; $('#go').disabled = false; } };
  $('#u').focus();
}
async function refresh() {
  tasks = await call('/api/tasks'); if (me.role !== 'employee') users = await call('/api/users');
}
async function boot() { await refresh(); render(); }
function shell(inner, subtitle = '') {
  const initials = esc((me.name || 'U').split(' ').map(x => x[0]).slice(0,2).join('').toUpperCase());
  app.innerHTML = `<header class="topbar"><div class="brand"><div class="brand-mark small">TF</div><div><b>TaskFlow</b><span>Work management</span></div></div><div class="top-actions"><div class="user-chip"><span class="avatar">${initials}</span><span><b>${esc(me.name)}</b><small>${esc(me.role)}</small></span></div><button id="out" class="logout">Log out</button></div></header><main class="dashboard"><div class="page-title"><div><span class="eyebrow">${esc(me.role.toUpperCase())} WORKSPACE</span><h1>${subtitle || `Good to see you, ${esc(me.name.split(' ')[0])}`}</h1><p>${me.role === 'employee' ? 'Track your assigned work and keep your progress up to date.' : me.role === 'admin' ? 'Assign work, manage employees and monitor delivery.' : 'Monitor workload, completion and team activity.'}</p></div></div>${inner}</main>`;
  $('#out').onclick = async () => { await call('/api/logout', 'POST'); loginView(me.role); };
}
function statCard(label, value, note, icon) { return `<div class="stat-card"><div class="stat-icon">${icon}</div><div><span>${label}</span><strong>${value}</strong><small>${note}</small></div></div>`; }
function taskCard(t, mode) {
  const secret = (mode !== 'employee' && (t.internalNote || t.rating)) ? `<div class="secret"><b>Confidential</b>${t.rating ? `<span>Rating: ${esc(t.rating)}</span>` : ''}${t.internalNote ? `<p>${esc(t.internalNote)}</p>` : ''}</div>` : '';
  const stSel = `<select class="status-select" data-st="${t.id}" ${mode === 'head' ? 'disabled' : ''}>${['todo', 'in-progress', 'done'].map(s => `<option value="${s}" ${s === t.status ? 'selected' : ''}>${statusLabel(s)}</option>`).join('')}</select>`;
  return `<article class="task-card ${t.priority} ${t.status === 'done' ? 'is-done' : ''}"><div class="task-main"><div class="task-top"><div><h3>${esc(t.title)}</h3><p>${esc(t.description || 'No description provided.')}</p></div><span class="priority ${t.priority}">${priorityLabel(t.priority)}</span></div><div class="task-meta"><span>${mode !== 'employee' ? '👤 ' + esc(name(t.assignedTo)) : '📌 Assigned task'}</span>${t.dueDate ? `<span>📅 ${esc(t.dueDate)}</span>` : ''}${overdue(t) ? '<span class="overdue">Overdue</span>' : ''}</div></div>${secret}<div class="task-actions">${stSel}${mode === 'admin' ? `<button class="ghost" data-edit="${t.id}">Edit details</button><button class="danger" data-del="${t.id}">Delete</button>` : ''}</div></article>`;
}
function wire(mode) {
  document.querySelectorAll('[data-st]').forEach(s => s.onchange = async () => { try { await call('/api/tasks/' + s.dataset.st, 'PATCH', { status: s.value }); await boot(); } catch (e) { alert(e.message); } });
  document.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { if (confirm('Delete this task?')) { await call('/api/tasks/' + b.dataset.del, 'DELETE'); await boot(); } });
  document.querySelectorAll('[data-edit]').forEach(b => b.onclick = async () => {
    const t = tasks.find(x => x.id === b.dataset.edit), n = prompt('Confidential note (admin and head only):', t.internalNote || '');
    if (n === null) return; const r = prompt('Confidential rating:', t.rating || ''); if (r === null) return;
    await call('/api/tasks/' + t.id, 'PATCH', { internalNote: n, rating: r }); await boot();
  });
}
function render() {
  if (me.role === 'employee') {
    const open = tasks.filter(t => t.status !== 'done').length, done = tasks.length - open;
    shell(`<section class="stats">${statCard('Open tasks', open, 'Need attention', '○')}${statCard('Completed', done, 'Finished work', '✓')}${statCard('Overdue', tasks.filter(overdue).length, 'Past due date', '!')}</section><section class="section-head"><div><h2>My tasks</h2><p>Your assigned work appears here.</p></div></section><div class="task-list">${tasks.map(t => taskCard(t, 'employee')).join('') || '<div class="empty"><b>No tasks yet</b><span>Your admin will assign work here.</span></div>'}</div>`,'My workspace');
    wire('employee');
  } else if (me.role === 'admin') {
    shell(`<section class="stats">${statCard('Total tasks', tasks.length, 'Across the team', '▦')}${statCard('Completed', tasks.filter(t => t.status === 'done').length, 'Finished tasks', '✓')}${statCard('In progress', tasks.filter(t => t.status === 'in-progress').length, 'Currently active', '→')}${statCard('Employees', users.length, 'Team members', '◉')}</section>
      <div class="two-col"><section class="panel"><div class="panel-head"><div><h2>Assign a task</h2><p>Create and delegate a new piece of work.</p></div></div><div class="form-grid"><label>Task title<input id="t" placeholder="e.g. Prepare weekly report"></label><label>Assign to<select id="a">${users.map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join('')}</select></label><label>Priority<select id="pr"><option value="low">Low</option><option value="medium" selected>Medium</option><option value="high">High</option></select></label><label>Due date<input id="d" type="date"></label></div><label>Description<textarea id="ds" rows="3" placeholder="Add task details..."></textarea></label><div class="advanced"><label>Confidential note<textarea id="n" rows="2" placeholder="Visible only to admin and head"></textarea></label><label>Confidential rating<input id="rt" placeholder="e.g. A, B, 8/10"></label></div><div class="err" id="e"></div><button id="add" class="primary">Assign task</button></section>
      <section class="panel"><div class="panel-head"><div><h2>Add employee</h2><p>Create a new employee account.</p></div></div><label>Full name<input id="nn" placeholder="Employee name"></label><label>Username<input id="nu" placeholder="username"></label><label>Password (6+ characters)<input id="np" type="password" placeholder="Temporary password"></label><div class="err" id="e2"></div><button id="addu" class="primary">Add employee</button><div class="mini-note">New employees can use their username and password to sign in.</div></section></div>
      <section class="section-head"><div><h2>All tasks</h2><p>Manage assignments and confidential details.</p></div></section><div class="task-list">${tasks.map(t => taskCard(t, 'admin')).join('') || '<div class="empty"><b>No tasks yet</b><span>Assign the first task above.</span></div>'}</div>`, 'Admin dashboard');
    $('#add').onclick = async () => { try { await call('/api/tasks', 'POST', { title: $('#t').value, assignedTo: $('#a').value, priority: $('#pr').value, dueDate: $('#d').value, description: $('#ds').value, internalNote: $('#n').value, rating: $('#rt').value }); await boot(); } catch (e) { $('#e').textContent = e.message; } };
    $('#addu').onclick = async () => { try { await call('/api/users', 'POST', { name: $('#nn').value, username: $('#nu').value.trim(), password: $('#np').value }); await boot(); } catch (e) { $('#e2').textContent = e.message; } };
    wire('admin');
  } else renderHead();
}
async function renderHead() {
  const log = await call('/api/log');
  const completed = tasks.filter(t => t.status === 'done').length;
  const rows = users.map(u => { const mine = tasks.filter(t => t.assignedTo === u.id); return `<tr><td><b>${esc(u.name)}</b><small>${esc(u.username)}</small></td><td>${mine.length}</td><td>${mine.filter(t => t.status === 'in-progress').length}</td><td>${mine.filter(t => t.status === 'done').length}</td><td>${mine.filter(overdue).length}</td></tr>`; }).join('');
  shell(`<section class="stats">${statCard('Total tasks', tasks.length, 'Team workload', '▦')}${statCard('Completed', completed, tasks.length ? Math.round(completed/tasks.length*100) + '% completion' : 'No tasks yet', '✓')}${statCard('Overdue', tasks.filter(overdue).length, 'Requires follow-up', '!')}${statCard('Employees', users.length, 'Active accounts', '◉')}</section>
  <div class="two-col head-grid"><section class="panel"><div class="panel-head"><div><h2>Employee workload</h2><p>Current assignment summary.</p></div></div><div class="table-wrap"><table><thead><tr><th>Employee</th><th>Assigned</th><th>Active</th><th>Done</th><th>Overdue</th></tr></thead><tbody>${rows || '<tr><td colspan="5">No employees yet.</td></tr>'}</tbody></table></div></section>
  <section class="panel"><div class="panel-head"><div><h2>Activity</h2><p>Recent system events.</p></div></div><div class="activity">${log.slice(0, 8).map(l => `<div class="activity-item"><span class="dot"></span><div><b>${esc(l.actor)}</b> <span>${esc(l.action)}</span><small>${new Date(l.time).toLocaleString()}</small></div></div>`).join('') || '<div class="empty"><span>No activity yet.</span></div>'}</div></section></div>
  <section class="section-head"><div><h2>All tasks</h2><p>Read-only view with confidential information.</p></div></section><div class="task-list">${tasks.map(t => taskCard(t, 'head')).join('') || '<div class="empty"><b>No tasks yet</b><span>Tasks will appear here.</span></div>'}</div>`, 'Head dashboard');
}
call('/api/me').then(u => { me = u; boot(); }).catch(() => loginView());
