const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const LABELS = {
  mon: 'Понедельник',
  tue: 'Вторник',
  wed: 'Среда',
  thu: 'Четверг',
  fri: 'Пятница',
  sat: 'Суббота',
  sun: 'Воскресенье'
};

const daysEl = document.getElementById('days');
const editorEl = document.getElementById('editor');
const editorTitle = document.getElementById('editor-title');
const timeFields = document.getElementById('time-fields');
const shiftStart = document.getElementById('shift-start');
const shiftEnd = document.getElementById('shift-end');
const saveBtn = document.getElementById('save-btn');
const statusEl = document.getElementById('status');

let schedule = createEmptyWeek();
let editingDay = null;

function createEmptyWeek() {
  const week = {};
  for (const day of WEEKDAYS) {
    week[day] = { isWorkDay: false, shiftStart: null, shiftEnd: null };
  }
  return week;
}

function getInitData() {
  if (window.WebApp?.initData) return window.WebApp.initData;
  const hash = location.hash.slice(1);
  if (!hash) return '';
  const params = new URLSearchParams(hash);
  const raw = params.get('WebAppData');
  return raw ? decodeURIComponent(raw) : '';
}

async function api(path, options = {}) {
  const initData = getInitData();
  const headers = {
    'Content-Type': 'application/json',
    ...(initData ? { 'X-Max-Init-Data': initData } : {})
  };

  const res = await fetch(path, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

function formatMeta(day) {
  if (!day.isWorkDay) return 'Выходной';
  if (day.shiftStart && day.shiftEnd) return `${day.shiftStart} – ${day.shiftEnd}`;
  if (day.shiftStart) return `с ${day.shiftStart}`;
  return 'Рабочий день';
}

function renderDays() {
  daysEl.innerHTML = '';
  editorEl.classList.add('hidden');
  daysEl.classList.remove('hidden');

  for (const day of WEEKDAYS) {
    const d = schedule[day];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `day-card${d.isWorkDay ? ' day-card--work' : ''}`;
    btn.innerHTML = `
      <span>
        <div class="day-name">${LABELS[day]}</div>
        <div class="day-meta">${formatMeta(d)}</div>
      </span>
      <span class="day-badge${d.isWorkDay ? ' day-badge--work' : ''}">
        ${d.isWorkDay ? 'Работа' : 'Отдых'}
      </span>
    `;
    btn.addEventListener('click', () => openEditor(day));
    daysEl.appendChild(btn);
  }
}

function openEditor(day) {
  editingDay = day;
  daysEl.classList.add('hidden');
  editorEl.classList.remove('hidden');
  editorTitle.textContent = LABELS[day];

  const d = schedule[day];
  document.querySelectorAll('.chip').forEach((chip) => {
    const isWork = chip.dataset.work === '1';
    chip.classList.toggle('chip--active', isWork === d.isWorkDay);
  });

  timeFields.classList.toggle('hidden', !d.isWorkDay);
  shiftStart.value = d.shiftStart || '';
  shiftEnd.value = d.shiftEnd || '';
}

function setWorkDay(isWork) {
  if (!editingDay) return;
  schedule[editingDay].isWorkDay = isWork;
  if (!isWork) {
    schedule[editingDay].shiftStart = null;
    schedule[editingDay].shiftEnd = null;
  }
  timeFields.classList.toggle('hidden', !isWork);
  document.querySelectorAll('.chip').forEach((chip) => {
    chip.classList.toggle('chip--active', chip.dataset.work === (isWork ? '1' : '0'));
  });
}

function setStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.className = 'status' + (kind ? ` status--${kind}` : '');
}

document.querySelectorAll('.chip').forEach((chip) => {
  chip.addEventListener('click', () => setWorkDay(chip.dataset.work === '1'));
});

shiftStart.addEventListener('change', () => {
  if (!editingDay) return;
  schedule[editingDay].shiftStart = shiftStart.value || null;
});

shiftEnd.addEventListener('change', () => {
  if (!editingDay) return;
  schedule[editingDay].shiftEnd = shiftEnd.value || null;
});

document.getElementById('editor-back').addEventListener('click', renderDays);

saveBtn.addEventListener('click', async () => {
  saveBtn.disabled = true;
  setStatus('Сохраняю…');
  try {
    await api('/api/miniapp/schedule', {
      method: 'POST',
      body: JSON.stringify({ schedule })
    });
    setStatus('Сохранено! Вернитесь в чат и нажмите «Продолжить»', 'ok');
    if (window.WebApp?.close) {
      setTimeout(() => window.WebApp.close(), 1200);
    }
  } catch (err) {
    setStatus('Ошибка: ' + (err.message || 'не удалось сохранить'), 'err');
  } finally {
    saveBtn.disabled = false;
  }
});

async function init() {
  if (window.WebApp?.ready) window.WebApp.ready();

  try {
    const data = await api('/api/miniapp/schedule');
    if (data.schedule) schedule = data.schedule;
  } catch {
    setStatus('Откройте календарь из чата с ботом в MAX', 'err');
  }

  renderDays();
}

init();
