/* Student Productivity Dashboard: all logic lives inside one function so we
   don't pollute the global scope. Data flow: change `state` -> save() -> renderAll(). */
(() => {
  'use strict';

  // ---------- Storage helpers (safe against missing/corrupted data) ----------
  const KEYS = { tasks: 'spd_tasks', sessions: 'spd_sessions', notes: 'spd_notes', theme: 'spd_theme', pomo: 'spd_pomo' };
  const load = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
  const save = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { toast('Could not save. Is browser storage full or blocked?', 'error'); } };
  const loadList = key => { const v = load(key, []); return Array.isArray(v) ? v.filter(x => x && typeof x === 'object' && x.id) : []; };

  const pomoSaved = load(KEYS.pomo, {});
  const state = {
    tasks: loadList(KEYS.tasks),
    sessions: loadList(KEYS.sessions),
    notes: loadList(KEYS.notes),
    pomoLog: Array.isArray(pomoSaved.log) ? pomoSaved.log : [] // [{id,date,minutes,subject}]
  };
  const persist = () => {
    save(KEYS.tasks, state.tasks); save(KEYS.sessions, state.sessions);
    save(KEYS.notes, state.notes); save(KEYS.pomo, { log: state.pomoLog });
  };

  // ---------- Small utilities ----------
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8); // unique, never an array index
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
  const dayOffset = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA'); };
  const lastDays = n => Array.from({ length: n }, (_, i) => dayOffset(i - n + 1));
  const fmtDate = s => s ? new Date(s + 'T00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) : 'No date';
  const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const PRIORITY = { High: 3, Medium: 2, Low: 1 };
  const isOverdue = t => t.status === 'Pending' && t.due && t.due < today();

  function toast(message, type = 'ok') {
    const el = document.createElement('div');
    el.className = 'toast ' + (type === 'error' ? 'error' : '');
    el.textContent = message;
    $('#toasts').append(el);
    setTimeout(() => el.remove(), 3200);
  }

  function confirmBox(message, okLabel = 'Delete') {
    return new Promise(resolve => {
      const dlg = $('#confirmDialog');
      $('#confirmMsg').textContent = message;
      dlg.querySelector('[value=ok]').textContent = okLabel;
      dlg.returnValue = '';
      dlg.onclose = () => resolve(dlg.returnValue === 'ok');
      dlg.showModal();
    });
  }

  // Study minutes come from finished focus sessions AND planner sessions marked done
  const studyEntries = () => [
    ...state.pomoLog,
    ...state.sessions.filter(s => s.done).map(s => ({ date: s.date, minutes: Math.max(0, toMin(s.end) - toMin(s.start)), subject: s.subject }))
  ];

  // ---------- Generic form dialog (used for tasks, sessions and notes) ----------
  function openForm({ title, fields, values = {}, validate, onSave }) {
    const form = $('#dlgForm');
    form.innerHTML = `<h2>${title}</h2>` + fields.map(f => {
      const v = values[f.name] ?? f.def ?? '';
      let input;
      if (f.type === 'select') input = `<select name="${f.name}">${f.options.map(o => `<option ${o === v ? 'selected' : ''}>${o}</option>`).join('')}</select>`;
      else if (f.type === 'textarea') input = `<textarea name="${f.name}" rows="${f.rows || 3}">${esc(v)}</textarea>`;
      else input = `<input name="${f.name}" type="${f.type || 'text'}" value="${esc(v)}" ${f.list ? `list="${f.list}"` : ''}>`;
      return `<label>${f.label}${f.required ? ' *' : ''}${input}<small class="err" data-for="${f.name}"></small></label>`;
    }).join('') + `<div class="row end"><button type="button" class="btn ghost" data-close>Cancel</button><button class="btn primary">Save</button></div>`;

    form.onsubmit = e => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      let ok = true;
      fields.forEach(f => {
        data[f.name] = (data[f.name] || '').trim();
        const msg = f.required && !data[f.name] ? `${f.label} is required.` : '';
        form.querySelector(`[data-for="${f.name}"]`).textContent = msg;
        if (msg) ok = false;
      });
      const problem = ok && validate ? validate(data) : '';
      if (problem) { toast(problem, 'error'); ok = false; }
      if (ok) { $('#formDialog').close(); onSave(data); }
    };
    $('#formDialog').showModal();
  }

  // ---------- Tasks ----------
  const taskFields = [
    { name: 'title', label: 'Title', required: true },
    { name: 'description', label: 'Description', type: 'textarea' },
    { name: 'subject', label: 'Subject', required: true, list: 'subjects' },
    { name: 'due', label: 'Due date', type: 'date', required: true },
    { name: 'priority', label: 'Priority', type: 'select', options: ['Low', 'Medium', 'High'], def: 'Medium' },
    { name: 'status', label: 'Status', type: 'select', options: ['Pending', 'Completed'], def: 'Pending' }
  ];
  function taskForm(task) {
    openForm({
      title: task ? 'Edit task' : 'New task', fields: taskFields, values: task || { due: today() },
      onSave: data => {
        const done = data.status === 'Completed';
        if (task) Object.assign(task, data, { completedOn: done ? (task.completedOn || today()) : null });
        else state.tasks.push({ id: uid(), ...data, createdAt: new Date().toISOString(), completedOn: done ? today() : null });
        persist(); renderAll(); toast(task ? 'Task updated' : 'Task added');
      }
    });
  }
  function toggleTask(id) {
    const t = state.tasks.find(x => x.id === id); if (!t) return;
    const done = t.status !== 'Completed';
    t.status = done ? 'Completed' : 'Pending'; t.completedOn = done ? today() : null;
    persist(); renderAll(); toast(done ? 'Task completed' : 'Task moved back to pending');
  }
  async function deleteTask(id) {
    if (!(await confirmBox('Delete this task? This cannot be undone.'))) return;
    state.tasks = state.tasks.filter(t => t.id !== id); persist(); renderAll(); toast('Task deleted');
  }

  const taskRow = t => `<li class="item ${t.status === 'Completed' ? 'done' : ''} ${isOverdue(t) ? 'overdue' : ''}">
    <input type="checkbox" data-action="toggleTask" data-id="${t.id}" ${t.status === 'Completed' ? 'checked' : ''} aria-label="Mark task complete">
    <div class="grow"><strong>${esc(t.title)}</strong>${t.description ? `<p>${esc(t.description)}</p>` : ''}
      <div class="meta"><span class="tag">${esc(t.subject)}</span><span class="pri ${t.priority}">${t.priority}</span>
      <span>${isOverdue(t) ? 'Overdue, was due ' : 'Due '}${fmtDate(t.due)}</span></div></div>
    <div class="acts"><button class="btn sm" data-action="editTask" data-id="${t.id}">Edit</button><button class="btn sm" data-action="delTask" data-id="${t.id}">Delete</button></div></li>`;

  function filteredTasks() {
    const q = $('#fSearch').value.trim().toLowerCase(), st = $('#fStatus').value, sb = $('#fSubject').value,
      pr = $('#fPriority').value, du = $('#fDue').value, so = $('#fSort').value, t0 = today(), wk = dayOffset(7);
    return state.tasks.filter(t =>
      (!q || t.title.toLowerCase().includes(q)) && (st === 'all' || t.status === st) && (sb === 'all' || t.subject === sb) &&
      (pr === 'all' || t.priority === pr) &&
      (du === 'all' || (du === 'today' && t.due === t0) || (du === 'overdue' && isOverdue(t)) || (du === 'week' && t.due >= t0 && t.due <= wk))
    ).sort((a, b) => so === 'priority'
      ? PRIORITY[b.priority] - PRIORITY[a.priority] || a.due.localeCompare(b.due)
      : a.due.localeCompare(b.due) || PRIORITY[b.priority] - PRIORITY[a.priority]);
  }

  const emptyState = (title, hint) => `<li class="empty"><b>${title}</b>${hint}</li>`;

  function renderTasks() {
    // Rebuild the subject filter, keeping the current choice if it still exists
    const subjects = [...new Set(state.tasks.map(t => t.subject))].sort();
    const sel = $('#fSubject'), keep = sel.value;
    sel.innerHTML = '<option value="all">Any subject</option>' + subjects.map(s => `<option>${esc(s)}</option>`).join('');
    sel.value = subjects.includes(keep) ? keep : 'all';
    const list = filteredTasks();
    $('#taskList').innerHTML = list.length ? list.map(taskRow).join('')
      : state.tasks.length ? emptyState('No tasks match', 'Try clearing a filter or search.')
        : emptyState('No tasks yet', 'Press "New task" to add your first assignment.');
  }

  // ---------- Study planner ----------
  const sessionFields = [
    { name: 'subject', label: 'Subject', required: true, list: 'subjects' },
    { name: 'date', label: 'Date', type: 'date', required: true },
    { name: 'start', label: 'Start time', type: 'time', required: true },
    { name: 'end', label: 'End time', type: 'time', required: true },
    { name: 'description', label: 'Short description', type: 'textarea', rows: 2 }
  ];
  function sessionForm(s) {
    openForm({
      title: s ? 'Edit study session' : 'New study session', fields: sessionFields, values: s || { date: today() },
      validate: d => toMin(d.end) <= toMin(d.start) ? 'End time must be after start time.' : '',
      onSave: data => {
        if (s) Object.assign(s, data); else state.sessions.push({ id: uid(), ...data, done: false });
        persist(); renderAll(); toast(s ? 'Session updated' : 'Session added');
      }
    });
  }
  function sessionStatus(s) {
    if (s.done) return 'Completed';
    const now = new Date();
    const end = new Date(`${s.date}T${s.end}`);
    return end < now ? 'Overdue' : 'Upcoming';
  }
  const sessionRow = s => { const st = sessionStatus(s); return `<li class="item ${s.done ? 'done' : ''} ${st === 'Overdue' ? 'overdue' : ''}">
    <div class="grow"><strong>${esc(s.subject)}</strong>${s.description ? `<p>${esc(s.description)}</p>` : ''}
      <div class="meta"><span class="badge ${st}">${st}</span><span>${fmtDate(s.date)}, ${s.start} to ${s.end}</span></div></div>
    <div class="acts"><button class="btn sm" data-action="toggleSession" data-id="${s.id}">${s.done ? 'Undo' : 'Mark done'}</button>
    <button class="btn sm" data-action="editSession" data-id="${s.id}">Edit</button><button class="btn sm" data-action="delSession" data-id="${s.id}">Delete</button></div></li>`; };
  const bySessionTime = (a, b) => (a.date + a.start).localeCompare(b.date + b.start);
  function renderSessions() {
    const list = [...state.sessions].sort(bySessionTime);
    $('#sessionList').innerHTML = list.length ? list.map(sessionRow).join('') : emptyState('No study sessions planned', 'Press "New session" to block out study time.');
  }

  // ---------- Notes ----------
  const noteFields = [
    { name: 'title', label: 'Title', required: true },
    { name: 'subject', label: 'Subject', required: true, list: 'subjects' },
    { name: 'content', label: 'Content', type: 'textarea', rows: 7, required: true }
  ];
  function noteForm(n) {
    openForm({
      title: n ? 'Edit note' : 'New note', fields: noteFields, values: n || {},
      onSave: data => {
        if (n) Object.assign(n, data, { updatedAt: new Date().toISOString() });
        else state.notes.push({ id: uid(), ...data, updatedAt: new Date().toISOString() });
        persist(); renderAll(); toast(n ? 'Note updated' : 'Note added');
      }
    });
  }
  function renderNotes() {
    const q = $('#nSearch').value.trim().toLowerCase();
    const list = state.notes.filter(n => !q || (n.title + ' ' + n.content + ' ' + n.subject).toLowerCase().includes(q))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    $('#noteGrid').innerHTML = list.length ? list.map(n => `<article class="card"><strong>${esc(n.title)}</strong>
      <div class="meta"><span class="tag">${esc(n.subject)}</span><span>Updated ${new Date(n.updatedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</span></div>
      <p>${esc(n.content)}</p><div class="acts"><button class="btn sm" data-action="editNote" data-id="${n.id}">Edit</button><button class="btn sm" data-action="delNote" data-id="${n.id}">Delete</button></div></article>`).join('')
      : `<div class="empty card"><b>${state.notes.length ? 'No notes match your search' : 'No notes yet'}</b>${state.notes.length ? 'Try different words.' : 'Press "New note" to capture what you learned.'}</div>`;
  }

  // ---------- Dashboard ----------
  function renderDashboard() {
    const h = new Date().getHours();
    $('#greeting').textContent = `Good ${h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening'}`;
    $('#today').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const total = state.tasks.length, done = state.tasks.filter(t => t.status === 'Completed').length;
    const dueToday = state.tasks.filter(t => t.status === 'Pending' && t.due === today()).length;
    const studyToday = studyEntries().filter(e => e.date === today()).reduce((a, e) => a + e.minutes, 0);
    const pct = total ? Math.round(done / total * 100) : 0;
    $('#stats').innerHTML = [['Total tasks', total], ['Completed', done], ['Pending', total - done], ['Due today', dueToday],
      ['Studied today', `${Math.floor(studyToday / 60)}h ${studyToday % 60}m`]].map(([l, v]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('')
      + `<div class="stat ring"><div class="ringbar" style="--p:${pct}"><i>${pct}%</i></div><span>Task completion</span></div>`;

    const sched = state.sessions.filter(s => s.date === today()).sort(bySessionTime);
    $('#dashSchedule').innerHTML = sched.length ? sched.map(sessionRow).join('') : emptyState('Nothing scheduled today', 'Plan a session in the Planner.');
    const next = state.tasks.filter(t => t.status === 'Pending').sort((a, b) => a.due.localeCompare(b.due)).slice(0, 5);
    $('#dashDeadlines').innerHTML = next.length ? next.map(taskRow).join('') : emptyState('No pending deadlines', 'You are all caught up.');

    const days = lastDays(7);
    const counts = days.map(d => state.tasks.filter(t => t.completedOn === d).length);
    drawChart('chWeek', 'bar', days.map(shortDay), [{ label: 'Tasks completed', data: counts, backgroundColor: cssVar('--accent'), borderRadius: 6 }], counts.some(Boolean), { scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }, plugins: { legend: { display: false } } });
  }

  // ---------- Charts ----------
  const charts = {};
  const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const shortDay = d => new Date(d + 'T00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
  function drawChart(id, type, labels, datasets, hasData, options = {}) {
    const canvas = $('#' + id);
    canvas.parentElement.classList.toggle('nodata', !hasData);
    if (charts[id]) { charts[id].destroy(); delete charts[id]; }
    if (!hasData || !window.Chart) return;
    Chart.defaults.color = cssVar('--muted'); Chart.defaults.borderColor = cssVar('--line'); Chart.defaults.font.family = 'Manrope, sans-serif';
    charts[id] = new Chart(canvas, { type, data: { labels, datasets }, options: { responsive: true, maintainAspectRatio: false, ...options } });
  }
  function renderAnalytics() {
    const d14 = lastDays(14), c14 = d14.map(d => state.tasks.filter(t => t.completedOn === d).length);
    drawChart('chOver', 'line', d14.map(shortDay), [{ label: 'Completed', data: c14, borderColor: cssVar('--accent'), tension: .3, fill: false }], c14.some(Boolean),
      { scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }, plugins: { legend: { display: false } } });

    const bySubject = {};
    studyEntries().forEach(e => { bySubject[e.subject] = (bySubject[e.subject] || 0) + e.minutes; });
    const subs = Object.keys(bySubject).filter(s => bySubject[s] > 0);
    const palette = ['#8ab0ff', '#5fdc94', '#f5c04f', '#f58a8a', '#c59bff', '#5fd6dc', '#ff9f6b'];
    drawChart('chSubj', 'doughnut', subs, [{ data: subs.map(s => bySubject[s]), backgroundColor: subs.map((_, i) => palette[i % palette.length]), borderWidth: 0 }], subs.length > 0);

    const d7 = lastDays(7), entries = studyEntries(), m7 = d7.map(d => entries.filter(e => e.date === d).reduce((a, e) => a + e.minutes, 0));
    drawChart('chStudy', 'bar', d7.map(shortDay), [{ label: 'Minutes', data: m7, backgroundColor: cssVar('--ok'), borderRadius: 6 }], m7.some(Boolean),
      { scales: { y: { beginAtZero: true } }, plugins: { legend: { display: false } } });

    const done = state.tasks.filter(t => t.status === 'Completed').length;
    drawChart('chPct', 'doughnut', ['Completed', 'Pending'], [{ data: [done, state.tasks.length - done], backgroundColor: [cssVar('--ok'), cssVar('--line')], borderWidth: 0 }], state.tasks.length > 0, { cutout: '68%' });
  }

  // ---------- Pomodoro timer ----------
  const MODES = { focus: 25, short: 5, long: 15 };
  const timer = { mode: 'focus', remaining: 25 * 60, running: false, endAt: 0, id: null };

  function stopTimer() { clearInterval(timer.id); timer.id = null; timer.running = false; } // always clear before anything else
  function setMode(mode) { stopTimer(); timer.mode = mode; timer.remaining = MODES[mode] * 60; renderTimer(); }
  function startTimer() {
    if (timer.running || timer.id) return; // never two timers at once
    timer.running = true; timer.endAt = Date.now() + timer.remaining * 1000;
    timer.id = setInterval(tick, 250); renderTimer();
  }
  function pauseTimer() { if (!timer.running) return; tick(); if (timer.running) { stopTimer(); renderTimer(); } }
  function tick() {
    timer.remaining = Math.max(0, Math.ceil((timer.endAt - Date.now()) / 1000)); // based on the clock, so it stays accurate in background tabs
    renderTimer(); if (timer.remaining === 0) finishTimer();
  }
  function finishTimer() {
    stopTimer();
    if (timer.mode === 'focus') {
      state.pomoLog.push({ id: uid(), date: today(), minutes: MODES.focus, subject: $('#pomoSubject').value.trim() || 'General' });
      persist(); toast('Focus session complete. Time for a break!');
    } else toast('Break over. Ready to focus?');
    const todayCount = state.pomoLog.filter(e => e.date === today()).length;
    setMode(timer.mode === 'focus' ? (todayCount % 4 === 0 ? 'long' : 'short') : 'focus');
    renderAll();
  }
  function renderTimer() {
    const m = String(Math.floor(timer.remaining / 60)).padStart(2, '0'), s = String(timer.remaining % 60).padStart(2, '0');
    $('#clock').textContent = `${m}:${s}`;
    document.title = timer.running ? `${m}:${s} Student Productivity Dashboard` : 'Student Productivity Dashboard';
    $$('#modeTabs button').forEach(b => b.classList.toggle('active', b.dataset.mode === timer.mode));
    const fresh = timer.remaining === MODES[timer.mode] * 60;
    $('#tStart').textContent = fresh ? 'Start' : 'Resume'; $('#tStart').disabled = timer.running; $('#tPause').disabled = !timer.running;
  }
  function renderPomodoroStats() {
    $('#pCount').textContent = state.pomoLog.filter(e => e.date === today()).length;
    $('#pMins').textContent = state.pomoLog.reduce((a, e) => a + e.minutes, 0);
  }

  // ---------- Theme and rendering ----------
  function applyTheme(theme) { document.documentElement.dataset.theme = theme; save(KEYS.theme, theme); }
  function renderAll() {
    const subjects = [...new Set([...state.tasks, ...state.sessions, ...state.notes].map(x => x.subject))].sort();
    $('#subjects').innerHTML = subjects.map(s => `<option value="${esc(s)}">`).join('');
    renderDashboard(); renderTasks(); renderSessions(); renderNotes(); renderPomodoroStats(); renderAnalytics();
    if (window.lucide) lucide.createIcons();
  }
  function showView(name) {
    $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
    $$('[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === name));
    renderAll(); window.scrollTo(0, 0);
  }

  // ---------- Events (one listener handles every button via data-action) ----------
  const find = (list, id) => list.find(x => x.id === id);
  const actions = {
    addTask: () => taskForm(), editTask: id => taskForm(find(state.tasks, id)), toggleTask, delTask: deleteTask,
    addSession: () => sessionForm(), editSession: id => sessionForm(find(state.sessions, id)),
    toggleSession: id => { const s = find(state.sessions, id); s.done = !s.done; persist(); renderAll(); toast(s.done ? 'Session marked done' : 'Session reopened'); },
    delSession: async id => { if (await confirmBox('Delete this study session?')) { state.sessions = state.sessions.filter(s => s.id !== id); persist(); renderAll(); toast('Session deleted'); } },
    addNote: () => noteForm(), editNote: id => noteForm(find(state.notes, id)),
    delNote: async id => { if (await confirmBox('Delete this note?')) { state.notes = state.notes.filter(n => n.id !== id); persist(); renderAll(); toast('Note deleted'); } },
    tStart: startTimer, tPause: pauseTimer, tReset: () => setMode(timer.mode),
    theme: () => { applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'); renderAll(); },
    clearAll: async () => {
      if (!(await confirmBox('Delete ALL tasks, sessions, notes and timer history? This cannot be undone.', 'Clear everything'))) return;
      Object.values(KEYS).filter(k => k !== KEYS.theme).forEach(k => localStorage.removeItem(k));
      Object.assign(state, { tasks: [], sessions: [], notes: [], pomoLog: [] });
      setMode('focus'); renderAll(); toast('All data cleared');
    }
  };
  document.addEventListener('click', e => {
    if (e.target.closest('[data-close]')) return $('#formDialog').close();
    const nav = e.target.closest('[data-view]'); if (nav) return showView(nav.dataset.view);
    const mode = e.target.closest('[data-mode]'); if (mode) return setMode(mode.dataset.mode);
    const btn = e.target.closest('[data-action]');
    if (btn && actions[btn.dataset.action] && btn.type !== 'checkbox') actions[btn.dataset.action](btn.dataset.id);
  });
  document.addEventListener('change', e => { if (e.target.matches('input[type=checkbox][data-action]')) actions[e.target.dataset.action](e.target.dataset.id); });
  ['fSearch', 'fStatus', 'fSubject', 'fPriority', 'fDue', 'fSort'].forEach(id => $('#' + id).addEventListener('input', renderTasks));
  $('#nSearch').addEventListener('input', renderNotes);

  // ---------- Start ----------
  applyTheme(load(KEYS.theme, 'dark') === 'light' ? 'light' : 'dark');
  renderTimer(); renderAll();
})();
