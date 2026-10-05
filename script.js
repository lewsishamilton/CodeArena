/* =========================================================================
   CODE//ARENA prototype — shared core + student-facing pages.
   Frontend only: mock data, simulated flows, localStorage for demo state.
   Admin logic lives in admin.js, the coding arena in arena.js.
   ========================================================================= */

/* ---------- Event config — change the brand/date/venue here (or Admin → Settings) ---------- */
const DEFAULTS = {
  name: 'CODE//ARENA',
  edition: '2026',
  date: '2026-11-14T09:30',          // placeholder date
  venue: 'Main Auditorium, Block A', // placeholder venue
  fee: 199,                          // placeholder fee (INR)
  capacity: 500,
  durationMin: 120,
  organiser: 'Department of Computer Science & Engineering'
};

/* ---------- Tiny persistence wrapper (all keys prefixed "ca.") ---------- */
const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem('ca.' + key); return v === null ? fallback : JSON.parse(v); }
    catch { return fallback; }
  },
  set(key, value) { try { localStorage.setItem('ca.' + key, JSON.stringify(value)); } catch { /* private mode: demo still works in-memory */ } },
  remove(key) { try { localStorage.removeItem('ca.' + key); } catch {} },
  clearAll() { try { Object.keys(localStorage).filter(k => k.startsWith('ca.')).forEach(k => localStorage.removeItem(k)); } catch {} }
};

const CONFIG = { ...DEFAULTS, ...store.get('settings', {}) };

/* ---------- Small utilities ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const pad = (n, w = 2) => String(n).padStart(w, '0');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => '₹' + Number(n).toLocaleString('en-IN');
const initials = name => String(name).split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const eventDate = () => new Date(CONFIG.date);
const fmtDate = (d, opts = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) => new Date(d).toLocaleDateString('en-IN', opts);
const fmtTime = d => new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
const fmtClock = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`; };
const fmtMins = m => m == null ? '—' : `${Math.floor(m / 60)}:${pad(Math.floor(m) % 60)}:${pad(Math.round((m % 1) * 60) % 60)}`;
const brandHTML = name => esc(name).replace('//', '<span class="sep">//</span>');

/** Deterministic PRNG so mock data is identical on every load. */
function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hashStr = s => [...String(s)].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);
const ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const randCode = (r, n) => Array.from({ length: n }, () => ID_CHARS[Math.floor(r() * ID_CHARS.length)]).join('');

/* ---------- Icons (stroke SVG, 24px grid) ---------- */
const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.6c2.2.6 3.5 2.4 3.5 5.4"/>',
  ticket: '<path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z"/><path d="M14 6v12" stroke-dasharray="2 2"/>',
  code: '<path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H4.5v1.5A3.5 3.5 0 0 0 8 11M16 6h3.5v1.5A3.5 3.5 0 0 1 16 11M12 13v4M8.5 20h7M10 17h4"/>',
  award: '<circle cx="12" cy="9" r="5.5"/><path d="m8.5 13.5-1.5 7 5-2.5 5 2.5-1.5-7"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  card: '<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M2.5 10h19M6 15h4"/>',
  scan: '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
  play: '<path d="M7 4.5v15l12-7.5z"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  alert: '<path d="M12 3 2 20h20zM12 10v4.5M12 17.5h.01"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  download: '<path d="M12 4v11M7 10.5l5 5 5-5M4 20h16"/>',
  printer: '<path d="M7 9V3.5h10V9M7 17H4.5A1.5 1.5 0 0 1 3 15.5v-5A1.5 1.5 0 0 1 4.5 9h15a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5H17"/><path d="M7 14h10v6.5H7z"/>',
  logout: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 16l-4-4 4-4M6 12h10"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5h4"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.6-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.6 4.5L20 16M20 20v-4h-4"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  send: '<path d="M21 3 10 14M21 3l-7 18-4-7-7-4z"/>',
  file: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5"/>',
  shield: '<path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z"/><path d="m9 12 2 2 4-4"/>'
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;

/* ---------- Toasts ---------- */
function toast(message, type = 'success') {
  let host = $('.toasts');
  if (!host) { host = document.createElement('div'); host.className = 'toasts'; host.setAttribute('role', 'status'); document.body.append(host); }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="t-icon">${{ success: '✓', warn: '!', error: '×', info: 'i' }[type]}</span><span>${esc(message)}</span>`;
  host.append(el);
  setTimeout(() => { el.classList.add('leaving'); setTimeout(() => el.remove(), 220); }, 3200);
}

/* ---------- Modal (native <dialog>) ----------
   modal({ title, body: html, confirm: 'Label' | null, tone: 'primary'|'danger', onConfirm, wide })
   onConfirm may return false to keep the dialog open (e.g. failed validation). */
function modal({ title, body = '', confirm = 'Confirm', cancel = 'Cancel', tone = 'primary', onConfirm, wide = false, onOpen }) {
  const dlg = document.createElement('dialog');
  dlg.className = 'modal' + (wide ? ' wide' : '');
  dlg.innerHTML = `
    <div class="modal-head"><h3>${esc(title)}</h3><button class="modal-close" aria-label="Close">×</button></div>
    <div class="modal-body">${body}</div>
    ${confirm || cancel ? `<div class="modal-foot">
      ${cancel ? `<button class="btn btn-secondary btn-sm" data-act="cancel">${esc(cancel)}</button>` : ''}
      ${confirm ? `<button class="btn btn-${tone} btn-sm" data-act="ok">${esc(confirm)}</button>` : ''}
    </div>` : ''}`;
  document.body.append(dlg);
  const close = () => dlg.close();
  dlg.addEventListener('close', () => dlg.remove());
  dlg.addEventListener('click', e => { if (e.target === dlg) close(); }); // click on backdrop
  $('.modal-close', dlg).onclick = close;
  $('[data-act="cancel"]', dlg)?.addEventListener('click', close);
  $('[data-act="ok"]', dlg)?.addEventListener('click', () => { if (onConfirm?.(dlg) !== false) close(); });
  dlg.showModal();
  onOpen?.(dlg);
  return dlg;
}

/** Trigger a client-side file download (CSV, .ics, receipts). */
function downloadFile(filename, content, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function copyText(text, label = 'Copied to clipboard') {
  navigator.clipboard?.writeText(text).then(() => toast(label), () => toast('Copy not available in this browser', 'warn'));
}

/* =========================================================================
   MOCK DATA
   ========================================================================= */
const FIRST = ['Aarav', 'Ananya', 'Rohan', 'Sneha', 'Karthik', 'Priya', 'Vikram', 'Divya', 'Arjun', 'Meghana', 'Rahul', 'Harini', 'Siddharth', 'Pooja', 'Aditya', 'Keerthi', 'Nikhil', 'Lakshmi', 'Varun', 'Sahithi', 'Abhinav', 'Bhavana', 'Manoj', 'Ishita', 'Tarun', 'Nandini', 'Pranav', 'Shreya', 'Akhil', 'Tejaswini', 'Sai Kiran', 'Deepika', 'Yash', 'Kavya', 'Rithvik', 'Swathi', 'Naveen', 'Aishwarya', 'Harsha', 'Mounika'];
const LAST = ['Reddy', 'Sharma', 'Rao', 'Kumar', 'Naidu', 'Iyer', 'Patel', 'Varma', 'Gupta', 'Chowdary', 'Menon', 'Nair', 'Joshi', 'Agarwal', 'Pillai', 'Goud', 'Shetty', 'Das', 'Bhat', 'Kulkarni'];
const COLLEGES = ['MLR Institute of Technology', 'CBIT', 'VNR VJIET', 'Vasavi College of Engineering', 'JNTUH College of Engineering', 'Gokaraju Rangaraju IET', 'Sreenidhi Institute of S&T', 'Malla Reddy Engineering College'];
const DEPTS = ['CSE', 'CSE (AI & ML)', 'CSE (Data Science)', 'IT', 'ECE', 'EEE', 'Mechanical'];
const DEPT_WEIGHTS = [30, 20, 14, 14, 12, 6, 4];
const COURSES = ['B.Tech', 'B.Tech', 'B.Tech', 'B.Tech', 'B.Tech', 'MCA', 'M.Tech'];
const LANGS = ['C++', 'C++', 'C++', 'Python', 'Python', 'Java', 'C'];

const weighted = (r, items, weights) => {
  let x = r() * weights.reduce((a, b) => a + b, 0);
  return items[weights.findIndex(w => (x -= w) < 0)];
};

let _people;
/** 412 deterministic sample registrations. */
function participants() {
  if (_people) return _people;
  const r = rng(2026), pick = a => a[Math.floor(r() * a.length)];
  const now = Date.now(), day = 864e5;
  _people = Array.from({ length: 412 }, () => {
    const first = pick(FIRST), last = pick(LAST);
    const x = r();
    const payment = x < 0.89 ? 'paid' : x < 0.97 ? 'pending' : 'failed';
    const year = 1 + Math.floor(r() * 4);
    const dept = weighted(r, DEPTS, DEPT_WEIGHTS);
    const daysAgo = Math.floor(Math.pow(r(), 1.7) * 21); // more recent sign-ups
    const m = r();
    return {
      name: `${first} ${last}`,
      email: `${first.toLowerCase().replace(' ', '')}.${last.toLowerCase()}${Math.floor(r() * 90 + 10)}@gmail.com`,
      college: pick(COLLEGES), dept, course: pick(COURSES), year: String(year),
      roll: `${26 - year}R21A${pad(DEPTS.indexOf(dept) + 1)}${pad(Math.floor(r() * 99) + 1)}`,
      phone: `9${Math.floor(r() * 1e9).toString().padStart(9, '0')}`,
      payment,
      method: m < 0.7 ? 'UPI' : m < 0.9 ? 'Card' : 'Net banking',
      txn: 'pay_' + randCode(r, 12),
      ticketId: 'TK-' + randCode(r, 6),
      registeredAt: now - daysAgo * day - Math.floor(r() * day)
    };
  }).sort((a, b) => a.registeredAt - b.registeredAt)
    .map((p, i) => ({ ...p, regId: `CA26-${pad(i + 1, 4)}`, ticket: p.payment === 'paid' ? 'issued' : 'not issued' }));
  // Admin actions (mark paid, revoke ticket) persist as per-registration overrides
  const overrides = store.get('overrides', {});
  _people.forEach(p => Object.assign(p, overrides[p.regId]));
  return _people;
}
function overridePerson(p, patch) {
  Object.assign(p, patch);
  const all = store.get('overrides', {});
  all[p.regId] = { ...all[p.regId], ...patch };
  store.set('overrides', all);
}

const DEMO_STUDENT = {
  name: 'Ananya Reddy', email: 'ananya.reddy@gmail.com', college: 'MLR Institute of Technology',
  dept: 'CSE (AI & ML)', course: 'B.Tech', year: '3', roll: '23R21A6612', phone: '9849012345',
  regId: 'CA26-0413', ticketId: 'TK-7HQ4MZ', payment: 'paid', method: 'UPI', txn: 'pay_Q8hX2kLm4NpZ',
  paidAt: '2026-09-28T18:42:00', demo: true
};
/** The signed-in student: their own registration if they completed one, else a demo profile. */
const me = () => store.get('student', null) || DEMO_STUDENT;

const checkins = () => store.get('checkins', {});
/** Every ticket that can be checked in: paid sample registrations + this browser's student. */
function ticketIndex() {
  const map = new Map(participants().filter(p => p.payment === 'paid' && p.ticket === 'issued').map(p => [p.ticketId, p]));
  const s = me(); map.set(s.ticketId, s);
  return map;
}

/* Competition lifecycle, controlled from Admin → Competition control */
const compState = () => store.get('comp', { status: 'scheduled', durationMin: CONFIG.durationMin, startedAt: null });
const COMP_LABEL = { scheduled: 'Scheduled', live: 'Live now', ended: 'Ended', published: 'Results published' };
const COMP_BADGE = { scheduled: 'badge-info', live: 'badge-success', ended: 'badge-warn', published: 'badge-success' };

/* ---------- Problems (editable in Admin → Questions) ---------- */
const DEFAULT_QUESTIONS = [
  {
    id: 'A', title: 'Balanced Signal', difficulty: 'Easy', points: 100, timeLimit: '1 s', memory: '256 MB',
    statement: 'A transmitter emits a signal as a string of L and R pulses. A segment is balanced when it holds the same number of L and R pulses.\nSplit the signal into the maximum number of contiguous balanced segments. Every pulse must belong to exactly one segment.',
    input: 'The first line contains n, the length of the signal. The second line contains the string s of length n, made of the characters L and R.',
    output: 'Print a single integer: the maximum number of balanced segments.',
    constraints: '2 ≤ n ≤ 2 × 10^5\ns is balanced as a whole',
    samples: [{ in: '10\nRLRRLLRLRL', out: '4' }, { in: '6\nRLLLRR', out: '2' }]
  },
  {
    id: 'B', title: 'Matrix Walk', difficulty: 'Medium', points: 200, timeLimit: '2 s', memory: '256 MB',
    statement: 'A robot starts at the top-left cell of an n × m grid and must reach the bottom-right cell, moving only right or down. Every cell has an energy cost.\nFind the minimum total cost of a path, counting both the start and the end cell.',
    input: 'The first line contains n and m. Each of the next n lines contains m integers, the costs of the cells in that row.',
    output: 'Print a single integer: the minimum total cost.',
    constraints: '1 ≤ n, m ≤ 1000\n0 ≤ cost ≤ 10^4',
    samples: [{ in: '3 3\n1 3 1\n1 5 1\n4 2 1', out: '7' }, { in: '2 3\n1 2 3\n4 5 6', out: '12' }]
  },
  {
    id: 'C', title: 'Bridge Count', difficulty: 'Hard', points: 300, timeLimit: '2 s', memory: '512 MB',
    statement: 'A campus network has n routers joined by m two-way cables. A cable is critical if removing it disconnects two routers that were previously connected.\nCount the critical cables.',
    input: 'The first line contains n and m. Each of the next m lines contains two integers u and v: a cable between routers u and v.',
    output: 'Print a single integer: the number of critical cables.',
    constraints: '2 ≤ n ≤ 10^5\n1 ≤ m ≤ 2 × 10^5\nNo self-loops or duplicate cables',
    samples: [{ in: '5 5\n1 2\n1 3\n2 3\n3 4\n4 5', out: '2' }, { in: '4 4\n1 2\n2 3\n3 4\n4 1', out: '0' }]
  }
];
const questions = () => store.get('questions', DEFAULT_QUESTIONS);

/* ---------- Results ---------- */
let _results;
/** Sample leaderboard: 342 students who competed, with per-problem outcomes. */
function sampleResults() {
  if (_results) return _results;
  const r = rng(77), pts = questions().map(q => q.points);
  _results = participants().filter(p => p.payment === 'paid').slice(0, 342).map(p => {
    const skill = r();
    const solved = [skill > 0.06, skill > 0.38, skill > 0.74 && r() > 0.15];
    const attempts = solved.map(s => 1 + Math.floor(r() * (s ? 2.4 : 3)));
    let t = 0;
    const times = solved.map(s => s ? (t += 9 + r() * 32) : null);
    return { p, solved, attempts, times, lang: LANGS[Math.floor(r() * LANGS.length)], ...scoreOf(solved, attempts, times, pts) };
  });
  return _results;
}
function scoreOf(solved, attempts, times, pts) {
  const score = solved.reduce((s, ok, i) => s + (ok ? Math.max(pts[i] - 10 * (attempts[i] - 1), pts[i] / 2) : 0), 0);
  const done = times.filter(t => t != null);
  return { score, completion: done.length ? Math.max(...done) : null, solvedCount: solved.filter(Boolean).length };
}
/** The current browser's arena performance, derived from its submissions. */
function myResult() {
  const subs = store.get('arena', {}).subs || [];   // newest first
  if (!subs.length) return null;
  const qs = questions();
  const oldestFirst = [...subs].reverse();
  const solved = qs.map((_, i) => subs.some(s => s.q === i && s.verdict === 'Accepted'));
  // Compilation errors aren't penalised, so they don't count as attempts
  const attempts = qs.map((_, i) => { const list = oldestFirst.filter(s => s.q === i && s.verdict !== 'Compilation error'); const k = list.findIndex(s => s.verdict === 'Accepted'); return k === -1 ? list.length : k + 1; });
  const times = qs.map((_, i) => oldestFirst.find(s => s.q === i && s.verdict === 'Accepted')?.elapsedMin ?? null);
  return { p: me(), solved, attempts, times, lang: subs[0].lang, isMe: true, ...scoreOf(solved, attempts, times, qs.map(q => q.points)) };
}
/** Ranked leaderboard (score desc, completion time asc), including "you" if you competed. */
function leaderboard() {
  const rows = [...sampleResults()];
  const mine = myResult();
  if (mine && mine.score > 0) rows.push(mine);
  rows.sort((a, b) => b.score - a.score || (a.completion ?? 1e9) - (b.completion ?? 1e9));
  rows.forEach((row, i) => row.rank = i + 1);
  return rows;
}

/* =========================================================================
   SHARED RENDERERS
   ========================================================================= */

const DIFF_BADGE = { Easy: 'badge-success', Medium: 'badge-warn', Hard: 'badge-danger' };
/** Problem statement markup — used by the arena and the admin preview. */
function problemHTML(q) {
  const fmt = s => esc(s).replace(/\^(\d+)/g, '<sup>$1</sup>');
  const paras = s => String(s || '').split('\n').filter(Boolean).map(l => `<p>${fmt(l)}</p>`).join('');
  return `<div class="prose">
    <h2>${esc(q.id)}. ${esc(q.title || 'Untitled problem')}</h2>
    <div class="problem-meta">
      <span class="badge ${DIFF_BADGE[q.difficulty] || ''}">${esc(q.difficulty)}</span>
      <span class="badge plain">${Number(q.points) || 0} points</span>
      <span class="badge plain">Time ${esc(q.timeLimit)}</span>
      <span class="badge plain">Memory ${esc(q.memory)}</span>
    </div>
    ${paras(q.statement)}
    <h4>Input</h4>${paras(q.input)}
    <h4>Output</h4>${paras(q.output)}
    <h4>Constraints</h4><ul>${String(q.constraints || '').split('\n').filter(Boolean).map(c => `<li>${fmt(c)}</li>`).join('')}</ul>
    ${(q.samples || []).map((s, i) => `<h4>Example ${i + 1}</h4>
      <div class="sample"><div><header>Input</header><pre>${esc(s.in)}</pre></div><div><header>Output</header><pre>${esc(s.out)}</pre></div></div>`).join('')}
  </div>`;
}

/** QR-style visual (not a scannable QR) — deterministic per ticket ID. */
function qrSvg(text, size = 29) {
  const r = rng(hashStr(text));
  const finder = (x, y) => (x >= 0 && x < 7 && y >= 0 && y < 7) && (x === 0 || x === 6 || y === 0 || y === 6 || (x >= 2 && x <= 4 && y >= 2 && y <= 4));
  const inFinderZone = (x, y) => (x < 8 && y < 8) || (x >= size - 8 && y < 8) || (x < 8 && y >= size - 8);
  let d = '';
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let on;
    if (inFinderZone(x, y)) on = finder(x, y) || finder(x - (size - 7), y) || finder(x, y - (size - 7));
    else if (x === 6 || y === 6) on = (x + y) % 2 === 0;   // timing pattern
    else on = r() > 0.52;
    if (on) d += `M${x} ${y}h1v1h-1z`;
  }
  return `<svg viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" role="img" aria-label="Ticket QR code for ${esc(text)}"><path d="${d}" fill="#111411"/></svg>`;
}

function ticketHTML(s) {
  const paid = s.payment === 'paid';
  return `
  <article class="ticket print-area" aria-label="Event ticket">
    <div class="ticket-main">
      <div class="ticket-top">
        <span class="brand"><span class="brand-mark">//</span><span class="brand-name">${brandHTML(CONFIG.name)}</span></span>
        <span class="badge ${paid ? 'badge-success' : 'badge-warn'}">${paid ? 'Payment confirmed' : 'Payment pending'}</span>
      </div>
      <h2>${esc(s.name)}</h2>
      <p class="who">${esc(s.course)} · ${esc(s.dept)} · Year ${esc(s.year)} — ${esc(s.college)}</p>
      <div class="ticket-grid">
        <div><span>Event</span><strong>${esc(CONFIG.name)} ${esc(CONFIG.edition)}</strong></div>
        <div><span>Date</span><strong>${fmtDate(eventDate())}</strong></div>
        <div><span>Reporting</span><strong>08:30 · Arena opens ${fmtTime(eventDate())}</strong></div>
        <div><span>Venue</span><strong>${esc(CONFIG.venue)}</strong></div>
        <div><span>Registration ID</span><strong>${esc(s.regId)}</strong></div>
        <div><span>Payment</span><strong>${paid ? `${money(CONFIG.fee)} · ${esc(s.method)}` : 'Pending'}</strong></div>
      </div>
    </div>
    <div class="ticket-stub">
      <small>Admit one · Scan at entry</small>
      <div class="qr">${qrSvg(s.ticketId)}</div>
      <div><div class="tid">${esc(s.ticketId)}</div><small>Ticket ID</small></div>
    </div>
  </article>`;
}

function icsFile() {
  const d = eventDate(), end = new Date(d.getTime() + (CONFIG.durationMin + 120) * 60000);
  const f = x => x.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CODE ARENA//Prototype//EN', 'BEGIN:VEVENT',
    `UID:${me().ticketId}@codearena.prototype`, `DTSTAMP:${f(new Date())}`, `DTSTART:${f(d)}`, `DTEND:${f(end)}`,
    `SUMMARY:${CONFIG.name} ${CONFIG.edition}`, `LOCATION:${CONFIG.venue}`,
    `DESCRIPTION:Ticket ${me().ticketId}. Report by 08:30 with your college ID.`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
}

/* =========================================================================
   GLOBAL CHROME — brand text, config bindings, icons, prototype navigator
   ========================================================================= */
function applyConfig() {
  $$('[data-brand]').forEach(el => el.innerHTML = brandHTML(CONFIG.name));
  const paid = participants().filter(p => p.payment === 'paid').length + (store.get('student') ? 1 : 0);
  const values = {
    name: CONFIG.name, edition: CONFIG.edition, venue: CONFIG.venue, fee: money(CONFIG.fee),
    date: fmtDate(eventDate()), dateLong: fmtDate(eventDate(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    time: fmtTime(eventDate()), capacity: CONFIG.capacity, duration: CONFIG.durationMin,
    seatsLeft: Math.max(0, CONFIG.capacity - paid), registered: paid, organiser: CONFIG.organiser
  };
  $$('[data-cfg]').forEach(el => el.textContent = values[el.dataset.cfg]);
  $$('[data-seats-bar]').forEach(el => el.style.width = Math.min(100, paid / CONFIG.capacity * 100) + '%');
  document.title = document.title.replace('CODE//ARENA', CONFIG.name);
}

function hydrateIcons(root = document) {
  $$('[data-icon]', root).forEach(el => { el.outerHTML = icon(el.dataset.icon); });
}

const SCREENS = [
  ['?p=index', 'Landing page', 'Public'],
  ['?p=register', 'Registration & payment', 'Student'],
  ['?p=ticket', 'Digital ticket', 'Student'],
  ['?p=dashboard', 'Student dashboard', 'Student'],
  ['?p=arena', 'Coding arena', 'Student'],
  ['?p=leaderboard', 'Results & leaderboard', 'Public'],
  ['?p=certificate', 'Certificate preview', 'Student'],
  ['?p=admin', 'Admin dashboard', 'Organiser'],
  ['?p=verify', 'Ticket check-in', 'Volunteer']
];
/** Floating "Prototype" menu so presenters can jump between every screen. */
function protoNav() {
  if (document.body.dataset.noProtoNav !== undefined) return;
  const here = '?p=' + PAGE;
  const el = document.createElement('details');
  el.className = 'proto-nav';
  el.innerHTML = `<summary>${icon('list').replace('<svg', '<svg width="15" height="15"')} Prototype screens</summary>
    <nav aria-label="Prototype screens"><p>Jump to</p>
      ${SCREENS.map(([href, label, who]) => `<a href="${href}" class="${href === here ? 'current' : ''}">${label}<span>${who}</span></a>`).join('')}
      <button type="button" data-reset>Reset demo data</button>
    </nav>`;
  document.body.append(el);
  $('[data-reset]', el).onclick = () => modal({
    title: 'Reset demo data?',
    body: '<p>This clears the registration, check-ins, arena code, submissions, question edits and settings saved in this browser.</p>',
    confirm: 'Reset', tone: 'danger',
    onConfirm: () => { store.clearAll(); location.reload(); }
  });
  document.addEventListener('click', e => { if (!el.contains(e.target)) el.open = false; });
}

/** Sidebar navigation for the two dashboards (hash-based views). */
function initAppShell(titles, onShow) {
  const sidebar = $('.sidebar'), scrim = $('.scrim');
  const setOpen = open => { sidebar.classList.toggle('open', open); scrim?.classList.toggle('show', open); };
  $('.menu-btn')?.addEventListener('click', () => setOpen(true));
  scrim?.addEventListener('click', () => setOpen(false));
  const show = () => {
    const id = location.hash.slice(1) || Object.keys(titles)[0];
    if (!titles[id]) return;
    $$('[data-view]').forEach(v => v.hidden = v.dataset.view !== id);
    $$('.side-nav a').forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + id));
    $('.topbar h1').textContent = titles[id];
    setOpen(false);
    window.scrollTo(0, 0);
    onShow?.(id);
  };
  window.addEventListener('hashchange', show);
  show();
}

/* Simple dropdown behaviour for <details class="dropdown"> menus: close on outside click. */
document.addEventListener('click', e => {
  $$('details.dropdown[open]').forEach(d => { if (!d.contains(e.target)) d.open = false; });
});

/* =========================================================================
   PAGE: LANDING
   ========================================================================= */
function initLanding() {
  const nav = $('.site-nav');
  const onScroll = () => nav.classList.toggle('scrolled', scrollY > 8);
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  // Mobile menu
  const menu = $('.mobile-menu'), toggle = $('.nav-toggle');
  toggle.addEventListener('click', () => {
    const open = menu.classList.toggle('open');
    toggle.setAttribute('aria-expanded', open);
  });
  $$('a', menu).forEach(a => a.addEventListener('click', () => { menu.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); }));

  // Hero arena clock ticks down for life
  let left = (1 * 3600 + 42 * 60 + 18) * 1000;
  const clock = $('[data-hero-clock]');
  setInterval(() => { left -= 1000; clock.textContent = fmtClock(left); }, 1000);

  $$('[data-login]').forEach(b => b.addEventListener('click', openLogin));
}

/** Login chooser — simulated roles, no real authentication. */
function openLogin() {
  const s = store.get('student');
  modal({
    title: 'Sign in to ' + CONFIG.name,
    confirm: null, cancel: null,
    body: `<p>Choose how you want to continue. This prototype simulates sign-in — no credentials are collected.</p>
      <div class="choice-list">
        <button class="choice" data-go="${s ? '?p=dashboard' : '?p=register'}">
          <span class="avatar">${icon('user').replace('<svg', '<svg width="16"')}</span>
          <span><strong>Student</strong><span>${s ? `Continue as ${esc(s.name)}` : 'Continue with Google (simulated)'}</span></span><span class="go">→</span></button>
        <button class="choice" data-go="?p=admin">
          <span class="avatar">${icon('shield').replace('<svg', '<svg width="16"')}</span>
          <span><strong>Organiser</strong><span>Admin console — participants, payments, questions</span></span><span class="go">→</span></button>
        <button class="choice" data-go="?p=verify">
          <span class="avatar">${icon('scan').replace('<svg', '<svg width="16"')}</span>
          <span><strong>Check-in volunteer</strong><span>Ticket verification at the venue</span></span><span class="go">→</span></button>
      </div>`,
    onOpen: dlg => $$('[data-go]', dlg).forEach(b => b.onclick = () => location.href = b.dataset.go)
  });
}

/* =========================================================================
   PAGE: REGISTRATION (5 steps)
   ========================================================================= */
const GOOGLE_ACCOUNTS = [
  { name: 'Ananya Reddy', email: 'ananya.reddy@gmail.com' },
  { name: 'Rohan Varma', email: 'rohan.varma21@gmail.com' }
];
const FIELD_RULES = {
  name: [v => /^[A-Za-z][A-Za-z .'-]{2,59}$/.test(v), 'Enter your full name (letters only, at least 3 characters).'],
  email: [v => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v), 'Enter a valid email address.'],
  college: [v => v.length >= 3, 'Enter your college name.'],
  dept: [v => !!v, 'Select your department.'],
  course: [v => !!v, 'Select your course.'],
  year: [v => !!v, 'Select your year of study.'],
  roll: [v => /^[A-Za-z0-9-]{6,15}$/.test(v), 'Roll number should be 6–15 letters or digits.'],
  phone: [v => /^[6-9]\d{9}$/.test(v.replace(/[\s-]/g, '').replace(/^(\+91|0)/, '')), 'Enter a valid 10-digit Indian mobile number.']
};

function initRegister() {
  const state = { step: 1, account: null, method: 'UPI', outcome: 'success' };
  const form = $('#details-form');

  // Populate dropdown options from the same lists the mock data uses
  $('#f-dept').insertAdjacentHTML('beforeend', DEPTS.map(d => `<option>${esc(d)}</option>`).join(''));
  $('#college-list').innerHTML = COLLEGES.map(c => `<option value="${esc(c)}">`).join('');

  const go = step => {
    state.step = step;
    $$('[data-step]').forEach(p => p.hidden = Number(p.dataset.step) !== step);
    $$('.stepper li').forEach((li, i) => {
      li.classList.toggle('active', i + 1 === step);
      li.classList.toggle('done', i + 1 < step);
    });
    $('.order-summary').hidden = step === 5;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Already registered in this browser → jump straight to the confirmation
  const existing = store.get('student');
  if (existing) { showSuccess(existing, true); go(5); }
  else go(1);

  /* Step 1 — Google sign-in simulation */
  $('#google-btn').addEventListener('click', () => modal({
    title: 'Choose an account',
    confirm: null, cancel: null,
    body: `<p>Simulated Google account chooser. Nothing leaves this browser.</p>
      <div class="choice-list">
        ${GOOGLE_ACCOUNTS.map((a, i) => `<button class="choice" data-acc="${i}"><span class="avatar">${initials(a.name)}</span><span><strong>${a.name}</strong><span>${a.email}</span></span></button>`).join('')}
      </div>`,
    onOpen: dlg => $$('[data-acc]', dlg).forEach(b => b.onclick = () => {
      dlg.close();
      state.account = GOOGLE_ACCOUNTS[b.dataset.acc];
      $('#signed-in').hidden = false;
      $('#signed-in').innerHTML = `<span class="avatar">${initials(state.account.name)}</span>
        <div><strong>${esc(state.account.name)}</strong><div class="muted" style="font-size:13px">${esc(state.account.email)}</div></div>
        <span class="badge badge-success" style="margin-left:auto">Verified</span>`;
      $('#step1-next').disabled = false;
      form.name.value ||= state.account.name;
      form.email.value = state.account.email;
      toast(`Signed in as ${state.account.email}`);
    })
  }));
  $('#step1-next').addEventListener('click', () => go(2));

  /* Step 2 — student details with validation */
  const validateField = input => {
    const [test, msg] = FIELD_RULES[input.name];
    const ok = test(input.value.trim());
    const field = input.closest('.field');
    field.classList.toggle('invalid', !ok);
    $('.error', field).textContent = msg;
    input.setAttribute('aria-invalid', !ok);
    return ok;
  };
  $$('input, select', form).forEach(el => {
    el.addEventListener('blur', () => el.value && validateField(el));
    el.addEventListener('input', () => el.closest('.field').classList.contains('invalid') && validateField(el));
  });
  form.addEventListener('submit', e => {
    e.preventDefault();
    const results = $$('input, select', form).map(validateField);
    if (results.includes(false)) {
      $('.field.invalid input, .field.invalid select', form)?.focus();
      toast('Please fix the highlighted fields', 'error');
      return;
    }
    const d = Object.fromEntries(new FormData(form));
    d.phone = d.phone.replace(/[\s-]/g, '').replace(/^(\+91|0)/, '');
    state.details = d;
    renderReview();
    go(3);
  });
  $('#step2-back').addEventListener('click', () => go(1));

  /* Step 3 — review */
  function renderReview() {
    const d = state.details;
    $('#review-list').innerHTML = [
      ['Full name', d.name], ['Email', d.email], ['College', d.college], ['Department', d.dept],
      ['Course', d.course], ['Year', `Year ${d.year}`], ['Roll number', d.roll.toUpperCase()], ['Phone', `+91 ${d.phone}`]
    ].map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('');
  }
  $('#step3-back').addEventListener('click', () => go(2));
  $('#edit-details').addEventListener('click', () => go(2));
  $('#step3-next').addEventListener('click', () => {
    if (!$('#agree').checked) { toast('Please accept the competition rules to continue', 'warn'); $('#agree').focus(); return; }
    go(4);
  });

  /* Step 4 — mock payment */
  $$('.pay-method').forEach(btn => btn.addEventListener('click', () => {
    state.method = btn.dataset.method;
    $$('.pay-method').forEach(b => { b.classList.toggle('active', b === btn); b.setAttribute('aria-pressed', b === btn); });
    $$('[data-pay-panel]').forEach(p => p.hidden = p.dataset.payPanel !== state.method);
  }));
  $$('#outcome button').forEach(btn => btn.addEventListener('click', () => {
    state.outcome = btn.dataset.outcome;
    $$('#outcome button').forEach(b => b.classList.toggle('active', b === btn));
  }));
  $('#upi-qr').innerHTML = qrSvg('upi-codearena-' + CONFIG.fee, 25);
  $('#step4-back').addEventListener('click', () => go(3));

  const payView = which => $$('[data-pay-view]').forEach(v => v.hidden = v.dataset.payView !== which);
  $('#pay-btn').addEventListener('click', () => {
    payView('processing');
    setTimeout(() => {
      if (state.outcome === 'failure') { payView('failed'); toast('Payment failed — no money was deducted (mock)', 'error'); return; }
      const all = participants();
      const r = rng(Date.now());
      const student = {
        ...state.details, roll: state.details.roll.toUpperCase(),
        regId: `CA26-${pad(all.length + 1, 4)}`, ticketId: 'TK-' + randCode(r, 6),
        payment: 'paid', method: state.method, txn: 'pay_' + randCode(r, 12), paidAt: new Date().toISOString()
      };
      store.set('student', student);
      showSuccess(student);
      go(5);
      toast('Payment successful — ticket generated');
    }, 1800);
  });
  $('#retry-btn').addEventListener('click', () => payView('form'));

  function showSuccess(s, returning = false) {
    $('#success-title').textContent = returning ? `You're already registered, ${s.name.split(' ')[0]}` : `You're in, ${s.name.split(' ')[0]}.`;
    $('#success-reg').textContent = s.regId;
    $('#success-ticket').textContent = s.ticketId;
    $('#success-mail').textContent = s.email;
  }
  $('#new-reg').addEventListener('click', () => modal({
    title: 'Start a new registration?',
    body: '<p>The registration saved in this browser will be replaced. Use this to demo the flow again.</p>',
    confirm: 'Start over', tone: 'danger',
    onConfirm: () => { store.remove('student'); location.reload(); }
  }));
}

/* =========================================================================
   PAGE: TICKET
   ========================================================================= */
function initTicket() {
  const s = me();
  $('#ticket-slot').innerHTML = ticketHTML(s);
  $('#demo-note').hidden = !s.demo;
  $('#print-ticket').onclick = () => window.print();
  $('#copy-ticket').onclick = () => copyText(s.ticketId, `Ticket ID ${s.ticketId} copied`);
  $('#add-cal').onclick = () => { downloadFile(`${CONFIG.name.replace(/\W+/g, '-')}.ics`, icsFile(), 'text/calendar'); toast('Calendar file downloaded'); };
  if (new URLSearchParams(location.search).has('print')) setTimeout(() => window.print(), 400);
}

/* =========================================================================
   PAGE: STUDENT DASHBOARD
   ========================================================================= */
const ANNOUNCEMENTS = [
  { when: '2 days ago', title: 'Practice arena is open', body: 'Get comfortable with the editor and the judge before the event. Practice submissions are not scored.', pinned: true },
  { when: '5 days ago', title: 'Reporting time: 08:30', body: 'Carry your college ID card and your digital ticket. Check-in closes at 09:15 sharp.' },
  { when: '1 week ago', title: 'Compiler versions published', body: 'C (GCC 13), C++17 (G++ 13), Python 3.12 and Java 21 are supported in the arena.' }
];

function initDashboard() {
  const s = me();
  const first = s.name.split(' ')[0];
  const hour = new Date().getHours();
  $('#greeting').textContent = `${hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'}, ${first}`;
  $$('[data-me]').forEach(el => el.textContent = s[el.dataset.me]);
  $$('[data-me-initials]').forEach(el => el.textContent = initials(s.name));
  $('#demo-banner').hidden = !s.demo;

  const comp = compState();
  $('#comp-status').innerHTML = `<span class="badge ${COMP_BADGE[comp.status]}">${COMP_LABEL[comp.status]}</span>`;
  $('#arena-status').innerHTML = `<span class="badge ${COMP_BADGE[comp.status]}">${COMP_LABEL[comp.status]}</span>`;
  $('#arena-copy').textContent = comp.status === 'live'
    ? 'The competition is live. Enter the arena now — your timer is already running.'
    : comp.status === 'scheduled'
      ? 'The arena opens on event day. Until then you can use it as a practice room; nothing you submit now is scored.'
      : 'The competition has ended. You can still open the arena in read-only practice mode.';

  // Countdown to event start
  const tick = () => {
    let ms = Math.max(0, eventDate() - Date.now());
    const parts = [864e5, 36e5, 6e4, 1e3].map(u => { const v = Math.floor(ms / u); ms -= v * u; return v; });
    $$('#countdown strong').forEach((el, i) => el.textContent = pad(parts[i]));
  };
  tick(); setInterval(tick, 1000);

  $('#announcements').innerHTML = ANNOUNCEMENTS.map(a => `<li>
    <div class="when">${a.pinned ? '<span class="pin">Pinned</span> ·' : ''} ${a.when}</div>
    <h4>${esc(a.title)}</h4><p>${esc(a.body)}</p></li>`).join('');
  $('#notif-list').innerHTML = ANNOUNCEMENTS.map(a => `<a href="#overview"><strong>${esc(a.title)}</strong><span>${a.when}</span></a>`).join('');

  // Registration details
  $('#reg-details').innerHTML = [
    ['Registration ID', s.regId], ['Full name', s.name], ['Email', s.email], ['Phone', '+91 ' + s.phone],
    ['College', s.college], ['Department', s.dept], ['Course', `${s.course} · Year ${s.year}`], ['Roll number', s.roll]
  ].map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('');
  $('#pay-details').innerHTML = [
    ['Status', 'Paid'], ['Amount', money(CONFIG.fee)], ['Method', s.method], ['Transaction', s.txn],
    ['Paid on', `${fmtDate(s.paidAt)} · ${fmtTime(s.paidAt)}`]
  ].map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('');
  $('#receipt-btn').onclick = () => {
    const lines = [`${CONFIG.name} ${CONFIG.edition} — Payment receipt (prototype)`, '', `Registration ID : ${s.regId}`, `Name            : ${s.name}`, `Amount          : INR ${CONFIG.fee}`, `Method          : ${s.method}`, `Transaction     : ${s.txn}`, `Paid on         : ${new Date(s.paidAt).toLocaleString('en-IN')}`, '', 'This is a mock receipt. No real payment was processed.'];
    downloadFile(`receipt-${s.regId}.txt`, lines.join('\n'));
    toast('Receipt downloaded');
  };

  // Ticket
  $('#dash-ticket').innerHTML = ticketHTML(s);
  $('#dash-copy').onclick = () => copyText(s.ticketId, `Ticket ID ${s.ticketId} copied`);
  $('#dash-cal').onclick = () => { downloadFile('event.ics', icsFile(), 'text/calendar'); toast('Calendar file downloaded'); };

  // Arena entry confirmation
  $$('[data-enter-arena]').forEach(b => b.addEventListener('click', () => modal({
    title: 'Enter the competition arena?',
    body: `<p>The arena opens in fullscreen. Leaving fullscreen or switching tabs is recorded and visible to organisers.</p>
      <p style="margin-top:10px" class="muted">Note: a browser cannot block operating-system shortcuts — the prototype only detects and logs tab switches.</p>`,
    confirm: 'Enter arena', onConfirm: () => { location.href = '?p=arena'; }
  })));

  renderMyResults();
  renderCerts();

  // Profile
  const pf = $('#profile-form');
  ['name', 'email', 'phone', 'college', 'dept', 'roll'].forEach(k => pf[k].value = s[k]);
  pf.addEventListener('submit', e => {
    e.preventDefault();
    const name = pf.name.value.trim(), phone = pf.phone.value.trim();
    if (!FIELD_RULES.name[0](name)) return toast(FIELD_RULES.name[1], 'error');
    if (!FIELD_RULES.phone[0](phone)) return toast(FIELD_RULES.phone[1], 'error');
    const updated = { ...s, name, phone, college: pf.college.value.trim() || s.college };
    delete updated.demo;
    store.set('student', updated);
    toast('Profile saved');
    setTimeout(() => location.reload(), 600);
  });
  $$('[data-signout]').forEach(b => b.onclick = () => modal({
    title: 'Sign out?', body: '<p>You will return to the public site. Your registration stays saved in this browser.</p>',
    confirm: 'Sign out', onConfirm: () => { location.href = '?p=index'; }
  }));

  initAppShell({ overview: 'Overview', registration: 'My registration', ticket: 'My ticket', arena: 'Competition arena', results: 'Results', certificates: 'Certificates', profile: 'Profile' });
}

function renderMyResults() {
  const mine = myResult();
  const el = $('#my-results');
  if (!mine) {
    el.innerHTML = `<div class="card empty"><p style="color:var(--text);font-weight:600;font-size:15px">No submissions yet</p>
      <p style="margin-top:6px">Solve a problem in the arena and your score, rank and breakdown appear here.</p>
      <div style="margin-top:20px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap"><button class="btn btn-primary btn-sm" data-enter-arena>Open arena</button><a class="btn btn-secondary btn-sm" href="?p=leaderboard">View leaderboard</a></div></div>`;
    $('[data-enter-arena]', el).onclick = () => location.href = '?p=arena';
    return;
  }
  const rank = leaderboard().find(r => r.isMe)?.rank;
  const qs = questions();
  el.innerHTML = `
    <div class="grid g-4">
      <div class="card kpi"><div class="label">Score</div><div class="value">${mine.score}<small> / ${qs.reduce((a, q) => a + q.points, 0)}</small></div></div>
      <div class="card kpi"><div class="label">Rank</div><div class="value">${rank ? '#' + rank : '—'}<small> of ${sampleResults().length + 1}</small></div></div>
      <div class="card kpi"><div class="label">Solved</div><div class="value">${mine.solvedCount}<small> / ${qs.length}</small></div></div>
      <div class="card kpi"><div class="label">Completion time</div><div class="value">${fmtMins(mine.completion)}</div></div>
    </div>
    <div class="card mt"><div class="card-head"><h3>Per-problem breakdown</h3><a class="btn btn-ghost btn-sm" href="?p=leaderboard">Full leaderboard →</a></div>
      <div class="table-wrap"><table class="table"><thead><tr><th>Problem</th><th>Status</th><th>Attempts</th><th>Accepted at</th><th class="right">Points</th></tr></thead><tbody>
      ${qs.map((q, i) => `<tr><td class="strong">${q.id}. ${esc(q.title)}</td>
        <td>${mine.solved[i] ? '<span class="badge badge-success">Accepted</span>' : mine.attempts[i] ? '<span class="badge badge-danger">Not solved</span>' : '<span class="badge">Not attempted</span>'}</td>
        <td class="num">${mine.attempts[i] || 0}</td><td class="num">${fmtMins(mine.times[i])}</td>
        <td class="right num strong">${mine.solved[i] ? Math.max(q.points - 10 * (mine.attempts[i] - 1), q.points / 2) : 0}</td></tr>`).join('')}
      </tbody></table></div></div>`;
}

function renderCerts() {
  const s = me(), mine = myResult();
  const rank = mine ? leaderboard().find(r => r.isMe)?.rank : null;
  const achievement = rank && rank <= 10;
  const link = (type, title) => `?p=certificate&type=${type}&name=${encodeURIComponent(s.name)}${title ? '&title=' + encodeURIComponent(title) : ''}`;
  $('#cert-list').innerHTML = `
    <div class="card"><div class="card-head"><div><h3>Certificate of participation</h3><p class="muted" style="font-size:13px;margin-top:2px">Issued to every checked-in participant</p></div>
      <span class="badge badge-success">Available</span></div>
      <div class="card-body" style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn btn-secondary btn-sm" href="${link('participation')}">${icon('eye')} Preview</a><a class="btn btn-ghost btn-sm" href="${link('participation')}&print=1">${icon('download')} Download PDF</a></div></div>
    <div class="card"><div class="card-head"><div><h3>Certificate of achievement</h3><p class="muted" style="font-size:13px;margin-top:2px">Top 10 finishers and podium winners</p></div>
      <span class="badge ${achievement ? 'badge-success' : ''}">${achievement ? 'Available' : 'Locked'}</span></div>
      <div class="card-body" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      ${achievement
        ? `<a class="btn btn-secondary btn-sm" href="${link('achievement', rank <= 3 ? ['Winner', 'First Runner-up', 'Second Runner-up'][rank - 1] : 'Top 10 Finisher')}">${icon('eye')} Preview</a>`
        : `<span class="muted" style="font-size:13px">Finish in the top 10 to unlock.</span><a class="btn btn-ghost btn-sm" href="${link('achievement', 'Winner')}">Preview sample</a>`}
      </div></div>`;
}

/* =========================================================================
   PAGE: CHECK-IN VERIFICATION
   ========================================================================= */
function initVerify() {
  const tickets = ticketIndex();
  const log = store.get('scanlog', []);
  const ids = [...tickets.keys()];

  const renderCounter = () => {
    const n = Object.keys(checkins()).length;
    $('#ci-count').innerHTML = `${n}<small> / ${tickets.size}</small>`;
    $('#ci-bar').style.width = (n / tickets.size * 100) + '%';
  };
  const renderLog = () => {
    $('#scan-log').innerHTML = log.length
      ? log.slice(0, 8).map(l => `<li><div><strong style="font-weight:550">${esc(l.id)}</strong> <span class="badge ${{ valid: 'badge-success', dup: 'badge-warn', invalid: 'badge-danger' }[l.result]}" style="margin-left:6px">${{ valid: 'Admitted', dup: 'Duplicate', invalid: 'Invalid' }[l.result]}</span></div><span>${fmtTime(l.at)}</span></li>`).join('')
      : '<li><span>No scans yet this session.</span></li>';
  };

  /** Core verification: valid → admit, already used → duplicate, unknown → invalid. */
  function verify(raw) {
    const id = raw.trim().toUpperCase().replace(/^TK(?!-)/, 'TK-');
    if (!id) { toast('Enter a ticket ID', 'warn'); return; }
    const person = tickets.get(id);
    const map = checkins();
    let result;
    const box = $('#result');
    if (!person) {
      result = 'invalid';
      box.className = 'result invalid';
      box.innerHTML = `<span class="r-icon">${icon('x')}</span><div><h3>Invalid ticket</h3><p><strong>${esc(id)}</strong> does not match any paid registration. Ask the student to open their ticket in the dashboard, or send them to the help desk.</p></div>`;
    } else if (map[id]) {
      result = 'dup';
      box.className = 'result dup';
      box.innerHTML = `<span class="r-icon">${icon('alert')}</span><div><h3>Already checked in</h3><p>${esc(person.name)} was admitted at <strong>${fmtTime(map[id])}</strong>. Do not admit again — verify the college ID if this looks wrong.</p></div>`;
    } else {
      result = 'valid';
      map[id] = new Date().toISOString();
      store.set('checkins', map);
      box.className = 'result valid';
      box.innerHTML = `<span class="r-icon">${icon('check')}</span><div><h3>Admit ${esc(person.name)}</h3><p>${esc(person.college)} · ${esc(person.dept)}<br>${esc(person.regId)} · Payment confirmed</p></div>`;
    }
    box.hidden = false;
    log.unshift({ id, result, at: new Date().toISOString() });
    store.set('scanlog', log.slice(0, 50));
    navigator.vibrate?.(result === 'valid' ? 60 : [60, 60, 60]);
    renderCounter(); renderLog();
  }

  $('#verify-form').addEventListener('submit', e => { e.preventDefault(); verify($('#ticket-input').value); });
  $('#simulate-scan').onclick = () => {
    const sc = $('.scanner');
    sc.classList.add('paused');
    $('.cam-label', sc).textContent = 'Reading code…';
    setTimeout(() => {
      sc.classList.remove('paused');
      $('.cam-label', sc).textContent = 'Point the camera at a ticket QR';
      const unused = ids.filter(id => !checkins()[id]);
      const id = unused[Math.floor(Math.random() * unused.length)] || ids[0];
      $('#ticket-input').value = id;
      verify(id);
    }, 700);
  };
  // Demo chips: a valid ID, this browser's own ticket, and a made-up one
  const sample = [ids[3], me().ticketId, 'TK-000000'];
  $('#sample-ids').innerHTML = sample.map(id => `<button class="chip" type="button">${esc(id)}</button>`).join('');
  $$('#sample-ids .chip').forEach(c => c.onclick = () => { $('#ticket-input').value = c.textContent; verify(c.textContent); });

  renderCounter(); renderLog();
}

/* =========================================================================
   PAGE: LEADERBOARD
   ========================================================================= */
function initLeaderboard() {
  const rows = leaderboard();
  const qs = questions();
  const comp = compState();
  $('#lb-status').innerHTML = comp.status === 'published'
    ? '<span class="badge badge-success">Final results</span>'
    : '<span class="badge badge-warn">Provisional — sample data</span>';

  // Podium
  $('#podium').innerHTML = rows.slice(0, 3).map((r, i) => `
    <button class="podium-item p${i + 1}" data-rank="${r.rank}">
      <div class="place"><span>${['Winner', 'First runner-up', 'Second runner-up'][i]}</span><b>${r.rank}</b></div>
      <h3>${esc(r.p.name)}${r.isMe ? ' (you)' : ''}</h3><div class="college">${esc(r.p.college)}</div>
      <div class="meta"><span><strong>${r.score}</strong> pts</span><span><strong>${r.solvedCount}/3</strong> solved</span><span><strong>${fmtMins(r.completion)}</strong></span></div>
    </button>`).join('');

  $('#lb-college').insertAdjacentHTML('beforeend', COLLEGES.map(c => `<option>${esc(c)}</option>`).join(''));

  let sort = { key: 'rank', dir: 1 }, limit = 50;
  const keyFn = {
    rank: r => r.rank, name: r => r.p.name, college: r => r.p.college, solved: r => r.solvedCount,
    score: r => r.score, time: r => r.completion ?? 1e9
  };
  const render = () => {
    const q = $('#lb-search').value.trim().toLowerCase();
    const college = $('#lb-college').value;
    const list = rows
      .filter(r => (!q || r.p.name.toLowerCase().includes(q) || r.p.college.toLowerCase().includes(q)) && (!college || r.p.college === college))
      .sort((a, b) => { const x = keyFn[sort.key](a), y = keyFn[sort.key](b); return (x > y ? 1 : x < y ? -1 : 0) * sort.dir; });
    $('#lb-more').hidden = list.length <= limit;
    $('#lb-body').innerHTML = list.length ? list.slice(0, limit).map(r => `
      <tr class="clickable" data-rank="${r.rank}" ${r.isMe ? 'style="background:var(--accent-soft)"' : ''}>
        <td class="rank-cell ${r.rank <= 3 ? 'top' : ''}">${pad(r.rank)}</td>
        <td><div class="cell-person"><span class="avatar">${initials(r.p.name)}</span><div><strong style="color:var(--text);font-weight:550">${esc(r.p.name)}${r.isMe ? ' · You' : ''}</strong><small>${esc(r.p.dept)}</small></div></div></td>
        <td>${esc(r.p.college)}</td>
        <td><span class="solved-dots">${qs.map((qq, i) => `<i class="${r.solved[i] ? 'on' : ''}" title="${qq.id}: ${r.solved[i] ? 'solved' : 'not solved'}">${qq.id}</i>`).join('')}</span></td>
        <td class="num strong">${r.score}</td>
        <td class="num">${fmtMins(r.completion)}</td>
      </tr>`).join('') : `<tr><td colspan="6"><div class="empty">No students match “${esc(q)}”.</div></td></tr>`;
    $('#lb-count').textContent = `Showing ${Math.min(limit, list.length)} of ${list.length}`;
    $$('.th-sort').forEach(th => th.className = 'th-sort' + (th.dataset.sort === sort.key ? (sort.dir === 1 ? ' asc' : ' desc') : ''));
  };
  $$('.th-sort').forEach(th => th.addEventListener('click', () => {
    sort = { key: th.dataset.sort, dir: sort.key === th.dataset.sort ? -sort.dir : (['score', 'solved'].includes(th.dataset.sort) ? -1 : 1) };
    render();
  }));
  $('#lb-search').addEventListener('input', () => { limit = 50; render(); });
  $('#lb-more').onclick = () => { limit += 50; render(); };
  $('#lb-college').addEventListener('change', render);
  document.addEventListener('click', e => {
    const hit = e.target.closest('[data-rank]');
    if (hit) showResultDetail(rows.find(r => r.rank === Number(hit.dataset.rank)));
  });
  $('#lb-export').onclick = () => {
    const csv = [['Rank', 'Name', 'College', 'Solved', 'Score', 'Completion'], ...rows.map(r => [r.rank, r.p.name, r.p.college, r.solvedCount, r.score, fmtMins(r.completion)])]
      .map(line => line.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    downloadFile('leaderboard.csv', csv, 'text/csv'); toast('Leaderboard exported');
  };
  render();
}

/** Individual result + performance breakdown modal. */
function showResultDetail(r) {
  const qs = questions();
  const max = qs.reduce((a, q) => a + q.points, 0);
  modal({
    title: `${r.p.name} — rank #${r.rank}`, wide: true, confirm: null, cancel: 'Close',
    body: `
      <p>${esc(r.p.college)} · ${esc(r.p.dept)} · ${esc(r.lang)}</p>
      <div class="grid g-3 mt">
        <div class="card kpi"><div class="label">Score</div><div class="value">${r.score}<small> / ${max}</small></div></div>
        <div class="card kpi"><div class="label">Solved</div><div class="value">${r.solvedCount}<small> / ${qs.length}</small></div></div>
        <div class="card kpi"><div class="label">Completion</div><div class="value">${fmtMins(r.completion)}</div></div>
      </div>
      <h4 style="margin:22px 0 8px;color:var(--text);font-size:14px">Points by problem</h4>
      ${qs.map((q, i) => {
        const got = r.solved[i] ? Math.max(q.points - 10 * (r.attempts[i] - 1), q.points / 2) : 0;
        return `<div class="bar-row"><span>${q.id}. ${esc(q.title)}</span><div class="track"><span style="width:${got / q.points * 100}%"></span></div><span class="v">${got}/${q.points}</span></div>`;
      }).join('')}
      <div class="table-wrap mt" style="border:1px solid var(--border);border-radius:var(--r)"><table class="table"><thead><tr><th>Problem</th><th>Verdict</th><th>Attempts</th><th>Accepted at</th></tr></thead><tbody>
      ${qs.map((q, i) => `<tr><td class="strong">${q.id}</td><td>${r.solved[i] ? '<span class="badge badge-success">Accepted</span>' : '<span class="badge badge-danger">Unsolved</span>'}</td><td class="num">${r.attempts[i]}</td><td class="num">${fmtMins(r.times[i])}</td></tr>`).join('')}
      </tbody></table></div>`
  });
}

/* =========================================================================
   PAGE: CERTIFICATE
   ========================================================================= */
function initCertificate() {
  const params = new URLSearchParams(location.search);
  const f = $('#cert-form');
  f.name.value = params.get('name') || me().name;
  f.type.value = params.get('type') === 'achievement' ? 'achievement' : 'participation';
  if (params.get('title')) f.title.value = params.get('title');
  f.date.value = (eventDate().toISOString() || '').slice(0, 10);

  const render = () => {
    const name = f.name.value.trim() || 'Student Name';
    const achievement = f.type.value === 'achievement';
    $('#title-field').hidden = !achievement;
    $('#c-title').textContent = achievement ? 'Certificate of Achievement' : 'Certificate of Participation';
    $('#c-name').textContent = name;
    $('#c-achievement').hidden = !achievement;
    $('#c-achievement').textContent = f.title.value;
    $('#c-text').textContent = achievement
      ? `for outstanding performance as ${f.title.value} in ${CONFIG.name} ${CONFIG.edition}, an inter-college competitive programming contest of three algorithmic challenges, held on ${fmtDate(eventDate(), { day: 'numeric', month: 'long', year: 'numeric' })}.`
      : `for participating in ${CONFIG.name} ${CONFIG.edition}, an inter-college competitive programming contest of three algorithmic challenges, held on ${fmtDate(eventDate(), { day: 'numeric', month: 'long', year: 'numeric' })} at ${CONFIG.venue}.`;
    const id = `CA26-${achievement ? 'ACH' : 'PRT'}-${(hashStr(name + f.type.value) >>> 0).toString(36).toUpperCase().slice(0, 6).padStart(6, '0')}`;
    $('#c-id').textContent = id;
    $('#c-date').textContent = f.date.value ? fmtDate(f.date.value, { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
    $('#cert-id-label').textContent = id;
  };
  f.addEventListener('input', render);
  render();
  $('#print-cert').onclick = () => window.print();
  $('#copy-cert').onclick = () => copyText($('#c-id').textContent, 'Certificate ID copied');
  if (params.has('print')) setTimeout(() => window.print(), 500);
}

/* =========================================================================
   BOOT
   ========================================================================= */
/** All screens live in index.html as <template id="page-X">; ?p=X picks which one is mounted. */
let PAGE = new URLSearchParams(location.search).get('p') || 'index';
function mountPage() {
  if (!document.getElementById('page-' + PAGE)) PAGE = 'index';
  const t = document.getElementById('page-' + PAGE), d = t.dataset;
  document.title = d.title;
  document.body.dataset.page = d.bodyPage;
  if (d.bodyClass) document.body.className = d.bodyClass;
  if (d.noProtoNav !== undefined) document.body.dataset.noProtoNav = '';
  const content = t.content;
  $$('template[id^="page-"]').forEach(el => el.remove());
  document.body.prepend(content);
}

document.addEventListener('DOMContentLoaded', () => {
  mountPage();
  hydrateIcons();
  applyConfig();
  ({
    landing: initLanding, register: initRegister, ticket: initTicket, dashboard: initDashboard,
    verify: initVerify, leaderboard: initLeaderboard, certificate: initCertificate,
    admin: initAdmin, arena: initArena
  })[document.body.dataset.page]?.();
  protoNav();
});

/* =========================================================================
   CODE//ARENA — Admin console.
   Reads the same mock data as the student screens (script.js) and writes
   organiser actions to localStorage so other screens react to them.
   ========================================================================= */

function initAdmin() {
  /** All registrations, including the one made in this browser (if any). */
  const everyone = () => {
    const s = store.get('student');
    return s ? [...participants(), { ...s, ticket: 'issued', registeredAt: new Date(s.paidAt).getTime(), isYou: true }] : participants();
  };
  const PAGE = 15;
  const statusBadge = {
    paid: '<span class="badge badge-success">Paid</span>',
    pending: '<span class="badge badge-warn">Pending</span>',
    failed: '<span class="badge badge-danger">Failed</span>'
  };
  const ticketBadge = t => t === 'issued' ? '<span class="badge badge-success">Issued</span>' : t === 'revoked' ? '<span class="badge badge-danger">Revoked</span>' : '<span class="badge">Not issued</span>';
  const ciBadge = id => checkins()[id] ? `<span class="badge badge-success">${fmtTime(checkins()[id])}</span>` : '<span class="badge">Not yet</span>';
  const kpi = (label, value, sub = '', extra = '') => `<div class="card kpi"><div class="label">${label}</div><div class="value">${value}</div>${sub ? `<div class="sub">${sub}</div>` : ''}${extra}</div>`;
  const counts = () => {
    const list = everyone();
    const paid = list.filter(p => p.payment === 'paid').length;
    return { list, total: list.length, paid, pending: list.filter(p => p.payment === 'pending').length, failed: list.filter(p => p.payment === 'failed').length, checked: Object.keys(checkins()).length };
  };
  const setComp = patch => { store.set('comp', { ...compState(), ...patch }); renderChrome(); };

  /* ---------- Chrome: nav counts + competition badge ---------- */
  function renderChrome() {
    const c = counts(), comp = compState();
    $('#nav-participants').textContent = c.total;
    $('#nav-pending').textContent = c.pending || '';
    $('#top-comp').innerHTML = `<span class="badge ${COMP_BADGE[comp.status]} hide-sm">Competition: ${COMP_LABEL[comp.status]}</span>`;
  }

  /* =======================================================================
     OVERVIEW — KPIs + charts (CSS bars, stacked bar, ring)
     ======================================================================= */
  function renderOverview() {
    const c = counts(), comp = compState(), sim = store.get('sim', {});
    const day = 864e5, last24 = c.list.filter(p => Date.now() - p.registeredAt < day).length;
    const competing = comp.status === 'live' ? (sim.active || 0) : comp.status === 'scheduled' ? 0 : sampleResults().length;
    const fill = c.paid / CONFIG.capacity * 100;
    $('#kpis').innerHTML = [
      kpi('Total capacity', CONFIG.capacity, `${fill.toFixed(0)}% of seats taken`, `<div class="progress"><span style="width:${Math.min(100, fill)}%"></span></div>`),
      kpi('Registrations', c.total, `+${last24} in the last 24 hours`),
      kpi('Paid participants', c.paid, `${money(c.paid * CONFIG.fee)} collected`),
      kpi('Pending payments', c.pending, `${c.failed} failed · follow up in Payments`),
      kpi('Checked in', `${c.checked}<small> / ${c.paid}</small>`, c.checked ? `${(c.checked / c.paid * 100).toFixed(1)}% arrived` : 'Gates open on event day'),
      kpi('Competition participants', competing, comp.status === 'scheduled' ? 'Arena opens on event day' : COMP_LABEL[comp.status]),
      kpi('Certificates issued', store.get('certsIssued', 0), store.get('certsIssued', 0) ? 'Delivered to dashboards' : 'Not issued yet'),
      kpi('Seats left', Math.max(0, CONFIG.capacity - c.paid), `${money(CONFIG.fee)} per seat`)
    ].join('');

    // Registrations per day — last 14 days
    const days = Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - 13 + i); return d; });
    const perDay = days.map(d => c.list.filter(p => p.registeredAt >= d.getTime() && p.registeredAt < d.getTime() + day).length);
    const max = Math.max(...perDay, 1);
    $('#chart-days').innerHTML = `<div class="gridlines"><i></i><i></i><i></i><i></i></div>` + perDay.map((n, i) =>
      `<div class="col ${i === 13 ? 'today' : ''}"><span style="height:${n / max * 100}%"></span><div class="tip"><strong>${n}</strong> registrations · ${fmtDate(days[i], { day: 'numeric', month: 'short' })}</div></div>`).join('');
    $('#chart-days-axis').innerHTML = days.map((d, i) => `<span>${i % 2 === 0 || i === 13 ? (i === 13 ? 'Today' : d.getDate()) : ''}</span>`).join('');

    // Capacity ring
    $('#capacity').innerHTML = `
      <div class="ring" style="background:conic-gradient(var(--accent) 0 ${fill}%, var(--elev) ${fill}% 100%)" role="img" aria-label="${c.paid} of ${CONFIG.capacity} seats filled"><div><div><strong>${fill.toFixed(0)}%</strong><small>filled</small></div></div></div>
      <div style="display:grid;gap:12px;font-size:14px;flex:1;min-width:160px">
        <div style="display:flex;justify-content:space-between"><span class="text-2">Confirmed seats</span><strong class="num">${c.paid}</strong></div>
        <div style="display:flex;justify-content:space-between"><span class="text-2">Awaiting payment</span><strong class="num">${c.pending}</strong></div>
        <div style="display:flex;justify-content:space-between"><span class="text-2">Remaining</span><strong class="num">${Math.max(0, CONFIG.capacity - c.paid)}</strong></div>
      </div>`;

    // Payment status stacked bar (status colours always paired with labels)
    const parts = [['Paid', c.paid, 'var(--accent)'], ['Pending', c.pending, 'var(--warn)'], ['Failed', c.failed, 'var(--danger)']];
    $('#chart-pay').innerHTML = `<div class="stack" role="img" aria-label="Payment status split">${parts.map(([l, n, col]) => `<span style="width:${n / c.total * 100}%;background:${col}" title="${l}: ${n}"></span>`).join('')}</div>
      <div class="legend">${parts.map(([l, n, col]) => `<span><i style="background:${col}"></i>${l}<b>${n}</b></span>`).join('')}</div>
      <hr class="divider" style="margin:18px 0">
      <div style="display:flex;justify-content:space-between;font-size:14px"><span class="text-2">Revenue collected</span><strong class="num">${money(c.paid * CONFIG.fee)}</strong></div>
      <div style="display:flex;justify-content:space-between;font-size:14px;margin-top:10px"><span class="text-2">Outstanding</span><strong class="num">${money(c.pending * CONFIG.fee)}</strong></div>`;

    // Department breakdown (single hue, magnitude)
    const byDept = DEPTS.map(d => [d, c.list.filter(p => p.dept === d).length]).sort((a, b) => b[1] - a[1]);
    const dmax = byDept[0][1];
    $('#chart-dept').innerHTML = byDept.map(([d, n]) => `<div class="bar-row" style="grid-template-columns:150px 1fr 44px"><span class="text-2">${esc(d)}</span><div class="track"><span style="width:${n / dmax * 100}%"></span></div><span class="v">${n}</span></div>`).join('');
  }

  /* =======================================================================
     PARTICIPANTS — search, filters, pagination, details, CSV export
     ======================================================================= */
  let pPage = 0;
  $('#p-dept').insertAdjacentHTML('beforeend', DEPTS.map(d => `<option>${esc(d)}</option>`).join(''));
  const filteredPeople = () => {
    const q = $('#p-search').value.trim().toLowerCase(), pay = $('#p-pay').value, ci = $('#p-ci').value, dept = $('#p-dept').value;
    const map = checkins();
    return everyone().filter(p =>
      (!q || [p.name, p.email, p.roll, p.regId, p.ticketId].some(v => v.toLowerCase().includes(q))) &&
      (!pay || p.payment === pay) && (!dept || p.dept === dept) &&
      (!ci || (ci === 'yes') === !!map[p.ticketId])
    ).sort((a, b) => b.registeredAt - a.registeredAt);
  };
  function renderParticipants() {
    const list = filteredPeople();
    const pages = Math.max(1, Math.ceil(list.length / PAGE));
    pPage = Math.min(pPage, pages - 1);
    $('#p-body').innerHTML = list.length ? list.slice(pPage * PAGE, pPage * PAGE + PAGE).map(p => `
      <tr class="clickable" data-reg="${p.regId}">
        <td><div class="cell-person"><span class="avatar">${initials(p.name)}</span><div><strong>${esc(p.name)}${p.isYou ? ' <span class="badge badge-info plain" style="margin-left:4px">This browser</span>' : ''}</strong><small>${esc(p.email)}</small></div></div></td>
        <td class="num">${p.regId}</td><td>${esc(p.college)}</td><td>${esc(p.dept)} · ${p.year}</td>
        <td>${statusBadge[p.payment]}</td><td>${ticketBadge(p.ticket)}</td><td>${ciBadge(p.ticketId)}</td>
        <td class="num">${fmtDate(p.registeredAt, { day: 'numeric', month: 'short' })}</td>
      </tr>`).join('') : '<tr><td colspan="8"><div class="empty">No participants match these filters.</div></td></tr>';
    $('#p-count').textContent = `${list.length} participant${list.length === 1 ? '' : 's'}`;
    $('#p-page').textContent = `${pPage + 1} / ${pages}`;
    $('#p-prev').disabled = pPage === 0;
    $('#p-next').disabled = pPage >= pages - 1;
  }
  ['#p-search', '#p-pay', '#p-ci', '#p-dept'].forEach(sel => $(sel).addEventListener('input', () => { pPage = 0; renderParticipants(); }));
  $('#p-prev').onclick = () => { pPage--; renderParticipants(); };
  $('#p-next').onclick = () => { pPage++; renderParticipants(); };
  $('#p-body').addEventListener('click', e => {
    const row = e.target.closest('[data-reg]');
    if (row) personModal(everyone().find(p => p.regId === row.dataset.reg));
  });
  $('#export-csv').onclick = () => {
    const list = filteredPeople(), map = checkins();
    const head = ['Registration ID', 'Name', 'Email', 'Phone', 'College', 'Department', 'Course', 'Year', 'Roll number', 'Payment', 'Method', 'Transaction', 'Ticket ID', 'Ticket', 'Checked in at', 'Registered at'];
    const rows = list.map(p => [p.regId, p.name, p.email, p.phone, p.college, p.dept, p.course, p.year, p.roll, p.payment, p.method, p.txn, p.ticketId, p.ticket, map[p.ticketId] || '', new Date(p.registeredAt).toISOString()]);
    const csv = [head, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    downloadFile(`participants-${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv');
    toast(`Exported ${list.length} participants`);
  };

  /** Participant details with the actions an organiser actually needs. */
  function personModal(p) {
    const ci = checkins()[p.ticketId];
    modal({
      title: p.name, wide: true, confirm: null, cancel: 'Close',
      body: `<div class="drawer-grid" style="margin-top:8px">
          <dl class="kv"><dt>Registration</dt><dd>${p.regId}</dd><dt>Email</dt><dd>${esc(p.email)}</dd><dt>Phone</dt><dd>+91 ${esc(p.phone)}</dd><dt>College</dt><dd>${esc(p.college)}</dd><dt>Programme</dt><dd>${esc(p.course)} · ${esc(p.dept)} · Year ${p.year}</dd><dt>Roll number</dt><dd>${esc(p.roll)}</dd></dl>
          <dl class="kv"><dt>Payment</dt><dd>${statusBadge[p.payment]}</dd><dt>Method</dt><dd>${esc(p.method)}</dd><dt>Transaction</dt><dd>${esc(p.txn)}</dd><dt>Ticket</dt><dd>${p.ticketId} ${ticketBadge(p.ticket)}</dd><dt>Check-in</dt><dd>${ci ? `${fmtDate(ci)} · ${fmtTime(ci)}` : 'Not checked in'}</dd><dt>Registered</dt><dd>${fmtDate(p.registeredAt)} · ${fmtTime(p.registeredAt)}</dd></dl>
        </div>
        <div style="display:flex;gap:8px;margin-top:24px;flex-wrap:wrap">
          ${p.payment !== 'paid' ? '<button class="btn btn-primary btn-sm" data-a="paid">Mark as paid</button><button class="btn btn-secondary btn-sm" data-a="remind">Send payment reminder</button>' : ''}
          ${p.payment === 'paid' && p.ticket === 'issued' && !ci ? '<button class="btn btn-primary btn-sm" data-a="checkin">Check in now</button>' : ''}
          ${p.payment === 'paid' ? '<button class="btn btn-secondary btn-sm" data-a="resend">Resend ticket email</button>' : ''}
          <button class="btn btn-ghost btn-sm" data-a="copy">Copy email</button>
        </div>`,
      onOpen: dlg => $$('[data-a]', dlg).forEach(b => b.onclick = () => {
        const a = b.dataset.a;
        if (a === 'paid') { overridePerson(p, { payment: 'paid', ticket: 'issued' }); toast(`${p.name} marked as paid · ticket issued`); }
        if (a === 'remind') toast(`Payment reminder queued for ${p.email} (simulated)`, 'info');
        if (a === 'resend') toast(`Ticket ${p.ticketId} re-sent to ${p.email} (simulated)`, 'info');
        if (a === 'checkin') { const m = checkins(); m[p.ticketId] = new Date().toISOString(); store.set('checkins', m); toast(`${p.name} checked in`); }
        if (a === 'copy') return copyText(p.email, 'Email copied');
        dlg.close(); refresh();
      })
    });
  }

  /* =======================================================================
     PAYMENTS
     ======================================================================= */
  let payFilter = '';
  $$('#pay-filter button').forEach(b => b.onclick = () => {
    payFilter = b.dataset.f;
    $$('#pay-filter button').forEach(x => x.classList.toggle('active', x === b));
    renderPayments();
  });
  function renderPayments() {
    const c = counts();
    $('#pay-kpis').innerHTML = [
      kpi('Collected', money(c.paid * CONFIG.fee), `${c.paid} successful payments`),
      kpi('Outstanding', money(c.pending * CONFIG.fee), `${c.pending} pending payments`),
      kpi('Failed attempts', c.failed, 'No money was captured for these')
    ].join('');
    const list = c.list.filter(p => !payFilter || p.payment === payFilter).sort((a, b) => b.registeredAt - a.registeredAt);
    $('#pay-body').innerHTML = list.slice(0, 40).map(p => `<tr>
      <td class="num">${esc(p.txn)}</td><td><strong>${esc(p.name)}</strong> <span class="muted">· ${p.regId}</span></td><td>${esc(p.method)}</td>
      <td class="right num strong">${money(CONFIG.fee)}</td><td>${statusBadge[p.payment]}</td>
      <td class="num">${fmtDate(p.registeredAt, { day: 'numeric', month: 'short' })}, ${fmtTime(p.registeredAt)}</td>
      <td class="right">${p.payment === 'paid' ? '<span class="muted">—</span>' : `<button class="btn btn-ghost btn-sm" data-act="remind" data-reg="${p.regId}">Remind</button> <button class="btn btn-secondary btn-sm" data-act="markpaid" data-reg="${p.regId}">Mark paid</button>`}</td>
    </tr>`).join('') || '<tr><td colspan="7"><div class="empty">No transactions.</div></td></tr>';
    $('#pay-count').textContent = `${list.length} transactions`;
  }
  $('#pay-body').addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const p = participants().find(x => x.regId === b.dataset.reg);
    if (b.dataset.act === 'remind') return toast(`Reminder sent to ${p.email} (simulated)`, 'info');
    modal({
      title: 'Mark payment as received?',
      body: `<p>Use this when ${esc(p.name)} paid offline or the gateway confirmed late. A ticket (${p.ticketId}) is issued immediately.</p>`,
      confirm: 'Mark as paid',
      onConfirm: () => { overridePerson(p, { payment: 'paid', ticket: 'issued' }); toast('Payment reconciled · ticket issued'); refresh(); }
    });
  });

  /* =======================================================================
     TICKETS
     ======================================================================= */
  function renderTickets() {
    const list = everyone().filter(p => p.payment === 'paid');
    const map = checkins();
    const revoked = list.filter(p => p.ticket === 'revoked').length;
    $('#tk-kpis').innerHTML = [
      kpi('Tickets issued', list.length - revoked, 'One per paid registration'),
      kpi('Scanned at entry', Object.keys(map).length, 'Duplicate scans are blocked'),
      kpi('Revoked', revoked, 'Revoked tickets fail verification')
    ].join('');
    const q = $('#tk-search').value.trim().toLowerCase();
    const shown = list.filter(p => !q || p.ticketId.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)).sort((a, b) => b.registeredAt - a.registeredAt).slice(0, 40);
    $('#tk-body').innerHTML = shown.map(p => `<tr>
      <td class="strong num">${p.ticketId}</td><td>${esc(p.name)}</td><td class="num">${p.regId}</td>
      <td class="num">${fmtDate(p.registeredAt, { day: 'numeric', month: 'short' })}</td>
      <td>${p.ticket === 'revoked' ? ticketBadge('revoked') : map[p.ticketId] ? '<span class="badge badge-success">Scanned</span>' : '<span class="badge badge-info">Valid</span>'}</td>
      <td class="right">${p.isYou ? '<a class="btn btn-ghost btn-sm" href="?p=ticket">View</a>' : `<button class="btn btn-ghost btn-sm" data-act="resend" data-reg="${p.regId}">Resend</button> ${p.ticket === 'revoked'
        ? `<button class="btn btn-secondary btn-sm" data-act="restore" data-reg="${p.regId}">Restore</button>`
        : `<button class="btn btn-danger btn-sm" data-act="revoke" data-reg="${p.regId}">Revoke</button>`}`}</td>
    </tr>`).join('') || '<tr><td colspan="6"><div class="empty">No tickets match.</div></td></tr>';
  }
  $('#tk-search').addEventListener('input', renderTickets);
  $('#tk-body').addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const p = participants().find(x => x.regId === b.dataset.reg);
    if (b.dataset.act === 'resend') return toast(`Ticket re-sent to ${p.email} (simulated)`, 'info');
    if (b.dataset.act === 'restore') { overridePerson(p, { ticket: 'issued' }); toast(`Ticket ${p.ticketId} restored`); return refresh(); }
    modal({
      title: `Revoke ticket ${p.ticketId}?`, tone: 'danger', confirm: 'Revoke ticket',
      body: `<p>${esc(p.name)} won't be admitted with this ticket. Use this for refunds or duplicate registrations. You can restore it later.</p>`,
      onConfirm: () => { overridePerson(p, { ticket: 'revoked' }); toast(`Ticket ${p.ticketId} revoked`, 'warn'); refresh(); }
    });
  });

  /* =======================================================================
     CHECK-IN
     ======================================================================= */
  function renderCheckin() {
    const map = checkins(), idx = ticketIndex(), c = counts();
    const n = Object.keys(map).length;
    $('#ci-summary').innerHTML = `
      <p class="eyebrow">Checked in</p>
      <div style="display:flex;align-items:baseline;gap:10px;margin-top:10px"><span class="big-timer">${n}</span><span class="muted" style="font-size:18px">/ ${idx.size}</span></div>
      <div class="progress" style="margin-top:20px;height:8px"><span style="width:${n / idx.size * 100}%"></span></div>
      <div class="grid g-3" style="margin-top:24px;gap:0;border:1px solid var(--border);border-radius:var(--r)">
        <div style="padding:14px 16px"><span class="muted" style="font-size:12px">Arrived</span><strong style="display:block;font-size:20px" class="num">${(n / idx.size * 100).toFixed(1)}%</strong></div>
        <div style="padding:14px 16px;border-left:1px solid var(--border)"><span class="muted" style="font-size:12px">Still expected</span><strong style="display:block;font-size:20px" class="num">${idx.size - n}</strong></div>
        <div style="padding:14px 16px;border-left:1px solid var(--border)"><span class="muted" style="font-size:12px">Unpaid (not admitted)</span><strong style="display:block;font-size:20px" class="num">${c.pending + c.failed}</strong></div>
      </div>`;
    const entries = Object.entries(map).sort((a, b) => b[1].localeCompare(a[1])).slice(0, 12);
    $('#ci-log').innerHTML = entries.length
      ? entries.map(([id, at]) => `<li><div><strong style="font-weight:550">${esc(idx.get(id)?.name || id)}</strong> <span>· ${id}</span></div><span>${fmtTime(at)}</span></li>`).join('')
      : '<li><span>No one has checked in yet. Open the scanner to start.</span></li>';
  }
  $('#manual-ci').onclick = () => modal({
    title: 'Manual check-in',
    body: `<p>For damaged phones or unreadable codes. Verify the student's college ID first.</p>
      <div class="field" style="margin-top:16px"><label for="m-id">Ticket ID</label><input class="input" id="m-id" placeholder="TK-XXXXXX" style="text-transform:uppercase"></div>`,
    confirm: 'Check in',
    onOpen: dlg => $('#m-id', dlg).focus(),
    onConfirm: dlg => {
      const id = $('#m-id', dlg).value.trim().toUpperCase();
      const person = ticketIndex().get(id), map = checkins();
      if (!person) { toast(`${id || 'That ID'} is not a valid ticket`, 'error'); return false; }
      if (map[id]) { toast(`${person.name} already checked in at ${fmtTime(map[id])}`, 'warn'); return false; }
      map[id] = new Date().toISOString(); store.set('checkins', map);
      toast(`${person.name} checked in`); refresh();
    }
  });

  /* =======================================================================
     QUESTIONS — create / edit / preview (max three)
     ======================================================================= */
  let qIndex = 0;
  const qForm = $('#q-form');
  const relabel = qs => qs.map((q, i) => ({ ...q, id: 'ABC'[i] }));
  function renderQuestions() {
    const qs = questions();
    qIndex = Math.min(qIndex, qs.length - 1);
    $('#q-list').innerHTML = qs.map((q, i) => `<button class="q-item ${i === qIndex ? 'active' : ''}" data-i="${i}"><span class="letter">${q.id}</span><span><strong>${esc(q.title || 'Untitled')}</strong><small>${esc(q.difficulty)} · ${q.points} pts</small></span></button>`).join('')
      + `<div style="padding:14px 20px;border-top:1px solid var(--border);font-size:12.5px" class="muted">${qs.length} of 3 problems · ${qs.reduce((a, q) => a + Number(q.points), 0)} points total</div>`;
    $$('#q-list [data-i]').forEach(b => b.onclick = () => { qIndex = Number(b.dataset.i); renderQuestions(); });
    const q = qs[qIndex];
    if (!q) return;
    Object.entries({ title: q.title, difficulty: q.difficulty, points: q.points, timeLimit: q.timeLimit, memory: q.memory, statement: q.statement, input: q.input, output: q.output, constraints: q.constraints, sampleIn: q.samples?.[0]?.in || '', sampleOut: q.samples?.[0]?.out || '' })
      .forEach(([k, v]) => qForm.elements[k].value = v);
    $('#q-preview').innerHTML = problemHTML(q);
  }
  const formQuestion = () => {
    const f = Object.fromEntries(new FormData(qForm));
    const old = questions()[qIndex];
    return { ...old, title: f.title.trim(), difficulty: f.difficulty, points: Number(f.points), timeLimit: f.timeLimit, memory: f.memory, statement: f.statement, input: f.input, output: f.output, constraints: f.constraints, samples: [{ in: f.sampleIn, out: f.sampleOut }, ...(old.samples || []).slice(1)] };
  };
  const showQTab = tab => {
    $$('#q-tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    qForm.hidden = tab !== 'edit';
    $('#q-preview').hidden = tab !== 'preview';
    if (tab === 'preview') $('#q-preview').innerHTML = problemHTML(formQuestion());
  };
  $$('#q-tabs button').forEach(b => b.onclick = () => showQTab(b.dataset.tab));
  $('#q-preview-btn').onclick = () => showQTab('preview');
  qForm.addEventListener('submit', e => {
    e.preventDefault();
    const q = formQuestion();
    if (!q.title) return toast('Give the question a title', 'error');
    if (!(q.points >= 10 && q.points <= 1000)) return toast('Points must be between 10 and 1000', 'error');
    if (!q.statement.trim() || !q.samples[0].in.trim() || !q.samples[0].out.trim()) return toast('Statement and one sample input/output are required', 'error');
    const qs = questions(); qs[qIndex] = q; store.set('questions', qs);
    toast(`Problem ${q.id} saved`); renderQuestions();
  });
  $('#q-new').onclick = () => {
    const qs = questions();
    if (qs.length >= 3) return toast('The arena runs exactly three problems. Delete one to add another.', 'warn');
    qs.push({ id: 'ABC'[qs.length], title: 'New problem', difficulty: 'Medium', points: 200, timeLimit: '1 s', memory: '256 MB', statement: '', input: '', output: '', constraints: '', samples: [{ in: '', out: '' }] });
    store.set('questions', qs); qIndex = qs.length - 1; renderQuestions(); showQTab('edit'); qForm.title.focus();
    toast('Draft added — fill it in and save', 'info');
  };
  $('#q-delete').onclick = () => {
    const qs = questions();
    if (qs.length <= 1) return toast('Keep at least one problem in the arena', 'warn');
    modal({
      title: `Delete problem ${qs[qIndex].id}?`, tone: 'danger', confirm: 'Delete',
      body: `<p>“${esc(qs[qIndex].title)}” will be removed from the arena. Remaining problems are relabelled A, B, C.</p>`,
      onConfirm: () => { qs.splice(qIndex, 1); store.set('questions', relabel(qs)); qIndex = 0; renderQuestions(); toast('Problem deleted', 'warn'); }
    });
  };
  $('#q-reset').onclick = () => modal({
    title: 'Restore the default problems?', tone: 'danger', confirm: 'Restore',
    body: '<p>Your edits are discarded and the three sample problems come back.</p>',
    onConfirm: () => { store.remove('questions'); qIndex = 0; renderQuestions(); toast('Default problems restored'); }
  });

  /* =======================================================================
     COMPETITION CONTROL — lifecycle, duration, simulated traffic
     ======================================================================= */
  const STAGES = ['scheduled', 'live', 'ended', 'published'];
  let simTimer = null;
  const feed = [];
  function renderControl() {
    const comp = compState(), at = STAGES.indexOf(comp.status);
    $('#stages').innerHTML = [['Scheduled', 'Problems hidden'], ['Live', 'Clock running'], ['Ended', 'Submissions locked'], ['Published', 'Results public']]
      .map(([t, d], i) => `<div class="${i < at ? 'done' : i === at ? 'now' : ''}"><b>${i < at ? '✓ ' : ''}${t}</b>${d}</div>`).join('');
    $('#ctl-badge').innerHTML = `<span class="badge ${COMP_BADGE[comp.status]}">${COMP_LABEL[comp.status]}</span>`;
    $('#duration').value = comp.durationMin;
    $('#ctl-start').disabled = comp.status !== 'scheduled';
    $('#ctl-end').disabled = comp.status !== 'live';
    $('#ctl-publish').disabled = comp.status !== 'ended';
    $('#ctl-reset').disabled = comp.status === 'scheduled';
    tickControl();
    renderSim();
  }
  function tickControl() {
    const comp = compState();
    const timer = $('#ctl-timer');
    if (comp.status === 'live') {
      const left = comp.startedAt + comp.durationMin * 60000 - Date.now();
      timer.textContent = fmtClock(left);
      $('#timer-label').textContent = 'Time remaining';
      $('#ctl-sub').textContent = left > 0 ? `Started at ${fmtTime(comp.startedAt)} · ends at ${fmtTime(comp.startedAt + comp.durationMin * 60000)}` : 'Time is up — end the event to lock submissions.';
      timer.style.color = left < 10 * 60000 ? 'var(--warn)' : '';
    } else {
      timer.style.color = '';
      timer.textContent = comp.status === 'scheduled' ? fmtClock(comp.durationMin * 60000) : '00:00:00';
      $('#timer-label').textContent = comp.status === 'scheduled' ? 'Configured duration' : 'Final';
      $('#ctl-sub').textContent = comp.status === 'scheduled' ? 'The clock starts for everyone when you press Start.' : `Ended at ${fmtTime(comp.endedAt || Date.now())}`;
    }
  }
  function renderSim() {
    const sim = store.get('sim', { active: 0, subs: 0, accepted: 0, flags: 0 });
    $('#sim-stats').innerHTML = [['Active now', sim.active], ['Submissions', sim.subs], ['Accepted', sim.accepted], ['Tab-switch flags', sim.flags]]
      .map(([l, v]) => `<div style="padding:14px;border:1px solid var(--border);border-radius:var(--r);background:var(--bg-2)"><span class="muted" style="font-size:12px">${l}</span><strong style="display:block;font-size:24px;letter-spacing:-.02em" class="num">${v}</strong></div>`).join('');
    $('#feed').innerHTML = feed.length ? feed.slice(0, 30).map(f => `<li><span class="t">${f.t}</span><span><strong style="color:var(--text);font-weight:550">${esc(f.name)}</strong> submitted ${f.q} · ${f.lang}</span>${f.badge}</li>`).join('') : '';
    $('#feed-note').textContent = simTimer ? 'Streaming simulated submissions' : 'Start the event and enable simulation';
  }
  function simStep() {
    const sim = store.get('sim', { active: 0, subs: 0, accepted: 0, flags: 0 });
    const target = Math.min(342, ticketIndex().size);
    sim.active = Math.min(target, sim.active + Math.ceil((target - sim.active) * 0.3) + Math.floor(Math.random() * 3));
    const burst = 1 + Math.floor(Math.random() * 4);
    const pool = participants();
    for (let i = 0; i < burst; i++) {
      const p = pool[Math.floor(Math.random() * pool.length)];
      const r = Math.random();
      const [verdict, cls] = r < 0.42 ? ['Accepted', 'badge-success'] : r < 0.72 ? ['Wrong answer', 'badge-danger'] : r < 0.87 ? ['Time limit', 'badge-warn'] : ['Compile error', ''];
      sim.subs++; if (verdict === 'Accepted') sim.accepted++;
      feed.unshift({ t: new Date().toLocaleTimeString('en-IN', { hour12: false }), name: p.name, q: 'ABC'[Math.floor(Math.random() * 3)], lang: LANGS[Math.floor(Math.random() * LANGS.length)], badge: `<span class="badge ${cls}">${verdict}</span>` });
    }
    if (Math.random() < 0.08) sim.flags++;
    feed.length = Math.min(feed.length, 60);
    store.set('sim', sim);
    renderSim();
  }
  const stopSim = () => { clearInterval(simTimer); simTimer = null; $('#sim-toggle').checked = false; renderSim(); };
  $('#sim-toggle').onchange = e => {
    if (!e.target.checked) { stopSim(); return toast('Simulation paused', 'info'); }
    if (compState().status !== 'live') { e.target.checked = false; return toast('Start the event first — simulation needs a live contest', 'warn'); }
    simTimer = setInterval(simStep, 1200); simStep();
    toast('Simulating live participants');
  };
  $('#ctl-start').onclick = () => {
    const comp = compState();
    modal({
      title: 'Start the competition?',
      body: `<p>All three problems unlock for every participant and a <strong style="color:var(--text)">${comp.durationMin}-minute</strong> clock starts now. This can't be paused.</p>`,
      confirm: 'Start event',
      onConfirm: () => { setComp({ status: 'live', startedAt: Date.now(), endedAt: null }); store.set('sim', { active: 0, subs: 0, accepted: 0, flags: 0 }); feed.length = 0; renderControl(); toast('Competition is live'); }
    });
  };
  $('#ctl-end').onclick = () => modal({
    title: 'End the competition now?', tone: 'danger', confirm: 'End event',
    body: '<p>Submissions lock immediately for everyone. Pending submissions are still judged. This cannot be undone.</p>',
    onConfirm: () => { stopSim(); setComp({ status: 'ended', endedAt: Date.now() }); renderControl(); toast('Competition ended · submissions locked', 'warn'); }
  });
  const publish = () => {
    if (compState().status !== 'ended') return toast(compState().status === 'published' ? 'Results are already published' : 'End the competition before publishing results', 'warn');
    modal({
      title: 'Publish results?', confirm: 'Publish',
      body: `<p>The leaderboard becomes final and public, and ${sampleResults().length} participants see their scores in the dashboard.</p>`,
      onConfirm: () => { setComp({ status: 'published' }); refresh(); toast('Results published'); }
    });
  };
  $('#ctl-publish').onclick = publish;
  $('#res-publish').onclick = publish;
  $('#ctl-reset').onclick = () => modal({
    title: 'Reset the competition?', tone: 'danger', confirm: 'Reset',
    body: '<p>Returns the contest to “Scheduled” so you can run the demo again. Simulated stats are cleared.</p>',
    onConfirm: () => { stopSim(); setComp({ status: 'scheduled', startedAt: null, endedAt: null }); store.remove('sim'); feed.length = 0; renderControl(); toast('Competition reset', 'info'); }
  });
  $('#duration-form').addEventListener('submit', e => {
    e.preventDefault();
    const v = Number($('#duration').value);
    if (!(v >= 15 && v <= 300)) return toast('Duration must be between 15 and 300 minutes', 'error');
    setComp({ durationMin: v }); renderControl(); toast(`Duration set to ${v} minutes`);
  });

  /* =======================================================================
     RESULTS
     ======================================================================= */
  function renderResults() {
    const comp = compState(), rows = leaderboard();
    $('#res-sub').textContent = comp.status === 'published' ? 'Results are final and visible to participants.' : comp.status === 'ended' ? 'Contest ended — review and publish when ready.' : 'Provisional — showing the sample dataset until the contest ends.';
    const avg = rows.reduce((a, r) => a + r.score, 0) / rows.length;
    $('#res-kpis').innerHTML = [
      kpi('Competed', rows.length), kpi('Average score', avg.toFixed(0)),
      kpi('Solved all three', rows.filter(r => r.solvedCount === 3).length), kpi('Solved problem C', rows.filter(r => r.solved[2]).length)
    ].join('');
    $('#res-body').innerHTML = rows.slice(0, 10).map(r => `<tr>
      <td class="rank-cell ${r.rank <= 3 ? 'top' : ''}">${pad(r.rank)}</td><td class="strong">${esc(r.p.name)}</td><td>${esc(r.p.college)}</td>
      <td><span class="solved-dots">${r.solved.map((s, i) => `<i class="${s ? 'on' : ''}">${'ABC'[i]}</i>`).join('')}</span></td>
      <td class="right num strong">${r.score}</td><td class="right num">${fmtMins(r.completion)}</td></tr>`).join('');
    $('#res-publish').disabled = comp.status === 'published';
  }

  /* =======================================================================
     CERTIFICATES
     ======================================================================= */
  const TITLES = ['Winner', 'First Runner-up', 'Second Runner-up'];
  function renderCertsAdmin() {
    const rows = leaderboard(), issued = store.get('certsIssued', 0);
    $('#cert-kpis').innerHTML = [
      kpi('Participation', rows.length, 'Everyone who competed'),
      kpi('Achievement', 10, 'Top 10 finishers'),
      kpi('Issued', issued, issued ? 'Visible in student dashboards' : 'Nothing issued yet')
    ].join('');
    $('#cert-body').innerHTML = rows.slice(0, 10).map(r => {
      const title = TITLES[r.rank - 1] || 'Top 10 Finisher';
      const id = `CA26-ACH-${(hashStr(r.p.name + 'achievement') >>> 0).toString(36).toUpperCase().slice(0, 6).padStart(6, '0')}`;
      return `<tr><td class="rank-cell ${r.rank <= 3 ? 'top' : ''}">${pad(r.rank)}</td><td class="strong">${esc(r.p.name)}</td><td>${title}</td><td class="num">${id}</td>
        <td class="right"><a class="btn btn-ghost btn-sm" href="?p=certificate&type=achievement&name=${encodeURIComponent(r.p.name)}&title=${encodeURIComponent(title)}">Preview</a></td></tr>`;
    }).join('');
  }
  $('#issue-certs').onclick = () => {
    const total = leaderboard().length + 10;
    const comp = compState();
    modal({
      title: `Issue ${total} certificates?`,
      body: `<p>${leaderboard().length} participation and 10 achievement certificates are generated and added to student dashboards.</p>
        ${comp.status !== 'published' ? '<p style="margin-top:10px;color:var(--warn)">Results aren’t published yet — achievement titles may still change.</p>' : ''}`,
      confirm: 'Issue certificates',
      onConfirm: () => {
        $('#issue-progress').hidden = false;
        let n = 0;
        const t = setInterval(() => {
          n = Math.min(total, n + Math.ceil(total / 24));
          $('#issue-bar').style.width = (n / total * 100) + '%';
          $('#issue-count').textContent = `${n} / ${total}`;
          if (n >= total) { clearInterval(t); store.set('certsIssued', total); setTimeout(() => { $('#issue-progress').hidden = true; renderCertsAdmin(); }, 400); toast(`${total} certificates issued`); }
        }, 90);
      }
    });
  };

  /* =======================================================================
     SETTINGS — persisted overrides for CONFIG
     ======================================================================= */
  const sForm = $('#settings-form');
  function renderSettings() {
    ['name', 'edition', 'date', 'venue', 'organiser', 'capacity', 'fee'].forEach(k => sForm.elements[k].value = CONFIG[k]);
    const prefs = store.get('prefs', {});
    ['regOpen', 'freeze', 'tabWatch'].forEach(k => sForm.elements[k].checked = prefs[k] ?? true);
  }
  sForm.addEventListener('submit', e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(sForm));
    if (!f.name.trim()) return toast('Event name is required', 'error');
    if (!f.date) return toast('Pick a start date and time', 'error');
    const capacity = Number(f.capacity), fee = Number(f.fee);
    if (!(capacity >= 10)) return toast('Capacity must be at least 10', 'error');
    if (!(fee >= 0)) return toast('Fee cannot be negative', 'error');
    store.set('settings', { name: f.name.trim(), edition: f.edition.trim(), date: f.date, venue: f.venue.trim(), organiser: f.organiser.trim(), capacity, fee });
    store.set('prefs', { regOpen: !!f.regOpen, freeze: !!f.freeze, tabWatch: !!f.tabWatch });
    toast('Settings saved — applying everywhere');
    setTimeout(() => location.reload(), 700);
  });
  $('#s-reset').onclick = () => modal({
    title: 'Restore default settings?', confirm: 'Restore', tone: 'danger',
    body: '<p>Event name, date, venue, fee and capacity go back to the placeholders.</p>',
    onConfirm: () => { store.remove('settings'); store.remove('prefs'); location.reload(); }
  });

  /* ---------- Wiring ---------- */
  const RENDER = {
    overview: renderOverview, participants: renderParticipants, payments: renderPayments, tickets: renderTickets,
    checkin: renderCheckin, questions: renderQuestions, control: renderControl, results: renderResults,
    certificates: renderCertsAdmin, settings: renderSettings
  };
  let current = 'overview';
  function refresh() { renderChrome(); RENDER[current]?.(); }

  renderChrome();
  initAppShell({
    overview: 'Overview', participants: 'Participants', payments: 'Payments', tickets: 'Tickets', checkin: 'Check-in',
    questions: 'Questions', control: 'Competition control', results: 'Results', certificates: 'Certificates', settings: 'Settings'
  }, id => { current = id; RENDER[id](); });

  // Keep the live clock and cross-tab changes (e.g. check-ins from the scanner) in sync
  setInterval(() => { if (current === 'control') tickControl(); }, 1000);
  addEventListener('storage', e => { if (e.key?.startsWith('ca.') && !['ca.sim'].includes(e.key)) refresh(); });
};

/* =========================================================================
   CODE//ARENA — Competition arena.
   A lightweight IDE: textarea + highlighted <pre> overlay, mock judge,
   autosave, countdown, fullscreen prompt and tab-switch detection.
   Nothing is compiled — verdicts are simulated from simple code checks.
   ========================================================================= */

const LANG = {
  c: { label: 'C', file: 'main.c', cmd: 'gcc -O2 -std=c17 main.c -o main -lm' },
  cpp: { label: 'C++17', file: 'main.cpp', cmd: 'g++ -O2 -std=c++17 main.cpp -o main' },
  py: { label: 'Python 3', file: 'main.py', cmd: 'python3 -m py_compile main.py' },
  java: { label: 'Java 21', file: 'Main.java', cmd: 'javac Main.java' }
};

/** Starter code per language. The TODO line is what the mock judge looks for. */
const TEMPLATES = {
  c: t => `#include <stdio.h>\n\nint main(void) {\n    // TODO: solve "${t}"\n    // Read from stdin, print the answer to stdout.\n\n    return 0;\n}\n`,
  cpp: t => `#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n\n    // TODO: solve "${t}"\n\n    return 0;\n}\n`,
  py: t => `import sys\n\n\ndef main():\n    data = sys.stdin.read().split()\n    # TODO: solve "${t}"\n\n\nif __name__ == "__main__":\n    main()\n`,
  java: t => `import java.io.*;\nimport java.util.*;\n\npublic class Main {\n    public static void main(String[] args) throws IOException {\n        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));\n        // TODO: solve "${t}"\n    }\n}\n`
};

/* ---------- Syntax highlighting (regex tokenizer, good enough for an exam editor) ---------- */
const KEYWORDS = {
  c: 'break case const continue default do else enum extern for goto if return sizeof static struct switch typedef union while include define',
  cpp: 'break case catch class const continue default delete do else enum for if namespace new operator private protected public return static struct switch template this throw try typename using while true false nullptr auto',
  py: 'and as assert break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return True try while with yield',
  java: 'abstract break case catch class continue default do else extends final finally for if implements import instanceof interface new null package private protected public return static super switch this throw throws try while true false'
};
const TYPES = {
  c: 'int char long short float double void unsigned signed size_t FILE',
  cpp: 'int char long short float double void unsigned bool string vector map set pair queue stack size_t ios cin cout',
  py: 'int str float list dict set tuple len range print input sys',
  java: 'int char long short float double void boolean byte String Integer List ArrayList Map HashMap Scanner System BufferedReader InputStreamReader IOException Main'
};
const C_RE = /(\/\/.*$|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|(^[ \t]*#\w+)|(\b\d+(?:\.\d+)?[fFlLuU]*\b)|([A-Za-z_]\w*)(?=\s*\()|([A-Za-z_]\w*)/gm;
const PY_RE = /(#.*$)|("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|(\b\d+(?:\.\d+)?\b)|([A-Za-z_]\w*)(?=\s*\()|([A-Za-z_]\w*)/gm;
const sets = {};
for (const k in KEYWORDS) sets[k] = { kw: new Set(KEYWORDS[k].split(' ')), ty: new Set(TYPES[k].split(' ')) };

function highlight(code, lang) {
  const re = lang === 'py' ? PY_RE : C_RE, { kw, ty } = sets[lang];
  let out = '', last = 0, m;
  re.lastIndex = 0;
  while ((m = re.exec(code))) {
    const g = lang === 'py' ? { com: m[1], str: m[2], num: m[3], fn: m[4], id: m[5] } : { com: m[1], str: m[2], pre: m[3], num: m[4], fn: m[5], id: m[6] };
    const word = g.fn || g.id;
    const cls = g.com ? 'com' : g.str ? 'str' : g.pre ? 'pre' : g.num ? 'num'
      : kw.has(word) ? 'kw' : ty.has(word) ? 'ty' : g.fn ? 'fn' : '';
    out += esc(code.slice(last, m.index)) + (cls ? `<span class="tk-${cls}">${esc(m[0])}</span>` : esc(m[0]));
    last = re.lastIndex;
  }
  return out + esc(code.slice(last)) + '\n';
}

/* ---------- Mock judge ---------- */
/** Bracket check after stripping strings/comments → first unmatched bracket and its line. */
function bracketError(code, lang) {
  const stripped = code
    .replace(lang === 'py' ? /#.*$/gm : /\/\/.*$|\/\*[\s\S]*?\*\//gm, m => m.replace(/[^\n]/g, ' '))
    .replace(/"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/g, m => ' '.repeat(m.length));
  const pairs = { ')': '(', ']': '[', '}': '{' }, stack = [];
  let line = 1;
  for (const ch of stripped) {
    if (ch === '\n') line++;
    else if ('([{'.includes(ch)) stack.push({ ch, line });
    else if (pairs[ch]) {
      if (stack.at(-1)?.ch !== pairs[ch]) return { ch, line, kind: 'extra' };
      stack.pop();
    }
  }
  return stack.length ? { ...stack.at(-1), kind: 'open', endLine: line } : null;
}
function judge(code, lang) {
  const err = bracketError(code, lang);
  const f = LANG[lang].file;
  if (err) {
    const msg = {
      c: err.kind === 'open' ? `${f}:${err.endLine}:1: error: expected '}' at end of input\n${f}:${err.line}: note: to match this '${err.ch}'` : `${f}:${err.line}:1: error: expected declaration or statement before '${err.ch}' token`,
      cpp: err.kind === 'open' ? `${f}:${err.endLine}:1: error: expected '}' at end of input\n${f}:${err.line}:12: note: to match this '${err.ch}'` : `${f}:${err.line}:1: error: expected declaration before '${err.ch}' token`,
      java: err.kind === 'open' ? `${f}:${err.endLine}: error: reached end of file while parsing\n1 error` : `${f}:${err.line}: error: class, interface, enum, or record expected\n1 error`,
      py: `  File "${f}", line ${err.line}\nSyntaxError: ${err.kind === 'open' ? `'${err.ch}' was never closed` : `unmatched '${err.ch}'`}`
    }[lang];
    return { kind: 'ce', msg };
  }
  if (/\bTODO\b/.test(code)) return { kind: 'wa' };
  return { kind: 'ok' };
}

function initArena() {
  const state = store.get('arena', {});
  state.code ||= {}; state.subs ||= []; state.lang ||= 'cpp'; state.q ||= 0; state.tabSwitches ||= 0; state.start ||= Date.now();
  const save = () => store.set('arena', state);
  save();

  let qs = questions();
  const ta = $('#code'), pre = $('#highlight'), gutter = $('#gutter'), out = $('#console-out');
  const key = () => `${state.q}:${state.lang}`;
  const codeFor = () => state.code[key()] ?? TEMPLATES[state.lang](qs[state.q].title);
  let busy = false, timeUpShown = false;

  /* ---------- Console helpers ---------- */
  const log = (html, cls = '') => { out.innerHTML += (cls ? `<span class="${cls}">${html}</span>` : html) + '\n'; out.parentElement.parentElement.scrollTop = 1e9; };
  const clearLog = () => { out.innerHTML = ''; $('#verdict').innerHTML = ''; };
  const showTab = tab => {
    $$('#console-tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    $$('[data-pane]').forEach(p => p.hidden = p.dataset.pane !== tab);
  };
  $$('#console-tabs button').forEach(b => b.onclick = () => showTab(b.dataset.tab));

  /* ---------- Editor rendering ---------- */
  function paint() {
    pre.innerHTML = highlight(ta.value, state.lang);
    const lines = ta.value.split('\n').length;
    const cur = ta.value.slice(0, ta.selectionStart).split('\n').length;
    gutter.innerHTML = Array.from({ length: lines }, (_, i) => `<div class="${i + 1 === cur ? 'cur' : ''}">${i + 1}</div>`).join('') + '<div style="height:40px"></div>';
    syncScroll();
  }
  function syncScroll() { pre.scrollTop = ta.scrollTop; pre.scrollLeft = ta.scrollLeft; gutter.scrollTop = ta.scrollTop; }
  function loadEditor() {
    ta.value = codeFor();
    $('#lang').value = state.lang;
    $('#file-name').textContent = LANG[state.lang].file;
    paint();
  }

  /* Autosave: debounced write to localStorage, with a visible status */
  let saveTimer;
  const setSave = (cls, text) => { const el = $('#save-state'); el.className = 'save-state ' + cls; $('span', el).textContent = text; };
  ta.addEventListener('input', () => {
    paint();
    setSave('saving', 'Saving…');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { state.code[key()] = ta.value; save(); setSave('saved', `Saved ${new Date().toLocaleTimeString('en-IN', { hour12: false })}`); }, 600);
  });
  ta.addEventListener('scroll', syncScroll);
  ['click', 'keyup'].forEach(ev => ta.addEventListener(ev, () => {
    const cur = ta.value.slice(0, ta.selectionStart).split('\n').length;
    $$('div', gutter).forEach((d, i) => d.classList.toggle('cur', i + 1 === cur));
  }));

  /* Editor keys: Tab indents (Esc then Tab leaves the editor), Enter keeps indentation, Ctrl+Enter runs */
  let escapeTab = false;
  // execCommand keeps the native undo stack and fires 'input'; setRangeText is the fallback
  const insert = text => { if (!document.execCommand('insertText', false, text)) { ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end'); ta.dispatchEvent(new Event('input')); } };
  ta.addEventListener('keydown', e => {
    if (e.key === 'Escape') { escapeTab = true; return; }
    if (e.key === 'Tab' && !escapeTab && !e.shiftKey) { e.preventDefault(); insert('    '); return; }
    escapeTab = false;
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.shiftKey ? submit() : run(); return; }
    if (e.key === 's' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); state.code[key()] = ta.value; save(); setSave('saved', 'Saved'); toast('Code saved'); return; }
    if (e.key === 'Enter' && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      const lineStart = ta.value.lastIndexOf('\n', ta.selectionStart - 1) + 1;
      const line = ta.value.slice(lineStart, ta.selectionStart);
      const indent = line.match(/^\s*/)[0] + (/[{:(\[]\s*$/.test(line) ? '    ' : '');
      insert('\n' + indent);
    }
  });

  /* ---------- Questions ---------- */
  function renderQuestionTabs() {
    $('#q-tabs').innerHTML = qs.map((q, i) => {
      const solved = state.subs.some(s => s.q === i && s.verdict === 'Accepted');
      return `<button class="q-tab ${i === state.q ? 'active' : ''} ${solved ? 'solved' : ''}" role="tab" aria-selected="${i === state.q}" data-q="${i}">
        <span class="l">${solved ? '✓' : q.id}</span><span style="min-width:0"><span class="t">${esc(q.title)}</span><small>${q.points} pts · ${q.difficulty}</small></span></button>`;
    }).join('');
    $$('#q-tabs [data-q]').forEach(b => b.onclick = () => switchQuestion(Number(b.dataset.q)));
  }
  function switchQuestion(i) {
    state.code[key()] = ta.value;
    state.q = i; save();
    renderQuestionTabs();
    $('#problem').innerHTML = problemHTML(qs[i]);
    $('#problem').scrollTop = 0;
    loadEditor();
    $('#tests').innerHTML = '<div class="empty">Run your code to see sample test results.</div>';
  }
  $('#lang').addEventListener('change', e => {
    state.code[key()] = ta.value;
    state.lang = e.target.value; save();
    loadEditor();
    log(`Switched to ${LANG[state.lang].label}. Code for each language is kept separately.`, 'dim');
  });
  $('#reset-code').onclick = () => modal({
    title: 'Reset to the starter template?', tone: 'danger', confirm: 'Reset code',
    body: `<p>Your ${LANG[state.lang].label} code for problem ${qs[state.q].id} will be replaced. Other languages and problems are untouched.</p>`,
    onConfirm: () => { delete state.code[key()]; save(); loadEditor(); toast('Code reset to template', 'info'); }
  });

  /* ---------- Run (sample tests) ---------- */
  const ms = () => 2 + Math.floor(Math.random() * 18);
  function renderTests(results) {
    $('#tests').innerHTML = results.map((r, i) => `<div class="test-row">
      <span>Sample ${i + 1}</span>
      <span>${r.ok ? '<span class="badge badge-success">Passed</span>' : r.ce ? '<span class="badge">Not run</span>' : '<span class="badge badge-danger">Failed</span>'}</span>
      <span class="io">in: ${esc(r.in.replace(/\n/g, ' ⏎ '))} · expected: ${esc(r.out)} · got: ${esc(r.got)}${r.ok ? ` · ${r.t} ms` : ''}</span></div>`).join('');
  }
  function run() {
    if (busy) return;
    busy = true; setButtons();
    state.code[key()] = ta.value; save();
    clearLog(); showTab('console');
    const lang = state.lang, q = qs[state.q];
    log(`$ ${LANG[lang].cmd}`, 'dim');
    log('Compiling…', 'dim');
    setTimeout(() => {
      const res = judge(ta.value, lang);
      if (res.kind === 'ce') {
        log(esc(res.msg), 'err');
        log('\nCompilation failed. Fix the error above and run again — compilation errors are never penalised.', 'warn');
        renderTests(q.samples.map(s => ({ ...s, got: '—', ce: true })));
      } else {
        log(`Compiled in ${(0.3 + Math.random() * 0.8).toFixed(2)} s`, 'dim');
        log(`Running ${q.samples.length} sample test${q.samples.length > 1 ? 's' : ''}…\n`);
        const results = q.samples.map(s => ({ ...s, ok: res.kind === 'ok', got: res.kind === 'ok' ? s.out : '(no output)', t: ms() }));
        results.forEach((r, i) => log(r.ok ? `  Sample ${i + 1}  <span class="ok">✓ Passed</span>   ${r.t} ms` : `  Sample ${i + 1}  <span class="err">✗ Failed</span>   expected "${esc(r.out)}", got ${esc(r.got)}`));
        log(res.kind === 'ok' ? '\n✓ All sample tests passed. Submit to run the hidden test set.' : '\nYour program printed nothing. Replace the TODO with your solution.', res.kind === 'ok' ? 'ok' : 'warn');
        renderTests(results);
      }
      busy = false; setButtons();
    }, 900);
  }

  /* ---------- Submit (full judge with staged verdict) ---------- */
  const sessionStart = () => { const c = compState(); return c.status === 'live' ? c.startedAt : state.start; };
  function submit() {
    if (busy) return;
    const comp = compState();
    if (comp.status === 'ended' || comp.status === 'published') return toast('The contest has ended — submissions are locked', 'error');
    if (timeLeft() <= 0) return toast('Time is up — submissions are locked', 'error');
    busy = true; setButtons();
    state.code[key()] = ta.value; save();
    clearLog(); showTab('console');
    const lang = state.lang, qi = state.q, q = qs[qi];
    const res = judge(ta.value, lang);
    const total = 12;
    const banner = (cls, html) => $('#verdict').innerHTML = `<div class="verdict-banner ${cls}">${html}</div>`;
    banner('', '<div class="spinner" style="width:16px;height:16px"></div><span>Queued…</span>');
    log(`Submission for ${q.id}. ${esc(q.title)} · ${LANG[lang].label}`, 'dim');
    const steps = [];
    steps.push(() => banner('', '<div class="spinner" style="width:16px;height:16px"></div><span>Compiling…</span>'));
    if (res.kind !== 'ce') for (let i = 1; i <= (res.kind === 'ok' ? total : 1); i++) steps.push(() => {
      banner('', `<div class="spinner" style="width:16px;height:16px"></div><span>Running test ${i} / ${total}</span>`);
      log(`  Test ${pad(i)}  ${res.kind === 'ok' ? `<span class="ok">✓</span>  ${ms()} ms` : '<span class="err">✗ Wrong answer</span>'}`);
    });
    steps.push(() => finish());
    let i = 0;
    const next = () => { steps[i++](); if (i < steps.length) setTimeout(next, i === 1 ? 450 : 160); };
    next();

    function finish() {
      const solvedBefore = state.subs.some(s => s.q === qi && s.verdict === 'Accepted');
      const wrongBefore = state.subs.filter(s => s.q === qi && s.verdict === 'Wrong answer').length;
      let verdict, points = 0, runtime = '—';
      if (res.kind === 'ce') {
        verdict = 'Compilation error';
        banner('bad', '<strong>Compilation error</strong><span class="muted">No penalty</span>');
        log(esc(res.msg), 'err');
      } else if (res.kind === 'wa') {
        verdict = 'Wrong answer';
        banner('bad', '<strong>Wrong answer</strong><span class="muted">on test 1 · −10 if you solve it later</span>');
        log('\nExpected output differs on test 1.', 'err');
      } else {
        verdict = 'Accepted';
        runtime = `${20 + Math.floor(Math.random() * 120)} ms`;
        points = solvedBefore ? 0 : Math.max(q.points - 10 * wrongBefore, q.points / 2);
        banner('ok', `<strong>Accepted</strong><span>${solvedBefore ? 'Already solved — score unchanged' : `+${points} points`}</span><span class="muted" style="margin-left:auto">${runtime} · ${total}/${total} tests</span>`);
        log(`\n✓ All ${total} tests passed.`, 'ok');
      }
      state.subs.unshift({ n: state.subs.length + 1, q: qi, lang: LANG[lang].label, verdict, points, runtime, at: new Date().toISOString(), elapsedMin: (Date.now() - sessionStart()) / 60000 });
      save();
      renderSubs(); renderQuestionTabs();
      toast(verdict === 'Accepted' ? `Problem ${q.id} accepted${points ? ` · +${points}` : ''}` : verdict, verdict === 'Accepted' ? 'success' : 'error');
      busy = false; setButtons();
    }
  }
  function renderSubs() {
    $('#sub-count').textContent = state.subs.length ? `(${state.subs.length})` : '';
    $('#subs').innerHTML = state.subs.length ? state.subs.map(s => `<tr>
      <td class="num">${s.n}</td><td class="num">${new Date(s.at).toLocaleTimeString('en-IN', { hour12: false })}</td>
      <td class="strong">${qs[s.q]?.id ?? '?'}. ${esc(qs[s.q]?.title ?? '')}</td><td>${esc(s.lang)}</td>
      <td><span class="badge ${s.verdict === 'Accepted' ? 'badge-success' : s.verdict === 'Wrong answer' ? 'badge-danger' : ''}">${s.verdict}</span></td>
      <td class="right num">${s.points ? '+' + s.points : '—'}</td><td class="right num">${s.runtime}</td></tr>`).join('')
      : '<tr><td colspan="7"><div class="empty">No submissions yet.</div></td></tr>';
  }
  $('#run-btn').onclick = run;
  $('#submit-btn').onclick = submit;
  function setButtons() {
    const locked = ['ended', 'published'].includes(compState().status) || timeLeft() <= 0;
    $('#run-btn').disabled = busy;
    $('#submit-btn').disabled = busy || locked;
  }

  /* ---------- Countdown: live contest clock if the admin started it, else a practice clock ---------- */
  function timeLeft() {
    const c = compState();
    if (c.status === 'live') return c.startedAt + c.durationMin * 60000 - Date.now();
    if (c.status === 'scheduled') return state.start + CONFIG.durationMin * 60000 - Date.now();
    return 0;
  }
  function renderMode() {
    const c = compState();
    $('#mode-badge').innerHTML = c.status === 'live' ? '<span class="badge badge-success">Live</span>'
      : c.status === 'scheduled' ? '<span class="badge badge-info" title="Practice submissions are not scored">Practice</span>'
        : '<span class="badge badge-warn">Contest ended</span>';
    setButtons();
  }
  function tick() {
    const left = timeLeft();
    $('#timer-val').textContent = fmtClock(left);
    $('#timer').className = 'timer' + (left <= 60000 ? ' crit' : left <= 10 * 60000 ? ' warn' : '');
    if (left <= 0 && !timeUpShown) {
      timeUpShown = true; setButtons();
      const practice = compState().status === 'scheduled';
      modal({
        title: "Time's up",
        body: practice ? '<p>Your practice session has ended. Restart the clock to keep practising.</p>' : '<p>The contest clock has run out. Your accepted submissions are final.</p>',
        confirm: practice ? 'Restart practice clock' : 'View my results', cancel: practice ? 'Close' : null,
        onConfirm: () => { if (practice) { state.start = Date.now(); save(); timeUpShown = false; setButtons(); } else location.href = '?p=dashboard#results'; }
      });
    }
  }
  setInterval(tick, 1000);

  // React when the organiser starts/ends the contest in another tab (Admin → Competition control)
  addEventListener('storage', e => {
    if (e.key === 'ca.comp') {
      renderMode(); timeUpShown = false; tick();
      const s = compState().status;
      toast(s === 'live' ? 'The organisers started the competition — the clock is running' : s === 'ended' ? 'The competition has ended. Submissions are locked.' : `Competition: ${COMP_LABEL[s]}`, s === 'ended' ? 'warn' : 'info');
    }
    if (e.key === 'ca.questions') { qs = questions(); renderQuestionTabs(); $('#problem').innerHTML = problemHTML(qs[state.q] || qs[0]); toast('Problems were updated by the organisers', 'info'); }
  });

  /* ---------- Fullscreen prompt + tab-switch monitoring (detection only) ---------- */
  const watchTabs = store.get('prefs', {}).tabWatch ?? true;
  let wasFullscreen = false;
  const enterFullscreen = () => document.documentElement.requestFullscreen?.().catch(() => toast('Fullscreen was blocked by the browser', 'warn'));
  $('#fs-btn').onclick = () => document.fullscreenElement ? document.exitFullscreen() : enterFullscreen();
  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement) { wasFullscreen = true; return; }
    if (wasFullscreen) { toast('You left fullscreen — this has been logged', 'warn'); log('[monitor] Fullscreen exited at ' + new Date().toLocaleTimeString('en-IN', { hour12: false }), 'warn'); }
  });
  if (!sessionStorage.getItem('ca.fsPrompted')) {
    sessionStorage.setItem('ca.fsPrompted', '1');
    modal({
      title: 'Enter fullscreen to begin',
      body: `<p>The arena runs in fullscreen so you can focus. Leaving fullscreen or switching tabs is recorded and visible to the organisers.</p>
        <p style="margin-top:12px" class="muted">Prototype note: a web page can't block operating-system shortcuts such as Alt+Tab or Cmd+Tab. This screen only detects and logs focus changes; real lockdown needs a dedicated exam browser.</p>`,
      confirm: 'Enter fullscreen', cancel: 'Continue windowed', onConfirm: enterFullscreen
    });
  }
  document.addEventListener('visibilitychange', () => {
    if (!watchTabs) return;
    if (document.hidden) { state.tabSwitches++; save(); return; }
    const n = state.tabSwitches;
    log(`[monitor] Tab switch #${n} recorded at ${new Date().toLocaleTimeString('en-IN', { hour12: false })}`, 'warn');
    modal({
      title: n >= 3 ? 'Session flagged for review' : `Tab switch recorded (${n} of 3)`,
      body: n >= 3
        ? `<p>You've left the arena ${n} times. Organisers have been notified and will review your session. You can keep working.</p>`
        : '<p>You left the arena tab. Each switch is logged; after three, your session is flagged for review by the organisers.</p>',
      confirm: 'Back to the problem', cancel: null, tone: n >= 3 ? 'danger' : 'primary'
    });
  });

  /* ---------- Finish ---------- */
  $('#finish-btn').onclick = () => {
    const solved = qs.filter((_, i) => state.subs.some(s => s.q === i && s.verdict === 'Accepted')).length;
    modal({
      title: 'Finish and leave the arena?',
      body: `<p>You've solved <strong style="color:var(--text)">${solved} of ${qs.length}</strong> problems. Your code is saved; you can come back while the clock is running.</p>`,
      confirm: 'Finish', onConfirm: () => { if (document.fullscreenElement) document.exitFullscreen(); location.href = '?p=dashboard#results'; }
    });
  };

  /* ---------- Mobile panel switcher ---------- */
  $$('#panel-tabs button').forEach(b => b.onclick = () => {
    $('.arena').dataset.panel = b.dataset.panel;
    $$('#panel-tabs button').forEach(x => x.classList.toggle('active', x === b));
  });

  /* ---------- Boot ---------- */
  if (!qs[state.q]) state.q = 0;
  renderQuestionTabs();
  $('#problem').innerHTML = problemHTML(qs[state.q]);
  loadEditor();
  renderSubs();
  renderMode();
  tick();
  log(`${CONFIG.name} judge ready · ${compState().status === 'live' ? 'live contest' : 'practice mode'}`, 'dim');
  log('Ctrl+Enter runs sample tests · Ctrl+Shift+Enter submits · code autosaves as you type.', 'dim');
  log('Mock judge: replace the TODO line to pass; unbalanced brackets produce a compilation error.', 'dim');
};
