/* =========================================================================
   CODE//ARENA — page logic for every screen.
   All event data comes from Firebase (backend.js): settings, registrations,
   problems, submissions, scores and announcements. Nothing is hardcoded.
   ========================================================================= */
import { configured, db, fs, call, session, ready, getRegistration, login, loginAdmin, logout, createAccount, lookupStudent, confirmPayment, payWithPayU, getData, getAll, watchAll, watchDoc, ms, errorMessage, authHeaders, uploadCertificateTemplate, resetParticipantPassword } from './backend.js';
import QRCode from 'qrcode';

/* ---------- Event state — loaded from Firestore config/* (Admin → Settings / Competition control) ---------- */
const DEFAULT_CONFIG = {
  name: '',
  edition: '',
  date: '',
  venue: '',
  organiser: '',
  college: '',
  capacity: 0,
  fee: 0,
  durationMin: 0,
  eligibleYears: [],
  regOpen: true,
  tabWatch: true,
  compUrl: '',
  resultsUrl: ''
};

const CONFIG = { ...DEFAULT_CONFIG };
let COMP = { status: 'scheduled', durationMin: 0 };
let PAID = null;

export const isCapacityReached = () => {
  const cap = Number(CONFIG.capacity);
  return cap > 0 && PAID >= cap;
};

export const isRegistrationOpen = () => {
  if (CONFIG.regOpen === false) return false;
  if (isCapacityReached()) return false;
  return true;
};

async function loadConfig() {
  try {
    const [event, comp, stats] = await Promise.all([
      getData('config/event'),
      getData('config/competition'),
      getData('config/stats')
    ]);
    if (event) {
      Object.assign(CONFIG, event);
      try { localStorage.setItem('ca_config', JSON.stringify(CONFIG)); } catch (_) {}
    }
    if (comp) {
      COMP = { status: 'scheduled', ...comp };
      try { localStorage.setItem('ca_comp', JSON.stringify(COMP)); } catch (_) {}
    }
    if (stats) {
      PAID = Number.isFinite(Number(stats.paid)) ? Number(stats.paid) : null;
      try { localStorage.setItem('ca_stats', JSON.stringify(stats)); } catch (_) {}
    }
  } catch (e) {
    console.warn('Could not read config from Firestore', e);
  }
}


/* ---------- Small utilities ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const pad = (n, w = 2) => String(n).padStart(w, '0');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => (n == null || n === '' || isNaN(Number(n))) ? '—' : '₹' + Number(n).toLocaleString('en-IN');
const initials = name => String(name ?? '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const eventDate = () => {
  if (!CONFIG.date) return null;
  const d = new Date(CONFIG.date);
  return isNaN(d.getTime()) ? null : d;
};
const fmtDate = (d, opts = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) => {
  if (!d) return '—';
  const parsed = d instanceof Date ? d : new Date(d);
  return isNaN(parsed.getTime()) ? '—' : parsed.toLocaleDateString('en-IN', opts);
};
const fmtTime = d => {
  if (!d) return '—';
  const parsed = d instanceof Date ? d : new Date(d);
  return isNaN(parsed.getTime()) ? '—' : parsed.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
};
const fmtDateTime = d => {
  if (!d) return '—';
  const parsed = d instanceof Date ? d : new Date(d);
  return isNaN(parsed.getTime()) ? '—' : parsed.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
};
const fmtClock = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`; };
const fmtMins = m => (m == null || m === '' || isNaN(Number(m))) ? '—' : `${Math.floor(m / 60)}:${pad(Math.floor(m) % 60)}:${pad(Math.round((m % 1) * 60) % 60)}`;
const brandHTML = name => esc(name).replace('//', '<span class="sep">//</span>');
const ago = t => {
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? 'Just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : fmtDate(t, { day: 'numeric', month: 'short' });
};
const csvLine = line => line.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',');

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
   SHARED DATA HELPERS
   ========================================================================= */
const COMP_LABEL = { scheduled: 'Scheduled', live: 'Live now', ended: 'Ended', published: 'Results published' };
const COMP_BADGE = { scheduled: 'badge-info', live: 'badge-success', ended: 'badge-warn', published: 'badge-success' };
const contestOpen = () => ['live', 'ended', 'published'].includes(COMP.status);
const durationMin = () => Number(COMP.durationMin || CONFIG.durationMin) || 0;
const loadQuestions = async () => (await getAll('questions')).sort((a, b) => a.id.localeCompare(b.id));
/** Accepted points: −10 per earlier wrong attempt, never below half. */
const pointsFor = (points, attempts) => Math.max(points - 10 * (attempts - 1), points / 2);
/** Rank by score (desc), then completion time (asc). */
function rankRows(rows) {
  rows.sort((a, b) => b.score - a.score || (a.completion ?? 1e9) - (b.completion ?? 1e9));
  rows.forEach((r, i) => r.rank = i + 1);
  return rows;
}
const standings = async () => rankRows(await getAll('leaderboard'));
const TITLES = ['Winner', 'First Runner-up', 'Second Runner-up'];
const achievementTitle = rank => TITLES[rank - 1] || 'Top 10 Finisher';
const announcementsSorted = list => list.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (ms(b.at) ?? Date.now()) - (ms(a.at) ?? Date.now()));

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

function ticketHTML(s) {
  const d = eventDate(), revoked = s.ticket === 'revoked';
  const tid = s.ticketId || s.ticketNumber || '—';
  const regId = s.regId || s.uid || (s.roll ? 'REG-' + s.roll : '—');
  const dept = s.dept || s.branch || '—';
  const college = s.college || CONFIG.college || '—';
  const method = s.method || '—';
  const fee = s.amount != null ? money(s.amount) : '—';
  return `
  <article class="ticket print-area" aria-label="Event ticket">
    <div class="ticket-main">
      <div class="ticket-top">
        <span class="brand"><img src="/logo.png" alt="Logo" style="height:20px; vertical-align:middle; display:inline-block;" /></span>
        <span class="badge ${revoked ? 'badge-danger' : 'badge-success'}">${revoked ? 'Ticket revoked' : 'Payment confirmed'}</span>
      </div>
      <h2>${esc(s.name || '—')}</h2>
      <p class="who">${esc(s.course || '—')} · ${esc(dept)} · Year ${esc(s.year || '—')} — ${esc(college)}</p>
      <div class="ticket-grid">
        <div><span>Event</span><strong>${esc(CONFIG.name || '—')} ${esc(CONFIG.edition || '')}</strong></div>
        <div><span>Date</span><strong>${fmtDate(d)}</strong></div>
        <div><span>Reporting</span><strong>${d ? `${fmtTime(d.getTime() - 30 * 60000)} · Arena opens ${fmtTime(d)}` : '—'}</strong></div>
        <div><span>Venue</span><strong>${esc(CONFIG.venue || '—')}</strong></div>
        <div><span>Registration ID</span><strong style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:inline-block;max-width:140px;vertical-align:bottom;">${esc(regId)}</strong></div>
        <div><span>Payment</span><strong>${fee} · ${esc(method)}</strong></div>
      </div>
    </div>
    <div class="ticket-stub">
      <small>Admit one · Show at entry</small>
      <div class="qr" data-qr="${esc(`${[CONFIG.name, CONFIG.edition].filter(Boolean).join(' ')}\nTicket ${tid}\nRoll ${s.roll || '—'}\n${s.name || '—'}`)}"></div>
      <div><div class="tid" style="font-size:22px">${esc(tid)}</div><small>Ticket ID</small></div>
      <small>${esc(s.roll || '—')}</small>
    </div>
  </article>`;
}

/** Renders every [data-qr] placeholder as a scannable QR code; scanning shows the ticket number. */
function fillQr(root = document) {
  $$('[data-qr]', root).forEach(el => QRCode.toString(el.dataset.qr, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#111411', light: '#f2f4ef' } })
    .then(svg => { el.innerHTML = svg; el.setAttribute('role', 'img'); el.setAttribute('aria-label', 'Ticket QR code'); }));
}

function icsFile(s) {
  const d = eventDate(), end = new Date(d.getTime() + (durationMin() + 30) * 60000);
  const f = x => x.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CODE ARENA//Event//EN', 'BEGIN:VEVENT',
    `UID:${s.ticketId}@codearena`, `DTSTAMP:${f(new Date())}`, `DTSTART:${f(d)}`, `DTEND:${f(end)}`,
    `SUMMARY:${CONFIG.name} ${CONFIG.edition ?? ''}`, `LOCATION:${CONFIG.venue ?? ''}`,
    `DESCRIPTION:Ticket ${s.ticketId}. Bring your college ID.`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
}
function downloadIcs(s) {
  if (!eventDate()) return toast('The event date has not been announced yet', 'warn');
  downloadFile(`${CONFIG.name.replace(/\W+/g, '-')}.ics`, icsFile(s), 'text/calendar');
  toast('Calendar file downloaded');
}

/* =========================================================================
   GLOBAL CHROME — brand text, config bindings, icons, sign-in
   ========================================================================= */
const ORDINAL = { 1: '1st', 2: '2nd', 3: '3rd' };
const yearLabel = y => ORDINAL[y] || `${y}th`;
function applyConfig() {
  $$('[data-brand]').forEach(el => el.innerHTML = brandHTML(CONFIG.name || 'CODE ARENA'));
  const d = eventDate(), cap = Number(CONFIG.capacity) || 0;
  const dur = durationMin();
  // Schedule: reporting 30 min before the start, briefing 10 min before, results 15 min after the arena closes
  const at = mins => d ? fmtTime(d.getTime() + mins * 60000) : '—';
  const years = (CONFIG.eligibleYears || []).map(yearLabel);
  const remaining = cap ? Math.max(0, cap - PAID) : '—';
  const open = isRegistrationOpen();
  const full = isCapacityReached();

  const values = {
    reportTime: at(-30), briefTime: at(-10),
    closeTime: dur > 0 ? at(dur) : '—',
    resultsTime: dur > 0 ? at(dur + 15) : '—',
    eligibility: years.length ? `${years.length > 1 ? years.slice(0, -1).join(', ') + ' and ' + years.at(-1) : years[0]} year students only` : (CONFIG.college ? 'Open to all students' : '—'),
    name: CONFIG.name || '—', edition: CONFIG.edition || '', venue: CONFIG.venue || '—',
    fee: CONFIG.fee != null && CONFIG.fee !== '' && Number(CONFIG.fee) > 0 ? money(CONFIG.fee) : '—',
    date: fmtDate(d), dateLong: fmtDate(d, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    time: fmtTime(d), capacity: cap > 0 ? cap : '—', duration: dur > 0 ? dur : '—',
    seatsLeft: cap > 0 ? (remaining === 0 ? '0 (Full)' : remaining) : '—', registered: PAID != null ? PAID : '—', organiser: CONFIG.organiser || '—',
    regStatus: !open ? (full ? 'Closed (Capacity full)' : 'Closed') : 'Open'
  };
  $$('[data-cfg]').forEach(el => {
    const key = el.dataset.cfg;
    const val = values[key];
    if (key === 'edition') {
      el.textContent = val || '';
    } else {
      el.textContent = (val !== undefined && val !== '') ? val : '—';
    }
  });
  $$('[data-seats-bar]').forEach(el => el.style.width = cap ? Math.min(100, PAID / cap * 100) + '%' : '0');
  // Update register CTAs across landing page
  $$('a[href="/register"]').forEach(a => {
    if (!a.dataset.origText) a.dataset.origText = a.textContent.trim();
    if (!open && !session.user) {
      a.textContent = full ? 'Registration Full · Seats Booked' : 'Registrations Closed';
      a.style.opacity = '0.75';
      a.style.filter = 'grayscale(0.5)';
      a.title = full ? 'Event registration target reached. Registration is now closed.' : 'Registrations for this event are closed.';
    } else {
      a.textContent = a.dataset.origText;
      a.style.opacity = '';
      a.style.filter = '';
      a.title = '';
    }
  });

  if (document.body.dataset.page === 'dashboard' && location.hash === '#results' && window.__currentStudent) {
    loadMyResults(window.__currentStudent).then(res => renderMyResults(res, window.__currentStudent));
  }
}

function hydrateIcons(root = document) {
  $$('[data-icon]', root).forEach(el => { el.outerHTML = icon(el.dataset.icon); });
}

/** Only same-site paths are followed after login. */
const safeNext = n => /^\/(?!\/)/.test(n || '') ? n : null;
const goLogin = () => location.replace('/?login=1&next=' + encodeURIComponent(location.pathname + location.hash));
const homeFor = s => s.isAdmin ? '/admin' : s.reg?.payment === 'paid' ? '/dashboard' : '/register';

/** Students: paid registration required. Others are sent where they belong. */
function requireStudent() {
  if (session.isAdmin) { location.replace('/admin'); return null; }
  if (!session.user || !(session.reg?.payment === 'paid' || session.reg?.paid)) {
    goLogin();
    return null;
  }
  return session.reg;
}

/** Student Login: roll number + password. */
function openLogin(next) {
  const existing = document.querySelector('dialog.modal #login-form');
  if (existing) {
    existing.closest('dialog')?.focus();
    return;
  }

  if (next?.startsWith('/admin')) {
    modal({
      title: 'Organiser Login', confirm: 'Log in', cancel: 'Cancel',
      body: `<p style="color:var(--text-2);font-size:14px;line-height:1.5;margin-bottom:16px">Sign in with the organiser account to open the admin console.</p>
        <form id="admin-login-modal-form" style="display:grid;gap:14px" novalidate>
          <div class="field"><label for="am-id" style="font-size:12.5px;font-weight:600;color:var(--text)">Admin ID</label><input class="input" id="am-id" name="id" placeholder="admin" autocomplete="username" required></div>
          <div class="field"><label for="am-pass" style="font-size:12.5px;font-weight:600;color:var(--text)">Password</label><input class="input" id="am-pass" name="password" type="password" autocomplete="current-password" required></div>
          <p id="am-err" role="alert" style="font-size:13px;color:var(--danger);margin:4px 0 0" hidden></p>
          <button type="submit" hidden></button>
        </form>`,
      onOpen: dlg => {
        setTimeout(() => $('#am-id', dlg)?.focus(), 80);
        $('#admin-login-modal-form', dlg).onsubmit = e => { e.preventDefault(); $('[data-act="ok"]', dlg)?.click(); };
      },
      onConfirm: dlg => {
        const id = $('#am-id', dlg).value.trim(), pw = $('#am-pass', dlg).value;
        const err = $('#am-err', dlg), btn = $('[data-act="ok"]', dlg);
        const fail = msg => { err.textContent = msg; err.hidden = false; btn.disabled = false; btn.textContent = 'Log in'; };
        if (!id || !pw) { fail('Enter the admin ID and password.'); return false; }
        btn.disabled = true; btn.textContent = 'Logging in…'; err.hidden = true;
        loginAdmin(id, pw).then(() => {
          dlg.close();
          location.href = '/admin';
        }).catch(e => fail(/invalid-credential|wrong-password|user-not-found/.test(e.code) ? 'Wrong admin ID or password.' : errorMessage(e)));
        return false;
      }
    });
    return;
  }

  modal({
    title: 'Student Login', confirm: 'Log in', cancel: 'Cancel',
    body: `<p style="color:var(--text-2);font-size:14px;line-height:1.5;margin-bottom:16px">Enter your roll number and password to access your student dashboard.</p>
      <form id="login-form" style="display:grid;gap:14px" novalidate>
        <div class="field"><label for="l-id" style="font-size:12.5px;font-weight:600;color:var(--text)">Roll number</label><input class="input" id="l-id" name="id" placeholder="e.g. 23B91A0501" autocomplete="username" autocapitalize="characters" required style="font-weight:600;letter-spacing:0.03em"></div>
        <div class="field"><label for="l-pass" style="font-size:12.5px;font-weight:600;color:var(--text)">Password</label><input class="input" id="l-pass" name="password" type="password" placeholder="Your password" autocomplete="current-password" required></div>
        <p id="l-err" role="alert" style="font-size:13px;color:var(--danger);margin:4px 0 0" hidden></p>
        <button type="submit" hidden></button>
      </form>
      <p class="muted" style="font-size:13px;margin-top:16px">Not registered yet? <a href="/register" style="color:var(--accent);font-weight:600;text-decoration:none">Register now →</a></p>`,
    onOpen: dlg => {
      setTimeout(() => $('#l-id', dlg)?.focus(), 80);
      $('#login-form', dlg).onsubmit = e => { e.preventDefault(); $('[data-act="ok"]', dlg)?.click(); };
    },
    onConfirm: dlg => {
      const id = $('#l-id', dlg).value.trim(), pw = $('#l-pass', dlg).value;
      const err = $('#l-err', dlg), btn = $('[data-act="ok"]', dlg);
      const fail = msg => { err.textContent = msg; err.hidden = false; btn.disabled = false; btn.textContent = 'Log in'; };
      if (!id || !pw) { fail('Enter your roll number and password.'); return false; }
      btn.disabled = true; btn.textContent = 'Logging in…'; err.hidden = true;
      login(id, pw).then(async s => {
        const n = safeNext(next);
        if (s.isAdmin) {
          dlg.close();
          location.href = '/admin';
          return;
        }
        let reg = s.reg;
        if (!reg || reg.payment !== 'paid') {
          reg = await getRegistration().catch(() => null);
        }
        if (reg?.payment === 'paid' || reg?.paid) {
          dlg.close();
          location.href = (n && !n.startsWith('/admin')) ? n : '/dashboard';
        } else if (reg) {
          fail('Your registration payment is still pending. Please complete payment to access the dashboard.');
          setTimeout(() => { location.href = '/register'; }, 1200);
        } else {
          fail('No active registration found for this roll number. Please register first.');
          setTimeout(() => { location.href = '/register'; }, 1200);
        }
      }).catch(e => fail(errorMessage(e)));
      return false;
    }
  });
}

const signOut = () => modal({
  title: 'Sign out?', body: '<p>You will return to the event site.</p>',
  confirm: 'Sign out', onConfirm: () => { logout().finally(() => { location.href = '/'; }); }
});

/* Delegated click listener for all sign-out buttons across the application */
document.addEventListener('click', e => {
  const signoutBtn = e.target.closest('[data-signout]');
  if (signoutBtn) {
    e.preventDefault();
    e.stopPropagation();
    signOut();
  }
});

/** Sidebar navigation for the two dashboards (hash-based views). */
function initAppShell(titles, onShow) {
  const sidebar = $('.sidebar'), scrim = $('.scrim');
  const setOpen = open => { sidebar?.classList.toggle('open', open); scrim?.classList.toggle('show', open); };
  $('.menu-btn')?.addEventListener('click', () => setOpen(true));
  scrim?.addEventListener('click', () => setOpen(false));

  const show = () => {
    const rawHash = location.hash.replace(/^#/, '');
    const id = (rawHash && titles[rawHash]) ? rawHash : Object.keys(titles)[0];
    $$('[data-view]').forEach(v => v.hidden = v.dataset.view !== id);
    $$('.side-nav a').forEach(a => {
      const href = a.getAttribute('href');
      a.classList.toggle('active', href === '#' + id || href === id);
    });
    const h1 = $('.topbar h1');
    if (h1 && titles[id]) h1.textContent = titles[id];
    setOpen(false);
    const mainEl = $('.main');
    if (mainEl) mainEl.scrollTo(0, 0);
    else window.scrollTo(0, 0);
    onShow?.(id);
  };

  window.addEventListener('hashchange', show);

  // Direct click handler on all hash navigation links inside the app shell
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#"]');
    if (a && a.closest('.app')) {
      const targetId = a.getAttribute('href').slice(1);
      if (titles[targetId]) {
        e.preventDefault();
        if (location.hash !== '#' + targetId) {
          location.hash = '#' + targetId;
        } else {
          show();
        }
      }
    }
  });

  show();
}

/* Global interception for Dashboard and Admin links so they open instantly from ANY page and before network promises finish */
document.addEventListener('click', e => {
  const dashBtn = e.target.closest('[data-dashboard-link], a[href="/dashboard"]');
  if (dashBtn) {
    if (document.body.dataset.page === 'dashboard' && (dashBtn.getAttribute('href')?.startsWith('#') || !dashBtn.getAttribute('href')?.startsWith('/dashboard'))) return;
    e.preventDefault();
    e.stopPropagation();
    if (session.user && !session.isAdmin && (session.reg?.payment === 'paid' || session.reg?.paid)) {
      location.href = '/dashboard';
    } else {
      openLogin('/dashboard');
    }
    return;
  }

  const adminBtn = e.target.closest('[data-admin-link], a[href="/admin"]');
  if (adminBtn) {
    if (document.body.dataset.page === 'admin') return;
    e.preventDefault();
    e.stopPropagation();
    if (session.user && session.isAdmin) {
      location.href = '/admin';
    } else {
      openLogin('/admin');
    }
    return;
  }
}, true);

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

  renderHeroPanel();

  $$('[data-dashboard-link]').forEach(b => {
    b.onclick = e => {
      e.preventDefault();
      if (session.user && !session.isAdmin && (session.reg?.payment === 'paid' || session.reg?.paid)) {
        location.href = '/dashboard';
      } else {
        openLogin('/dashboard');
      }
    };
  });

  $$('[data-admin-link]').forEach(b => {
    b.onclick = e => {
      e.preventDefault();
      if (session.user && session.isAdmin) {
        location.href = '/admin';
      } else {
        openLogin('/admin');
      }
    };
  });

  $$('[data-login]').forEach(b => {
    if (session.user) {
      b.textContent = session.isAdmin ? 'Admin' : 'Dashboard';
      b.onclick = () => { location.href = homeFor(session); };
    } else {
      b.textContent = 'Login';
      b.onclick = () => openLogin();
    }
  });
  const params = new URLSearchParams(location.search);
  if (params.has('login') && !(session.user && !session.isAdmin && (session.reg?.payment === 'paid' || session.reg?.paid))) {
    openLogin(params.get('next') || '/dashboard');
  }
  if (!isRegistrationOpen()) {
    const el = $('#hero-reg-state');
    if (el) el.textContent = isCapacityReached() ? 'Capacity reached · Closed' : 'Registrations closed';
  }

  // Final standings, once the organisers publish results
  if (COMP.status === 'published') standings().then(rows => {
    if (!rows.length) return;
    $('#hero-standings-list').innerHTML = rows.slice(0, 4).map(r => `<li><b>${r.rank}</b><span>${esc(r.name)}</span><span>${r.score}</span></li>`).join('');
    $('#hero-standings').hidden = false;
  });
}

/** Hero panel: the event's live settings and status, with a real clock —
    countdown to the start, then time remaining while the contest is live. */
function renderHeroPanel() {
  const d = eventDate(), cap = Number(CONFIG.capacity) || 0, q = v => JSON.stringify(String(v ?? '—'));
  const code = [
    `// ${[CONFIG.name, CONFIG.edition].filter(Boolean).join(' ')} · live from the event database`,
    'const event = {',
    `  date:  ${q(fmtDate(d))},`,
    `  start: ${q(fmtTime(d))},`,
    `  venue: ${q(CONFIG.venue)},`,
    `  fee:   ${q(money(CONFIG.fee))},`,
    '};',
    `seats.left = ${cap ? Math.max(0, cap - PAID) : 0};   // of ${cap || '—'}`,
    `registration.open = ${isRegistrationOpen()};`,
    `contest.status = ${q(COMP.status)};`
  ].join('\n');
  $('#hero-code').innerHTML = highlight(code, 'cpp').trimEnd() + '<span class="cursor"></span>';
  $('#hero-ln').innerHTML = code.split('\n').map((_, i) => i + 1).join('<br>');
  $('#hero-status').textContent = COMP_LABEL[COMP.status];
  const clock = $('[data-hero-clock]');
  const tick = () => {
    let left = COMP.status === 'live' ? ms(COMP.startedAt) + durationMin() * 60000 - Date.now()
      : COMP.status === 'scheduled' && d ? d.getTime() - Date.now() : 0;
    const days = Math.floor(Math.max(0, left) / 864e5);
    clock.textContent = (days ? `${days}d ` : '') + fmtClock(left - days * 864e5);
  };
  tick(); setInterval(tick, 1000);
}

/* =========================================================================
   PAGE: REGISTRATION — roll lookup → create password → PayU → ticket
   ========================================================================= */
function initRegister() {
  // The college records API sleeps when idle and takes 30–60 s to wake: start waking it now,
  // while the student is still typing their roll number.
  fetch('https://mlrit-api.onrender.com/', { mode: 'no-cors' }).catch(() => {});
  const go = step => {
    $$('[data-step]').forEach(p => p.hidden = Number(p.dataset.step) !== step);
    $$('.stepper li').forEach((li, i) => {
      li.classList.toggle('active', i + 1 === step);
      li.classList.toggle('done', i + 1 < step);
    });
    $('.order-summary').hidden = step === 3;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const rollInput = $('#reg-roll'), card = $('#student-card'), empty = $('#student-empty'), nextBtn = $('#step1-next');
  const phoneInput = $('#reg-phone'), passInput = $('#reg-pass'), pass2Input = $('#reg-pass2'), agreeInput = $('#agree');
  let student = null, lookupSeq = 0, timer;

  const cleanPhone = val => (val || '').replace(/\D/g, '').slice(-10);

  function checkStep1Validity() {
    if (!student) {
      nextBtn.disabled = true;
      return false;
    }
    const rawPhone = cleanPhone(phoneInput?.value);
    const pw = passInput?.value || '';
    const pw2 = pass2Input?.value || '';
    const agree = !!agreeInput?.checked;

    const isPhoneValid = /^[6-9]\d{9}$/.test(rawPhone);
    const isPwValid = pw.length >= 8 && pw === pw2;

    const canSubmit = isPhoneValid && isPwValid && agree;
    nextBtn.disabled = !canSubmit;

    const hint = $('#phone-hint');
    if (hint && phoneInput) {
      if (!phoneInput.value.trim()) {
        hint.textContent = 'Enter your 10-digit mobile number to enable submit & pay.';
        hint.style.color = '';
      } else if (!isPhoneValid) {
        hint.textContent = 'Please enter a valid 10-digit mobile number starting with 6, 7, 8, or 9.';
        hint.style.color = 'var(--danger)';
      } else {
        hint.textContent = '✓ Mobile number verified.';
        hint.style.color = 'var(--success)';
      }
    }

    return canSubmit;
  }

  phoneInput?.addEventListener('input', () => {
    phoneInput.value = phoneInput.value.replace(/\D/g, '').slice(0, 10);
    checkStep1Validity();
  });
  passInput?.addEventListener('input', checkStep1Validity);
  pass2Input?.addEventListener('input', checkStep1Validity);
  agreeInput?.addEventListener('change', checkStep1Validity);

  function setEmpty(title, msg) {
    student = null;
    card.hidden = true; empty.hidden = false;
    $('#student-empty-title').textContent = title;
    $('#student-empty-msg').textContent = msg;
    nextBtn.disabled = true;
    checkStep1Validity();
  }
  function renderStudent(s) {
    student = s;
    empty.hidden = true; card.hidden = false;
    const courseText = s.branch && !s.course.includes(s.branch) ? `${s.course} (${s.branch})` : s.course;
    const yearText = s.year ? `${yearLabel(s.year)} Year` : '—';
    Object.entries({
      'disp-name': s.name,
      'disp-course': courseText,
      'disp-year': yearText,
      'disp-roll': s.roll,
      'disp-gmail': s.email,
      'header-student-name': s.name,
      'header-student-roll': s.roll
    }).forEach(([id, v]) => {
      const el = $('#' + id);
      if (el) el.textContent = v || '—';
    });
    const avatar = $('#student-avatar');
    if (avatar) avatar.textContent = initials(s.name);
    if (s.phone && phoneInput && !phoneInput.value) {
      phoneInput.value = cleanPhone(s.phone);
    }
    checkStep1Validity();
    phoneInput?.focus();
  }
  async function lookup() {
    const rawVal = rollInput.value.trim();
    const roll = rawVal.toUpperCase();
    if (roll.length < 4) return setEmpty('Awaiting Roll Number', 'Enter your roll number to display your Name, Course, Branch, and Gmail.');
    if (roll.length !== 10) return setEmpty('Awaiting Roll Number', 'Enter your 10-character roll number (e.g. 25R21A05LL).');
    const seq = ++lookupSeq;
    setEmpty('Searching details…', `Contacting student records server… Searching details for ${roll}…`);

    // If server takes time to respond (e.g. Render server waking up from sleep)
    const serverWarmupTimer = setTimeout(() => {
      if (seq === lookupSeq) {
        setEmpty('Waking up server…', 'The server is waking up. Please wait a few seconds, details are searching…');
      }
    }, 2500);

    const serverWarmupTimer2 = setTimeout(() => {
      if (seq === lookupSeq) {
        setEmpty('Still searching…', 'Server is warming up, please wait a few seconds while details are being retrieved…');
      }
    }, 7000);

    try {
      const s = await lookupStudent(roll);
      clearTimeout(serverWarmupTimer);
      clearTimeout(serverWarmupTimer2);
      if (seq === lookupSeq) {
        renderStudent(s);
        if (s.alreadyRegistered) {
          nextBtn.disabled = true;
          modal({
            title: 'Already registered',
            cancel: 'Close',
            confirm: null,
            body: `<p>This roll number is already registered. Please close this message and use <a href="/?login=1" style="color:var(--accent);font-weight:600">student login</a> to access the dashboard.</p>`
          });
        }
      }
    } catch (e) {
      clearTimeout(serverWarmupTimer);
      clearTimeout(serverWarmupTimer2);
      if (seq === lookupSeq) setEmpty('Not available', e.message || errorMessage(e));
    }
  }
  rollInput.addEventListener('input', () => {
    rollInput.value = rollInput.value.toUpperCase();
    clearTimeout(timer); timer = setTimeout(lookup, 500);
  });
  rollInput.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault(); clearTimeout(timer);
    student ? (phoneInput ? phoneInput.focus() : $('#reg-pass').focus()) : lookup();
  });

  let pendingCheckout = null;

  // Step 1 → Validate student, check for existing account, and move to payment
  // NOTE: Student details are NOT saved to storage or Firestore here.
  // They are only permanently saved upon successful payment confirmation!
  nextBtn.addEventListener('click', async () => {
    if (!isRegistrationOpen()) {
      return toast(isCapacityReached() ? `Registration capacity reached (${CONFIG.capacity} seats filled). Registration is closed.` : 'Registrations are closed.', 'error');
    }
    if (!student) return toast('Enter a valid roll number first', 'warn');
    if (student.alreadyRegistered) {
      return toast('This roll number is already registered. Log in to access the dashboard.', 'warn');
    }
    const rawPhone = cleanPhone(phoneInput?.value);
    if (!/^[6-9]\d{9}$/.test(rawPhone)) {
      phoneInput?.focus();
      return toast('Enter your 10-digit mobile number before proceeding to payment.', 'warn');
    }
    const pw = passInput.value, pw2 = pass2Input.value;
    if (pw.length < 8) { passInput.focus(); return toast('Password must be at least 8 characters', 'warn'); }
    if (pw !== pw2) { pass2Input.focus(); return toast('Passwords do not match', 'warn'); }
    if (!agreeInput.checked) { agreeInput.focus(); return toast('Please agree to the competition rules to continue', 'warn'); }

    student.phone = rawPhone;
    nextBtn.disabled = true;
    try {
      await createAccount(student.roll, pw);
      const existing = await getRegistration();
      if (existing?.payment === 'paid') { showSuccess(existing, true); go(3); return; }
      pendingCheckout = { student: { ...student, phone: rawPhone } };
      try { sessionStorage.setItem('codearena_pending_checkout', JSON.stringify(pendingCheckout.student)); } catch (_) {}

      // Set up Step 2 payment view
      toPayment(student);

      // Immediately launch PayU checkout right after submission of creation details!
      toast('Opening PayU checkout…', 'info');
      processCheckout(false);
    } catch (e) {
      console.error('Check error:', e);
      toast(errorMessage(e), 'error');
    } finally {
      checkStep1Validity();
    }
  });

  const payView = which => $$('[data-pay-view]').forEach(v => v.hidden = v.dataset.payView !== which);
  function toPayment(s) {
    const r = s || (pendingCheckout && pendingCheckout.student) || student || {};
    const courseText = r.branch && !r.course?.includes(r.branch) ? `${r.course} (${r.branch})` : (r.course || '—');

    const nameEl = $('#pay-student-name');
    if (nameEl) nameEl.textContent = r.name || '—';
    const rollEl = $('#pay-student-roll');
    if (rollEl) rollEl.textContent = r.roll || '';
    const phoneEl = $('#pay-student-phone');
    if (phoneEl) phoneEl.textContent = r.phone ? '+91 ' + r.phone : '—';
    const courseEl = $('#pay-student-course');
    if (courseEl) courseEl.textContent = `${courseText} · Year ${r.year || '—'}`;
    const avatarEl = $('#pay-avatar');
    if (avatarEl) avatarEl.textContent = initials(r.name);
    const amountEl = $('#pay-total-amount');
    if (amountEl) amountEl.textContent = money(CONFIG.fee);

    const backBtn = $('#step2-back');
    if (backBtn) {
      backBtn.hidden = false;
      backBtn.onclick = () => go(1);
    }

    payView('form');
    go(2);
  }

  // Payment: PayU Checkout, then the ticket is issued
  let checkoutStarted = false;
  async function processCheckout() {
    // One PayU hand-off per page: a second press while the first is redirecting would open another session
    if (checkoutStarted) return;
    if (!isRegistrationOpen()) {
      payView('form');
      return toast(isCapacityReached() ? `Target capacity reached (${CONFIG.capacity} seats taken). Registration is closed.` : 'Registrations are closed.', 'error');
    }
    if (!pendingCheckout || !pendingCheckout.student) {
      toast('Registration session expired. Please re-enter your details.', 'warn');
      go(1);
      return;
    }

    checkoutStarted = true;
    payView('processing');
    try {
      const paid = await payWithPayU({
        name: CONFIG.name,
        description: `Entry pass · ${pendingCheckout.student.roll}`,
        prefill: pendingCheckout.student
      });


      PAID++;
      applyConfig();
      showSuccess(paid);
      go(3);
      toast(`Payment confirmed! Ticket ${paid.ticketNumber || paid.ticketId || 'issued'} generated.`);
    } catch (e) {
      checkoutStarted = false;   // the hand-off didn't happen; allow a retry
      if (e?.cancelled) {
        payView('form');
        toast('Payment was cancelled', 'info');
        return;
      }
      console.error('Payment failure:', e);
      $('#pay-fail-msg').textContent = errorMessage(e);
      payView('failed');
    }
  }

  $('#pay-btn')?.addEventListener('click', () => processCheckout());
  $('#retry-btn')?.addEventListener('click', () => payView('form'));

  function showSuccess(s, returning = false) {
    const first = String(s.name).split(' ')[0];
    $('#success-title').textContent = returning ? `You're already registered, ${first}` : `You're in, ${first}.`;
    let regId = s.regId || s.uid || '—';
    $('#success-reg').textContent = regId.length > 15 ? regId.slice(0, 15) + '...' : regId;
    $('#success-ticket').textContent = s.ticketId || s.ticketNumber || '—';
    $('#success-mail').textContent = s.roll;
    
    const dashBtn = $('.reg-actions a[href="/dashboard"]');
    if (dashBtn) {
      dashBtn.onclick = (e) => {
        e.preventDefault();
        location.href = '/dashboard';
      };
    }
    $$('[data-signout]').forEach(b => b.onclick = signOut);
  }

  const reg = session.reg;
  if (reg?.payment === 'paid' || reg?.paid) {
    showSuccess(reg, true);
    go(3);
  } else {
    // Check if returning from PayU Hosted Checkout redirect
    const urlParams = new URLSearchParams(window.location.search);
    const paymentStatus = urlParams.get('payment');
    const incomingTxnid = urlParams.get('txnid');

    if (paymentStatus === 'success') {
      payView('processing');
      const procMsg = $('#pay-processing p');
      if (procMsg) procMsg.textContent = 'Payment successful! Confirming your registration…';
      go(2);

      let savedContext = null;
      try {
        savedContext = JSON.parse(sessionStorage.getItem('codearena_pending_checkout') || 'null');
      } catch (_) {}

      (async () => {
        try {
          await ready();
          const confirmed = await confirmPayment(incomingTxnid, savedContext);
          if (confirmed) {
            PAID++;
            applyConfig();
            showSuccess(confirmed);
            go(3);
            toast(`Payment confirmed! Ticket ${confirmed.ticketId || confirmed.ticketNumber || 'issued'} generated.`);
            try { sessionStorage.removeItem('codearena_pending_checkout'); } catch (_) {}
            window.history.replaceState({}, '', window.location.pathname);
            return;
          }
        } catch (err) {
          console.warn('Payment confirmation:', err);
        }

        const existing = await getRegistration();
        if (existing?.payment === 'paid') {
          showSuccess(existing);
          go(3);
          window.history.replaceState({}, '', window.location.pathname);
        } else {
          $('#pay-fail-msg').textContent = 'Your payment was received but is still being verified. Please refresh this page in a moment.';
          payView('failed');
          go(2);
        }
      })();
      return;
    } else if (paymentStatus === 'failed' || paymentStatus === 'error') {
      const errorMsg = urlParams.get('msg') || 'Payment was cancelled or could not be completed.';
      $('#pay-fail-msg').textContent = errorMsg;
      payView('failed');
      go(2);
      toast(errorMsg, 'error');
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }

    go(1);
    if (session.user) {
      confirmPayment().then(r => { if (r) { showSuccess(r); go(3); } }).catch(() => {});
    }
    if (!isRegistrationOpen()) {
      const full = isCapacityReached();
      setEmpty(
        full ? 'Registration Desk Closed' : 'Registrations Closed',
        full ? `The registration target of ${CONFIG.capacity} participants has been reached. The registration desk is officially closed.`
             : 'Registrations for this event are closed.'
      );
      rollInput.disabled = true;
      if ($('#reg-pass')) $('#reg-pass').disabled = true;
      if ($('#reg-pass2')) $('#reg-pass2').disabled = true;
      if (nextBtn) nextBtn.disabled = true;
    }
  }
}

/* =========================================================================
   PAGE: TICKET
   ========================================================================= */
async function initTicket() {
  let s = session.reg;
  if (!s && session.user && !session.isAdmin) {
    const slot = $('#ticket-slot');
    if (slot) {
      slot.innerHTML = `<div class="card empty" style="max-width:860px;margin:24px auto;padding:48px 24px;text-align:center">
        <div class="spinner" style="margin:0 auto 16px auto;width:32px;height:32px;border:3px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin .8s linear infinite"></div>
        <p style="font-weight:600;font-size:16px;color:var(--text)">Loading your ticket...</p>
        <p class="muted" style="font-size:13px;margin-top:6px">Retrieving your verified pass from the arena database.</p>
      </div>`;
    }
    s = await getRegistration();
  }
  if (!s) s = requireStudent();
  if (!s) return;
  $('#ticket-slot').innerHTML = ticketHTML(s);
  fillQr();
  $('#print-ticket').onclick = () => window.print();
  $('#copy-ticket').onclick = () => copyText(s.ticketId, `Ticket ID ${s.ticketId} copied`);
  $('#add-cal').onclick = () => downloadIcs(s);
  
  const dashBtn = $('.simple-nav a[href="/dashboard"]');
  if (dashBtn) {
    dashBtn.onclick = (e) => {
      e.preventDefault();
      location.href = '/dashboard';
    };
  }

  if (new URLSearchParams(location.search).has('print')) setTimeout(() => window.print(), 400);
}

/* =========================================================================
   PAGE: STUDENT DASHBOARD
   ========================================================================= */
async function initDashboard() {
  let s = session.reg;
  if (!s || s.payment !== 'paid') {
    s = await getRegistration().catch(() => null);
  }
  if (!s || s.payment !== 'paid') {
    s = requireStudent();
    if (!s) return;
  }
  window.__currentStudent = s;

  const refreshResultsView = async () => {
    const student = s || window.__currentStudent || session.reg;
    const res = await loadMyResults(student);
    renderMyResults(res, student);
    renderCerts(student, res);
  };

  // 1. Initialize sidebar shell immediately so navigation between views works instantly
  const rulesSrc = document.getElementById('page-index')?.content.querySelector('#rules .rules-wrap');
  if (rulesSrc) { $('#dash-rules').replaceChildren(rulesSrc.cloneNode(true)); hydrateIcons($('#dash-rules')); }
  initAppShell({
    overview: 'Overview', registration: 'My registration', ticket: 'My ticket', arena: 'Competition arena', rules: 'Rules & scoring', results: 'Results', certificates: 'Certificates', profile: 'Profile'
  }, viewId => {
    if (viewId === 'results' || viewId === 'certificates') {
      refreshResultsView();
    }
  });
  $$('[data-signout]').forEach(b => b.onclick = signOut);
  const first = String(s.name || '').split(' ')[0] || 'Student';
  const hour = new Date().getHours();
  const greetingEl = $('#greeting');
  if (greetingEl) greetingEl.textContent = `${hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'}, ${first}`;
  const formattedPhone = s.phone ? (s.phone.startsWith('+91') ? s.phone : '+91 ' + s.phone) : '—';
  $$('[data-me]').forEach(el => {
    const key = el.dataset.me;
    if (key === 'phone') el.textContent = formattedPhone;
    else if (key === 'method') el.textContent = s.method || '—';
    else if (key === 'amount') el.textContent = s.amount != null ? money(s.amount) : '—';
    else el.textContent = s[key] || '—';
  });
  $$('[data-me-initials]').forEach(el => el.textContent = initials(s.name));
  const deptYearEl = $('#dash-dept-year');
  if (deptYearEl) {
    const dept = s.dept || s.branch;
    const year = s.year ? `Year ${s.year}` : null;
    deptYearEl.textContent = [dept, year].filter(Boolean).join(' · ') || '—';
  }

  const badge = `<span class="badge ${COMP_BADGE[COMP.status]}">${COMP_LABEL[COMP.status]}</span>`;
  const compStatusEl = $('#comp-status') || $('#arena-status');
  if (compStatusEl) compStatusEl.innerHTML = badge;
  const arenaCopyEl = $('#arena-copy');
  if (arenaCopyEl) {
    arenaCopyEl.textContent = CONFIG.compUrl
      ? 'The competition challenges are hosted on the official competition portal. Click below to open and participate.'
      : 'The competition challenges are hosted on an external platform. The organisers will activate the official link before the contest begins.';
  }

  // Countdown to event start
  const tick = () => {
    let left = Math.max(0, (eventDate()?.getTime() ?? 0) - Date.now());
    const parts = [864e5, 36e5, 6e4, 1e3].map(u => { const v = Math.floor(left / u); left -= v * u; return v; });
    $$('#countdown strong').forEach((el, i) => el.textContent = pad(parts[i]));
  };
  tick(); setInterval(tick, 1000);

  // Live announcements directly from database
  watchAll('announcements', list => {
    announcementsSorted(list);
    const when = a => ms(a.at) ? ago(ms(a.at)) : 'Just now';
    const annList = $('#announcements');
    if (annList) {
      annList.innerHTML = list.length ? list.map(a => `<li>
        <div class="when">${a.pinned ? '<span class="pin">Pinned</span> ·' : ''} ${when(a)}</div>
        <h4>${esc(a.title)}</h4><p>${esc(a.body)}</p></li>`).join('') : '<li><p class="muted">No announcements yet.</p></li>';
    }
    const notifList = $('#notif-list');
    if (notifList) {
      notifList.innerHTML = list.length ? list.map(a => `<a href="#overview"><strong>${esc(a.title)}</strong><span>${when(a)}</span></a>`).join('')
        : '<p class="muted" style="padding:8px 10px;font-size:13px">Nothing new.</p>';
    }
  });

  // Registration details
  const paidAt = ms(s.paidAt);
  const renderRegDetails = () => {
    const regIdStr = s.regId || s.uid || '—';
    const truncatedRegId = regIdStr.length > 15 ? regIdStr.slice(0, 15) + '...' : regIdStr;
    const regDetails = $('#reg-details');
    if (regDetails) {
      regDetails.innerHTML = [
        ['Registration ID', truncatedRegId], ['Full name', s.name], ['Email', s.email], ['Phone', s.phone ? '+91 ' + s.phone : '—'],
        ['College', s.college || CONFIG.college || '—'], ['Department', s.dept || s.branch || '—'], ['Course', (s.course && s.year) ? `${s.course} · Year ${s.year}` : (s.course || s.year || '—')], ['Roll number', s.roll || '—']
      ].map(([k, v]) => `<dt>${k}</dt><dd title="${k === 'Registration ID' ? esc(regIdStr) : ''}">${esc(v || '—')}</dd>`).join('');
    }
  };
  renderRegDetails();

  const payDetails = $('#pay-details');
  if (payDetails) {
    payDetails.innerHTML = [
      ['Status', s.payment === 'paid' ? 'Paid' : '—'], ['Amount', s.amount != null ? money(s.amount) : '—'], ['Method', s.method || '—'], ['Transaction', s.txn || '—'],
      ['Paid on', paidAt ? fmtDateTime(paidAt) : '—']
    ].map(([k, v]) => `<dt>${k}</dt><dd>${esc(v || '—')}</dd>`).join('');
  }
  const receiptBtn = $('#receipt-btn');
  if (receiptBtn) {
    receiptBtn.onclick = () => {
      const lines = [`${CONFIG.name} ${CONFIG.edition ?? ''} — Payment receipt`, '', `Registration ID : ${s.regId || '—'}`, `Name            : ${s.name || '—'}`, `Roll number     : ${s.roll || '—'}`, `Amount          : ${s.amount != null ? 'INR ' + s.amount : '—'}`, `Method          : ${s.method || '—'}`, `Transaction     : ${s.txn || '—'}`, `Paid on         : ${paidAt ? fmtDateTime(paidAt) : '—'}`];
      downloadFile(`receipt-${s.regId}.txt`, lines.join('\n'));
      toast('Receipt downloaded');
    };
  }

  // Ticket
  const dashTicket = $('#dash-ticket');
  if (dashTicket) {
    dashTicket.innerHTML = ticketHTML(s);
    fillQr();
  }
  const dashCopy = $('#dash-copy');
  if (dashCopy) dashCopy.onclick = () => copyText(s.ticketId, `Ticket ID ${s.ticketId} copied`);
  const dashCal = $('#dash-cal');
  if (dashCal) dashCal.onclick = () => downloadIcs(s);

  // Arena entry — external competition platform
  const openArenaPortal = () => {
    if (CONFIG.compUrl) {
      window.open(CONFIG.compUrl, '_blank', 'noopener,noreferrer');
    } else {
      modal({
        title: 'Competition Portal',
        body: '<p>The competition is hosted on an external platform. The organisers will activate the official link before the contest begins.</p><p style="margin-top:8px" class="muted">Check the announcements section for live updates.</p>',
        confirm: 'Got it',
        cancel: null
      });
    }
  };
  document.addEventListener('click', e => {
    if (e.target.closest('[data-enter-arena]')) {
      e.preventDefault();
      openArenaPortal();
    }
  });

  refreshResultsView();

  // Profile — changes save to Firestore registrations collection in real-time
  const pf = $('#profile-form');
  if (pf) {
    ['name', 'email', 'phone', 'college', 'roll'].forEach(k => { if (pf[k]) pf[k].value = s[k] || ''; });
    if (pf.dept) pf.dept.value = s.dept || s.branch || '';
    pf.addEventListener('submit', async e => {
      e.preventDefault();
      const phone = pf.phone.value.replace(/[\s-]/g, '').replace(/^(\+91|0)/, '');
      if (!/^[6-9]\d{9}$/.test(phone)) return toast('Enter a valid 10-digit Indian mobile number.', 'error');
      try {
        await fs.updateDoc(fs.doc(db, 'registrations', s.uid), { phone });
        s.phone = phone;
        if (session.reg) session.reg.phone = phone;
        try { localStorage.setItem(`ca_reg_${s.uid}`, JSON.stringify(session.reg)); } catch (_) {}
        renderRegDetails();
        toast('Profile saved in database');
      } catch (err) { toast(errorMessage(err), 'error'); }
    });
  }
}

/** The student's score, rank once published, and leaderboard standings. */
async function loadMyResults(s) {
  const [mine, subs, certs] = await Promise.all([
    s?.uid ? getData(`leaderboard/${s.uid}`).catch(() => null) : null,
    s?.uid ? getAll('submissions', fs.where('uid', '==', s.uid)).catch(() => []) : [],
    s?.uid ? getAll('certificates', fs.where('uid', '==', s.uid)).catch(() => []) : []
  ]);
  let rank = null, total = null, rows = [];
  if (COMP.status === 'published') {
    rows = await standings().catch(() => []);
    if (s?.uid) {
      rank = rows.find(r => r.id === s.uid)?.rank ?? null;
    }
    total = rows.length;
  }
  return { mine, rank, total, submitted: (subs || []).length, rows, certs };
}

function renderMyResults({ mine, rank, total, submitted, rows = [] }, s) {
  const el = $('#my-results');
  if (!el) return;
  const isLive = COMP.status === 'published';
  const subEl = $('#dash-results-sub');

  if (!isLive) {
    if (subEl) subEl.textContent = 'Results will appear here after the competition concludes.';
    const statusText = COMP.status === 'live' 
      ? 'The competition is currently live in progress.' 
      : COMP.status === 'ended' 
      ? 'The competition has ended and submissions are being evaluated.' 
      : 'The competition has not yet taken place.';
    el.innerHTML = `
      <div class="card empty" style="text-align:center;padding:56px 24px">
        <div style="width:64px;height:64px;border-radius:50%;background:rgba(255,255,255,0.04);border:1px solid var(--border);display:inline-flex;align-items:center;justify-content:center;margin:0 auto 18px;color:var(--text-dim)">
          ${icon('trophy')}
        </div>
        <h3 style="font-size:20px;font-weight:700;color:var(--text);margin-bottom:8px">Results not yet live</h3>
        <p style="color:var(--text-dim);max-width:480px;margin:0 auto 18px;font-size:14px;line-height:1.6">
          ${statusText} Official results and leaderboard standings will be published here after the event concludes.
        </p>
        <div style="display:inline-flex;align-items:center;gap:8px">
          <span class="badge ${COMP_BADGE[COMP.status] || 'badge-info'}">Status: ${COMP_LABEL[COMP.status] || 'Scheduled'}</span>
        </div>
      </div>`;
    return;
  }

  if (subEl) subEl.textContent = 'Official rankings and final scoreboard.';
  const externalUrl = CONFIG.resultsUrl || CONFIG.compUrl || '';
  const myUid = s?.uid || session?.reg?.uid || session?.user?.uid || '';
  const myRow = rows.find(r => r.id === myUid);
  const myRank = myRow?.rank ?? rank;
  const myScore = myRow?.score ?? mine?.score;

  let html = '';

  // 1. External Results Portal Banner (results data provided by external platform)
  if (externalUrl) {
    html += `
      <div class="card" style="margin-bottom:20px;background:linear-gradient(135deg,rgba(0,229,153,0.08),rgba(0,229,153,0.02));border:1px solid rgba(0,229,153,0.3)">
        <div class="card-body" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px">
          <div>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
              <span class="badge badge-success">Official Results Live</span>
              <span class="muted" style="font-size:12px">Official Competition Portal</span>
            </div>
            <h3 style="font-size:17px;font-weight:700;color:var(--text);margin:0">Official Results &amp; Scoreboard</h3>
            <p style="color:var(--text-dim);font-size:13.5px;margin-top:4px">Results and scoreboard data are provided by the official contest portal. Click below to view the verified leaderboard.</p>
          </div>
          <a class="btn btn-primary" href="${esc(externalUrl)}" target="_blank" rel="noopener noreferrer" style="white-space:nowrap;display:inline-flex;align-items:center;gap:6px">
            View Official Leaderboard ↗
          </a>
        </div>
      </div>`;
  }

  // 2. Personal Standing Highlight if student was ranked or participated
  if (myRank) {
    html += `
      <div class="grid g-3" style="margin-bottom:20px">
        <div class="card kpi"><div class="label">Your Rank</div><div class="value">#${myRank}<small>${total ? ` of ${total}` : ''}</small></div></div>
        <div class="card kpi"><div class="label">Your Score</div><div class="value">${myScore ?? 0} pts</div></div>
        <div class="card kpi"><div class="label">Status</div><div class="value" style="font-size:18px"><span class="badge badge-success">Completed</span></div></div>
      </div>`;
  }

  // 3. Leaderboard Table
  if (rows.length) {
    html += `
      <div class="card">
        <div class="card-head" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
          <div>
            <h3>Official Leaderboard</h3>
            <span class="muted" style="font-size:13px">Final scores for ${esc(CONFIG.name || 'CODE ARENA')}</span>
          </div>
          ${externalUrl ? `<a class="btn btn-ghost btn-sm" href="${esc(externalUrl)}" target="_blank" rel="noopener noreferrer">External scoreboard ↗</a>` : ''}
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Participant</th>
                <th>College</th>
                <th class="right">Score</th>
                <th class="right">Completion</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(r => {
                const isMe = r.id === myUid;
                return `
                <tr ${isMe ? 'style="background:rgba(0,229,153,0.08);font-weight:600"' : ''}>
                  <td class="rank-cell ${r.rank <= 3 ? 'top' : ''}">${pad(r.rank)}</td>
                  <td>
                    <div class="cell-person">
                      <span class="avatar">${initials(r.name)}</span>
                      <div>
                        <strong>${esc(r.name)}${isMe ? ' <span class="badge badge-sm" style="font-size:10px;padding:1px 5px">You</span>' : ''}</strong>
                        <small>${esc(r.dept || r.roll || '')}</small>
                      </div>
                    </div>
                  </td>
                  <td>${esc(r.college || '—')}</td>
                  <td class="num strong right">${r.score ?? 0} pts</td>
                  <td class="num right">${r.completion != null ? fmtMins(r.completion) : '—'}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  } else if (!externalUrl) {
    html += `
      <div class="card empty" style="text-align:center;padding:48px 20px">
        <p style="font-weight:600;font-size:16px;color:var(--text)">Results have been published</p>
        <p style="color:var(--text-dim);font-size:14px;margin-top:6px">The final results and rankings are live. Standings are being synchronized from the external contest platform.</p>
      </div>`;
  }

  el.innerHTML = html;
}

function renderCerts(s, { mine, rank, submitted, certs = [] }) {
  const el = $('#cert-list');
  if (!el) return;
  const participation = certs.find(c => c.type === 'participation');
  const achievement = certs.find(c => c.type === 'achievement');
  const issued = !!COMP.certsIssued;
  el.innerHTML = `
    <div class="card"><div class="card-head"><div><h3>Certificate of participation</h3><p class="muted" style="font-size:13px;margin-top:2px">Issued to everyone who competed</p></div>
      <span class="badge ${participation ? 'badge-success' : ''}">${participation ? 'Available' : issued ? 'Not eligible' : 'Not issued yet'}</span></div>
      <div class="card-body" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">${participation
        ? `<a class="btn btn-secondary btn-sm" href="/certificate?id=${encodeURIComponent(participation.id)}">${icon('eye')} View certificate</a><a class="btn btn-ghost btn-sm" href="/certificate?id=${encodeURIComponent(participation.id)}&print=1">${icon('download')} Download PDF</a>`
        : `<span class="muted" style="font-size:13px">${issued ? 'Only students who submitted in the arena receive one.' : 'Certificates are released after the results.'}</span>`}</div></div>
    <div class="card"><div class="card-head"><div><h3>Certificate of excellence</h3><p class="muted" style="font-size:13px;margin-top:2px">Awarded to ranks 1 and 2</p></div>
      <span class="badge ${achievement ? 'badge-success' : ''}">${achievement ? 'Available' : 'Locked'}</span></div>
      <div class="card-body" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">${achievement
        ? `<a class="btn btn-secondary btn-sm" href="/certificate?id=${encodeURIComponent(achievement.id)}">${icon('eye')} View certificate</a><a class="btn btn-ghost btn-sm" href="/certificate?id=${encodeURIComponent(achievement.id)}&print=1">${icon('download')} Download PDF</a>`
        : '<span class="muted" style="font-size:13px">Certificates of excellence are awarded to ranks 1 and 2.</span>'}</div></div>`;
}

/* =========================================================================
   PAGE: LEADERBOARD — public once results are published (organisers see it earlier)
   ========================================================================= */
async function initLeaderboard() {
  const published = COMP.status === 'published';
  $('#lb-status').innerHTML = published ? '<span class="badge badge-success">Final results</span>'
    : session.isAdmin ? '<span class="badge badge-warn">Provisional — organisers only</span>' : '<span class="badge">Not published yet</span>';
  const rows = published || session.isAdmin ? await standings() : [];

  $('#podium').innerHTML = rows.slice(0, 3).map((r, i) => `
    <button class="podium-item p${i + 1}" data-rank="${r.rank}">
      <div class="place"><span>${['Winner', 'First runner-up', 'Second runner-up'][i]}</span><b>${r.rank}</b></div>
      <h3>${esc(r.name)}${r.id === session.user?.uid ? ' (you)' : ''}</h3><div class="college">${esc(r.college)}</div>
      <div class="meta"><span><strong>${r.score}</strong> pts</span><span><strong>${r.solvedCount}/${(r.problems || []).length}</strong> solved</span><span><strong>${fmtMins(r.completion)}</strong></span></div>
    </button>`).join('');

  $('#lb-college').insertAdjacentHTML('beforeend', [...new Set(rows.map(r => r.college).filter(Boolean))].sort().map(c => `<option>${esc(c)}</option>`).join(''));

  let sort = { key: 'rank', dir: 1 }, limit = 50;
  const keyFn = {
    rank: r => r.rank, name: r => r.name, college: r => r.college, solved: r => r.solvedCount,
    score: r => r.score, time: r => r.completion ?? 1e9
  };
  const render = () => {
    const q = $('#lb-search').value.trim().toLowerCase();
    const college = $('#lb-college').value;
    const list = rows
      .filter(r => (!q || r.name.toLowerCase().includes(q) || String(r.college).toLowerCase().includes(q)) && (!college || r.college === college))
      .sort((a, b) => { const x = keyFn[sort.key](a), y = keyFn[sort.key](b); return (x > y ? 1 : x < y ? -1 : 0) * sort.dir; });
    $('#lb-more').hidden = list.length <= limit;
    $('#lb-body').innerHTML = list.length ? list.slice(0, limit).map(r => {
      const isMe = r.id === session.user?.uid;
      return `
      <tr class="clickable" data-rank="${r.rank}" ${isMe ? 'style="background:var(--accent-soft)"' : ''}>
        <td class="rank-cell ${r.rank <= 3 ? 'top' : ''}">${pad(r.rank)}</td>
        <td><div class="cell-person"><span class="avatar">${initials(r.name)}</span><div><strong style="color:var(--text);font-weight:550">${esc(r.name)}${isMe ? ' · You' : ''}</strong><small>${esc(r.dept)}</small></div></div></td>
        <td>${esc(r.college)}</td>
        <td><span class="solved-dots">${(r.problems || []).map(p => `<i class="${p.solved ? 'on' : ''}" title="${esc(p.id)}: ${p.solved ? 'solved' : 'not solved'}">${esc(p.id)}</i>`).join('')}</span></td>
        <td class="num strong">${r.score}</td>
        <td class="num">${fmtMins(r.completion)}</td>
      </tr>`;
    }).join('') : `<tr><td colspan="6"><div class="empty">${rows.length ? `No students match “${esc(q)}”.` : 'Results appear here once the organisers publish them.'}</div></td></tr>`;
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
    if (!rows.length) return toast('No results to export yet', 'warn');
    const csv = [['Rank', 'Name', 'College', 'Solved', 'Score', 'Completion'], ...rows.map(r => [r.rank, r.name, r.college, r.solvedCount, r.score, fmtMins(r.completion)])].map(csvLine).join('\n');
    downloadFile('leaderboard.csv', csv, 'text/csv'); toast('Leaderboard exported');
  };
  render();
}

/** Individual result + performance breakdown modal. */
function showResultDetail(r) {
  const ps = r.problems || [];
  modal({
    title: `${r.name} — rank #${r.rank}`, wide: true, confirm: null, cancel: 'Close',
    body: `
      <p>${esc(r.college)} · ${esc(r.dept)}${r.lang ? ' · ' + esc(r.lang) : ''}</p>
      <div class="grid g-3 mt">
        <div class="card kpi"><div class="label">Score</div><div class="value">${r.score}<small> / ${ps.reduce((a, p) => a + p.points, 0)}</small></div></div>
        <div class="card kpi"><div class="label">Solved</div><div class="value">${r.solvedCount}<small> / ${ps.length}</small></div></div>
        <div class="card kpi"><div class="label">Completion</div><div class="value">${fmtMins(r.completion)}</div></div>
      </div>
      <h4 style="margin:22px 0 8px;color:var(--text);font-size:14px">Points by problem</h4>
      ${ps.map(p => `<div class="bar-row"><span>${esc(p.id)}. ${esc(p.title)}</span><div class="track"><span style="width:${p.points ? p.got / p.points * 100 : 0}%"></span></div><span class="v">${p.got}/${p.points}</span></div>`).join('')}
      <div class="table-wrap mt" style="border:1px solid var(--border);border-radius:var(--r)"><table class="table"><thead><tr><th>Problem</th><th>Verdict</th><th>Attempts</th><th>Accepted at</th></tr></thead><tbody>
      ${ps.map(p => `<tr><td class="strong">${esc(p.id)}</td><td>${p.solved ? '<span class="badge badge-success">Accepted</span>' : '<span class="badge badge-danger">Unsolved</span>'}</td><td class="num">${p.attempts}</td><td class="num">${fmtMins(p.time)}</td></tr>`).join('')}
      </tbody></table></div>`
  });
}

/* =========================================================================
   PAGE: CERTIFICATE — students print what they earned; organisers preview the template
   ========================================================================= */
async function initCertificate() {
  const params = new URLSearchParams(location.search);
  const f = $('#cert-form');
  const id = params.get('id');
  let certificate = id ? await getData(`certificates/${id}`) : null;
  const d = certificate?.issuedAt ? new Date(ms(certificate.issuedAt)) : eventDate();
  if (!session.isAdmin && !certificate) { toast('Certificate not found', 'warn'); return location.replace('/dashboard#certificates'); }
  if (!session.isAdmin && certificate.uid !== session.user?.uid) { toast('You do not have access to this certificate', 'error'); return location.replace('/dashboard#certificates'); }
  if (!certificate && session.isAdmin) {
    certificate = { name: params.get('name') || 'Template preview', type: params.get('type') === 'achievement' ? 'achievement' : 'participation', title: params.get('title') || 'Winner', certificateId: 'PREVIEW', templateUrl: '' };
  }
  f.name.value = certificate.name;
  f.type.value = certificate.type;
  f.title.value = certificate.title || (certificate.type === 'achievement' ? 'Winner' : 'Participant');
  f.date.value = d && !isNaN(d.getTime()) ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : '';
  f.name.disabled = true; f.type.disabled = true; f.title.disabled = true; f.date.disabled = true;
  let certId = () => certificate.certificateId || 'PREVIEW';

  const render = () => {
    const name = certificate.name || 'Student Name';
    const achievement = f.type.value === 'achievement';
    const when = d ? fmtDate(d, { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
    $('#title-field').hidden = !achievement;
    $('#c-title').textContent = achievement ? 'Certificate of Excellence' : 'Certificate of Participation';
    $('#c-name').textContent = name;
    $('#c-achievement').hidden = !achievement;
    $('#c-achievement').textContent = f.title.value;
    $('#c-text').textContent = achievement
      ? `for outstanding performance as ${f.title.value} in ${CONFIG.name} ${CONFIG.edition ?? ''}, an inter-college competitive programming contest, held on ${when}.`
      : `for participating in ${CONFIG.name} ${CONFIG.edition ?? ''}, an inter-college competitive programming contest, held on ${when}${CONFIG.venue ? ` at ${CONFIG.venue}` : ''}.`;
    $('#c-id').textContent = certId();
    $('#c-date').textContent = f.date.value ? fmtDate(f.date.value, { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
    $('#cert-id-label').textContent = certId();
    const stage = $('.certificate');
    if (stage && certificate.templateUrl) {
      stage.style.backgroundImage = `url("${certificate.templateUrl}")`;
      stage.classList.add('certificate-with-template');
    }
  };
  render();
  $('#print-cert').onclick = () => window.print();
  $('#copy-cert').onclick = () => copyText($('#c-id').textContent, 'Certificate ID copied');
  if (params.has('print')) setTimeout(() => window.print(), 500);
}

/* =========================================================================
   PAGE: ADMIN LOGIN — shown at /admin until the organiser signs in
   ========================================================================= */
function initAdminLogin() {
  const f = $('#admin-login'), err = $('#a-err'), btn = $('button[type=submit]', f);
  f.id.focus();
  f.addEventListener('submit', async e => {
    e.preventDefault();
    if (!f.id.value.trim() || !f.password.value) { err.textContent = 'Enter the admin ID and password.'; err.hidden = false; return; }
    btn.disabled = true; err.hidden = true;
    try { await loginAdmin(f.id.value, f.password.value); location.replace('/admin' + location.hash); }
    catch (ex) { err.textContent = /invalid-credential|wrong-password|user-not-found/.test(ex.code) ? 'Wrong admin ID or password.' : errorMessage(ex); err.hidden = false; btn.disabled = false; }
  });
}

/* =========================================================================
   PAGE: ADMIN CONSOLE — live Firestore data, organiser account only
   ========================================================================= */
function initAdmin() {
  let regs = [], subs = [], sessions = [], board = [], qs = [], anns = [];
  const PAGE_SIZE = 15;
  const regAt = p => ms(p.registeredAt) || 0;
  const statusBadge = { paid: '<span class="badge badge-success">Paid</span>', pending: '<span class="badge badge-warn">Pending</span>' };
  const ticketBadge = t => t === 'issued' ? '<span class="badge badge-success">Issued</span>' : t === 'revoked' ? '<span class="badge badge-danger">Revoked</span>' : '<span class="badge">Not issued</span>';
  const subBadge = s => s.status === 'accepted' ? '<span class="badge badge-success">Accepted</span>' : s.status === 'rejected' ? '<span class="badge badge-danger">Rejected</span>' : '<span class="badge badge-info">To judge</span>';
  const kpi = (label, value, sub = '', extra = '') => `<div class="card kpi"><div class="label">${label}</div><div class="value">${value}</div>${sub ? `<div class="sub">${sub}</div>` : ''}${extra}</div>`;
  const regByUid = uid => regs.find(p => p.id === uid);
  const counts = () => {
    const paid = regs.filter(p => p.payment === 'paid').length;
    return { total: regs.length, paid, pending: regs.length - paid };
  };
  const cap = () => Number(CONFIG.capacity) || 0;
  const fee = () => Number(CONFIG.fee) || 0;
  const competing = () => new Set(subs.map(s => s.uid)).size;
  const failed = e => toast(errorMessage(e), 'error');
  const setComp = patch => fs.setDoc(fs.doc(db, 'config', 'competition'), patch, { merge: true }).catch(failed);

  /* ---------- Chrome: nav counts + competition badge ---------- */
  function renderChrome() {
    const c = counts();
    $('#nav-participants').textContent = c.total || '';
    $('#nav-pending').textContent = c.pending || '';
    $('#top-comp').innerHTML = `<span class="badge ${COMP_BADGE[COMP.status]} hide-sm">Competition: ${COMP_LABEL[COMP.status]}</span>`;
    $('#reg-state').textContent = !isRegistrationOpen() ? (isCapacityReached() ? 'Capacity reached (Closed)' : 'Registrations closed') : 'Registrations open';
  }

  /* =======================================================================
     OVERVIEW
     ======================================================================= */
  function renderOverview() {
    const c = counts(), day = 864e5;
    const last24 = regs.filter(p => Date.now() - regAt(p) < day).length;
    const fill = cap() ? c.paid / cap() * 100 : 0;
    const pendingJudge = subs.filter(s => s.status === 'pending').length;
    $('#kpis').innerHTML = [
      kpi('Total capacity', cap() || '—', `${fill.toFixed(0)}% of seats taken`, `<div class="progress"><span style="width:${Math.min(100, fill)}%"></span></div>`),
      kpi('Registrations', c.total, `+${last24} in the last 24 hours`),
      kpi('Paid participants', c.paid, `${money(c.paid * fee())} at the current fee`),
      kpi('Pending payments', c.pending, 'Account created, not paid'),
      kpi('Competing', competing(), COMP.status === 'scheduled' ? 'Arena opens when you start the event' : COMP_LABEL[COMP.status]),
      kpi('Submissions', subs.length, pendingJudge ? `${pendingJudge} waiting to be judged` : 'All judged'),
      kpi('Certificates', COMP.certsIssued ? 'Issued' : '—', COMP.certsIssued ? 'Visible in student dashboards' : 'Not issued yet'),
      kpi('Seats left', cap() ? Math.max(0, cap() - c.paid) : '—', `${money(CONFIG.fee)} per seat`)
    ].join('');

    // Registrations per day — last 14 days
    const days = Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - 13 + i); return d; });
    const perDay = days.map(d => regs.filter(p => regAt(p) >= d.getTime() && regAt(p) < d.getTime() + day).length);
    const max = Math.max(...perDay, 1);
    $('#chart-days').innerHTML = `<div class="gridlines"><i></i><i></i><i></i><i></i></div>` + perDay.map((n, i) =>
      `<div class="col ${i === 13 ? 'today' : ''}"><span style="height:${n / max * 100}%"></span><div class="tip"><strong>${n}</strong> registrations · ${fmtDate(days[i], { day: 'numeric', month: 'short' })}</div></div>`).join('');
    $('#chart-days-axis').innerHTML = days.map((d, i) => `<span>${i % 2 === 0 || i === 13 ? (i === 13 ? 'Today' : d.getDate()) : ''}</span>`).join('');

    // Capacity ring
    $('#capacity').innerHTML = `
      <div class="ring" style="background:conic-gradient(var(--accent) 0 ${fill}%, var(--elev) ${fill}% 100%)" role="img" aria-label="${c.paid} of ${cap()} seats filled"><div><div><strong>${fill.toFixed(0)}%</strong><small>filled</small></div></div></div>
      <div style="display:grid;gap:12px;font-size:14px;flex:1;min-width:160px">
        <div style="display:flex;justify-content:space-between"><span class="text-2">Confirmed seats</span><strong class="num">${c.paid}</strong></div>
        <div style="display:flex;justify-content:space-between"><span class="text-2">Awaiting payment</span><strong class="num">${c.pending}</strong></div>
        <div style="display:flex;justify-content:space-between"><span class="text-2">Remaining</span><strong class="num">${cap() ? Math.max(0, cap() - c.paid) : '—'}</strong></div>
      </div>`;

    // Payment status stacked bar (status colours always paired with labels)
    const parts = [['Paid', c.paid, 'var(--accent)'], ['Pending', c.pending, 'var(--warn)']];
    $('#chart-pay').innerHTML = `<div class="stack" role="img" aria-label="Payment status split">${parts.map(([l, n, col]) => `<span style="width:${c.total ? n / c.total * 100 : 0}%;background:${col}" title="${l}: ${n}"></span>`).join('')}</div>
      <div class="legend">${parts.map(([l, n, col]) => `<span><i style="background:${col}"></i>${l}<b>${n}</b></span>`).join('')}</div>
      <hr class="divider" style="margin:18px 0">
      <div style="display:flex;justify-content:space-between;font-size:14px"><span class="text-2">Revenue collected</span><strong class="num">${money(c.paid * fee())}</strong></div>
      <div style="display:flex;justify-content:space-between;font-size:14px;margin-top:10px"><span class="text-2">Outstanding</span><strong class="num">${money(c.pending * fee())}</strong></div>`;

    // Department breakdown (single hue, magnitude)
    const byDept = Object.entries(regs.reduce((m, p) => (m[p.dept || '—'] = (m[p.dept || '—'] || 0) + 1, m), {})).sort((a, b) => b[1] - a[1]);
    $('#chart-dept').innerHTML = byDept.length
      ? byDept.map(([d, n]) => `<div class="bar-row" style="grid-template-columns:150px 1fr 44px"><span class="text-2">${esc(d)}</span><div class="track"><span style="width:${n / byDept[0][1] * 100}%"></span></div><span class="v">${n}</span></div>`).join('')
      : '<div class="empty">No registrations yet.</div>';
  }

  /* =======================================================================
     PARTICIPANTS — search, filters, pagination, details, CSV export
     ======================================================================= */
  let pPage = 0;
  function fillDeptFilter() {
    const sel = $('#p-dept'), keep = sel.value;
    sel.innerHTML = '<option value="">All departments</option>' + [...new Set(regs.map(p => p.dept).filter(Boolean))].sort().map(d => `<option>${esc(d)}</option>`).join('');
    sel.value = keep;
  }
  const filteredPeople = () => {
    const q = $('#p-search').value.trim().toLowerCase(), pay = $('#p-pay').value, dept = $('#p-dept').value;
    return regs.filter(p =>
      (!q || [p.name, p.email, p.roll, p.regId, p.ticketId].some(v => String(v || '').toLowerCase().includes(q))) &&
      (!pay || p.payment === pay) && (!dept || p.dept === dept)
    ).sort((a, b) => regAt(b) - regAt(a));
  };
  function renderParticipants() {
    const list = filteredPeople();
    const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    pPage = Math.min(pPage, pages - 1);
    $('#p-body').innerHTML = list.length ? list.slice(pPage * PAGE_SIZE, pPage * PAGE_SIZE + PAGE_SIZE).map(p => `
      <tr class="clickable" data-uid="${esc(p.id)}">
        <td><div class="cell-person"><span class="avatar">${initials(p.name)}</span><div><strong>${esc(p.name)}</strong><small>${esc(p.email || p.roll)}</small></div></div></td>
        <td class="num">${esc(p.regId || '—')}</td><td>${esc(p.college)}</td><td>${esc(p.dept)} · ${esc(p.year)}</td>
        <td>${statusBadge[p.payment] || ''}</td><td>${ticketBadge(p.ticket)}</td>
        <td class="num">${fmtDate(regAt(p), { day: 'numeric', month: 'short' })}</td>
        <td class="right"><button type="button" class="btn btn-danger btn-sm del-btn" data-del-participant="${esc(p.id)}" title="Delete participant" style="padding:4px 10px;font-size:12px;display:inline-flex;align-items:center;gap:5px;cursor:pointer"><span style="pointer-events:none;display:inline-flex;align-items:center;gap:5px">${icon('trash')} Delete</span></button></td>
      </tr>`).join('') : `<tr><td colspan="8"><div class="empty">${regs.length ? 'No participants match these filters.' : 'No registrations yet.'}</div></td></tr>`;
    $('#p-count').textContent = `${list.length} participant${list.length === 1 ? '' : 's'}`;
    $('#p-page').textContent = `${pPage + 1} / ${pages}`;
    $('#p-prev').disabled = pPage === 0;
    $('#p-next').disabled = pPage >= pages - 1;

    $$('.del-btn', $('#p-body')).forEach(btn => {
      btn.onclick = evt => {
        evt.preventDefault();
        evt.stopPropagation();
        const p = regByUid(btn.dataset.delParticipant);
        if (p) deleteParticipant(p);
      };
    });
  }
  ['#p-search', '#p-pay', '#p-dept'].forEach(sel => $(sel).addEventListener('input', () => { pPage = 0; renderParticipants(); }));
  $('#p-prev').onclick = () => { pPage--; renderParticipants(); };
  $('#p-next').onclick = () => { pPage++; renderParticipants(); };
  $('#p-body').addEventListener('click', e => {
    const delBtn = e.target.closest('[data-del-participant]');
    if (delBtn) {
      e.preventDefault();
      e.stopPropagation();
      const p = regByUid(delBtn.dataset.delParticipant);
      if (p) deleteParticipant(p);
      return;
    }
    const row = e.target.closest('[data-uid]');
    if (row) personModal(regByUid(row.dataset.uid));
  });
  $('#export-csv').onclick = () => {
    const list = filteredPeople();
    const head = ['Registration ID', 'Name', 'Email', 'Phone', 'College', 'Department', 'Course', 'Year', 'Roll number', 'Payment', 'Method', 'Transaction', 'Ticket ID', 'Ticket', 'Registered at'];
    const rows = list.map(p => [p.regId, p.name, p.email, p.phone, p.college, p.dept, p.course, p.year, p.roll, p.payment, p.method, p.txn, p.ticketId, p.ticket, regAt(p) ? new Date(regAt(p)).toISOString() : '']);
    downloadFile(`participants-${new Date().toISOString().slice(0, 10)}.csv`, [head, ...rows].map(csvLine).join('\n'), 'text/csv');
    toast(`Exported ${list.length} participants`);
  };

  const markPaid = p => modal({
    title: 'Mark payment as received?',
    body: `<p>Use this when ${esc(p.name)} paid offline. A registration ID and ticket are issued immediately.</p>`,
    confirm: 'Mark as paid',
    onConfirm: () => { call('adminMarkPaid', { uid: p.id }).then(() => toast(`${p.name} marked as paid · ticket issued`), failed); }
  });
  const setTicket = (p, ticket) => fs.updateDoc(fs.doc(db, 'registrations', p.id), { ticket })
    .then(() => toast(`Ticket ${p.ticketId} ${ticket === 'revoked' ? 'revoked' : 'restored'}`, ticket === 'revoked' ? 'warn' : 'success'), failed);
  const revoke = p => modal({
    title: `Revoke ticket ${p.ticketId}?`, tone: 'danger', confirm: 'Revoke ticket',
    body: `<p>${esc(p.name)} won't be admitted with this ticket. Use this for refunds or duplicate registrations. You can restore it later.</p>`,
    onConfirm: () => { setTicket(p, 'revoked'); }
  });

  const deleteParticipant = p => modal({
    title: `Delete participant ${p.name}?`,
    tone: 'danger',
    confirm: 'Delete participant',
    body: `<p>Are you sure you want to permanently delete <strong style="color:var(--text)">${esc(p.name)}</strong> (${esc(p.roll)}) from the database?</p>
      <p style="margin-top:8px;font-size:13px;color:var(--muted)">This removes their registration, cancels their ticket (${esc(p.ticketId || 'none')}), frees up their seat, and resets their account so they can register again immediately.</p>`,
    onConfirm: async () => {
      try {
        // Preserve the ticket number permanently before deleting the participant.
        // The payment server also reserves every newly issued ticket atomically.
        if (p.ticketId) {
          await fs.setDoc(fs.doc(db, 'ticketReservations', p.ticketId), {
            ticketId: p.ticketId,
            uid: p.id,
            name: p.name || '',
            status: 'deleted',
            deletedAt: fs.serverTimestamp()
          }, { merge: true });
        }

        // 1. Delete registration from Firestore
        await fs.deleteDoc(fs.doc(db, 'registrations', p.id));

        // 2. Increment roll version in config/roll_versions so user can register again with a fresh account
        if (p.roll) {
          const cleanRoll = String(p.roll).trim().toUpperCase();
          try {
            const vDoc = await fs.getDoc(fs.doc(db, 'config', 'roll_versions'));
            const curV = vDoc.exists() ? (vDoc.data()?.[cleanRoll] || 1) : 1;
            await fs.setDoc(fs.doc(db, 'config', 'roll_versions'), { [cleanRoll]: curV + 1 }, { merge: true });
          } catch (e) {
            console.warn('Could not increment roll version in config/roll_versions', e);
          }
        }

        // 3. Decrement seat counter if paid
        if (p.payment === 'paid') {
          const statsRef = fs.doc(db, 'config', 'stats');
          try {
            await fs.runTransaction(db, async tx => {
              const snap = await tx.get(statsRef);
              if (snap.exists()) {
                const cur = snap.data()?.paid ?? 0;
                tx.update(statsRef, { paid: Math.max(0, cur - 1) });
              }
            });
          } catch (e) {
            console.warn('Could not decrement stats', e);
          }
        }

        // 4. Clear local cache
        try { localStorage.removeItem('ca_reg_' + p.id); } catch (_) {}

        toast(`Participant ${p.name} deleted. They can now register again.`, 'warn');
      } catch (err) {
        failed(err);
      }
    }
  });

  /** Participant details with the actions an organiser actually needs. */
  const resetPassword = p => modal({
    title: `Change password for ${esc(p.name)}`,
    confirm: 'Change password',
    cancel: 'Cancel',
    body: `<p class="muted" style="margin-bottom:14px">Set a new password for this participant. They can use it immediately with their roll number.</p>
      <div class="field"><label for="admin-new-password">New password</label><input class="input" id="admin-new-password" type="password" minlength="8" autocomplete="new-password" placeholder="At least 8 characters"></div>
      <p id="admin-password-error" role="alert" style="font-size:13px;color:var(--danger);margin-top:8px" hidden></p>`,
    onOpen: dlg => setTimeout(() => $('#admin-new-password', dlg)?.focus(), 80),
    onConfirm: async dlg => {
      const input = $('#admin-new-password', dlg), error = $('#admin-password-error', dlg)
      if (!input.value || input.value.length < 8) {
        error.textContent = 'Password must be at least 8 characters.'
        error.hidden = false
        return false
      }
      await resetParticipantPassword(p.id, input.value)
      toast(`Password changed for ${p.name}`, 'success')
    }
  });

  function personModal(p) {
    if (!p) return;
    const at = regAt(p), paidAt = ms(p.paidAt);
    modal({
      title: p.name, wide: true, confirm: null, cancel: 'Close',
      body: `<div class="drawer-grid" style="margin-top:8px">
          <dl class="kv"><dt>Registration</dt><dd>${esc(p.regId || '—')}</dd><dt>Email</dt><dd>${esc(p.email || '—')}</dd><dt>Phone</dt><dd>${p.phone ? '+91 ' + esc(p.phone) : '—'}</dd><dt>College</dt><dd>${esc(p.college)}</dd><dt>Programme</dt><dd>${esc(p.course)} · ${esc(p.dept)} · Year ${esc(p.year)}</dd><dt>Roll number</dt><dd>${esc(p.roll)}</dd></dl>
          <dl class="kv"><dt>Payment</dt><dd>${statusBadge[p.payment] || ''}</dd><dt>Method</dt><dd>${esc(p.method || '—')}</dd><dt>Transaction</dt><dd>${esc(p.txn || '—')}</dd><dt>Ticket</dt><dd>${esc(p.ticketId || '')} ${ticketBadge(p.ticket)}</dd><dt>Paid</dt><dd>${paidAt ? `${fmtDate(paidAt)} · ${fmtTime(paidAt)}` : '—'}</dd><dt>Registered</dt><dd>${at ? `${fmtDate(at)} · ${fmtTime(at)}` : '—'}</dd></dl>
        </div>
        <div style="display:flex;gap:8px;margin-top:24px;flex-wrap:wrap">
          ${p.payment !== 'paid' ? '<button class="btn btn-primary btn-sm" data-a="paid">Mark as paid</button>' : ''}
          ${p.payment === 'paid' ? (p.ticket === 'revoked' ? '<button class="btn btn-secondary btn-sm" data-a="restore">Restore ticket</button>' : '<button class="btn btn-danger btn-sm" data-a="revoke">Revoke ticket</button>') : ''}
          ${p.payment === 'paid' ? '<button class="btn btn-ghost btn-sm" data-a="password">Change password</button>' : ''}
          ${p.email ? '<button class="btn btn-ghost btn-sm" data-a="copy">Copy email</button>' : ''}
          <button class="btn btn-danger btn-sm" data-a="delete" style="margin-left:auto">${icon('trash')} Delete participant</button>
        </div>`,
      onOpen: dlg => $$('[data-a]', dlg).forEach(b => b.onclick = () => {
        const a = b.dataset.a;
        if (a === 'copy') return copyText(p.email, 'Email copied');
        dlg.close();
        if (a === 'paid') markPaid(p);
        if (a === 'revoke') revoke(p);
        if (a === 'restore') setTicket(p, 'issued');
        if (a === 'password') resetPassword(p);
        if (a === 'delete') deleteParticipant(p);
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
      kpi('Collected', money(c.paid * fee()), `${c.paid} successful payments`),
      kpi('Outstanding', money(c.pending * fee()), `${c.pending} pending payments`),
      kpi('Fee per seat', money(CONFIG.fee), 'Set in Settings')
    ].join('');
    const list = regs.filter(p => !payFilter || p.payment === payFilter).sort((a, b) => regAt(b) - regAt(a));
    $('#pay-body').innerHTML = list.slice(0, 40).map(p => `<tr>
      <td class="num">${esc(p.txn || '—')}</td><td><strong>${esc(p.name)}</strong> <span class="muted">· ${esc(p.regId || p.roll)}</span></td><td>${esc(p.method || '—')}</td>
      <td class="right num strong">${money(CONFIG.fee)}</td><td>${statusBadge[p.payment] || ''}</td>
      <td class="num">${ms(p.paidAt) ? fmtDateTime(p.paidAt) : '—'}</td>
      <td class="right">${p.payment === 'paid' ? '<span class="muted">—</span>' : `<button class="btn btn-secondary btn-sm" data-uid="${esc(p.id)}">Mark paid</button>`}</td>
    </tr>`).join('') || '<tr><td colspan="7"><div class="empty">No transactions.</div></td></tr>';
    $('#pay-count').textContent = `${list.length} transactions`;
  }
  $('#pay-body').addEventListener('click', e => {
    const b = e.target.closest('[data-uid]');
    if (b) markPaid(regByUid(b.dataset.uid));
  });

  /* =======================================================================
     TICKETS
     ======================================================================= */
  function renderTickets() {
    const list = regs.filter(p => p.payment === 'paid');
    const revoked = list.filter(p => p.ticket === 'revoked').length;
    $('#tk-kpis').innerHTML = [
      kpi('Tickets issued', list.length - revoked, 'One per paid registration'),
      kpi('Seats left', cap() ? Math.max(0, cap() - list.length) : '—', `of ${cap() || '—'}`),
      kpi('Revoked', revoked, 'Refunds or duplicates')
    ].join('');
    const q = $('#tk-search').value.trim().toLowerCase();
    const shown = list.filter(p => !q || String(p.ticketId).toLowerCase().includes(q) || p.name.toLowerCase().includes(q)).sort((a, b) => regAt(b) - regAt(a)).slice(0, 40);
    $('#tk-body').innerHTML = shown.map(p => `<tr>
      <td class="strong num">${esc(p.ticketId)}</td><td>${esc(p.name)}</td><td class="num">${esc(p.regId)}</td>
      <td class="num">${fmtDate(ms(p.paidAt), { day: 'numeric', month: 'short' })}</td>
      <td>${p.ticket === 'revoked' ? ticketBadge('revoked') : '<span class="badge badge-info">Valid</span>'}</td>
      <td class="right">${p.ticket === 'revoked'
        ? `<button class="btn btn-secondary btn-sm" data-act="restore" data-uid="${esc(p.id)}">Restore</button>`
        : `<button class="btn btn-danger btn-sm" data-act="revoke" data-uid="${esc(p.id)}">Revoke</button>`}</td>
    </tr>`).join('') || '<tr><td colspan="6"><div class="empty">No tickets yet.</div></td></tr>';
  }
  $('#tk-search').addEventListener('input', renderTickets);
  $('#tk-body').addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const p = regByUid(b.dataset.uid);
    b.dataset.act === 'restore' ? setTicket(p, 'issued') : revoke(p);
  });

  /* =======================================================================
     AWARDS & RESULTS — publish results to student dashboards and leaderboard
     ======================================================================= */
  const startedAt = () => ms(COMP.startedAt);
  const publish = () => {
    if (COMP.status === 'published') return toast('Results are already published', 'warn');
    const pending = subs.filter(s => s.status === 'pending').length;
    modal({
      title: 'Publish results?', confirm: 'Publish',
      body: `<p>The leaderboard becomes final and public, and ${board.length} participants see their scores in the dashboard.</p>
        ${pending ? `<p style="margin-top:10px;color:var(--warn)">${pending} submission${pending === 1 ? ' is' : 's are'} still waiting to be judged.</p>` : ''}`,
      onConfirm: () => { setComp({ status: 'published' }).then(() => toast('Results published')); }
    });
  };
  const resPubBtn = $('#res-publish');
  if (resPubBtn) resPubBtn.onclick = publish;


  /* =======================================================================
     RESULTS + JUDGING — organisers mark each submission; scores are recomputed per student
     ======================================================================= */
  const elapsedMin = s => startedAt() && ms(s.at) ? Math.max(0, (ms(s.at) - startedAt()) / 60000) : null;
  /** Leaderboard entry for one student from all of their judged submissions. */
  function scoreFor(uid, all) {
    const mine = all.filter(x => x.uid === uid).sort((a, b) => (ms(a.at) ?? 0) - (ms(b.at) ?? 0));
    const judged = mine.filter(x => x.status !== 'pending');
    const problems = qs.filter(q => q.saved).map(q => {
      const list = judged.filter(x => x.qid === q.id);
      const k = list.findIndex(x => x.status === 'accepted');
      const attempts = k === -1 ? list.length : k + 1, points = Number(q.points) || 0;
      return { id: q.id, title: q.title || '', points, solved: k !== -1, attempts, time: k === -1 ? null : elapsedMin(list[k]), got: k === -1 ? 0 : pointsFor(points, attempts), acceptedId: k === -1 ? null : list[k].id };
    });
    const times = problems.filter(p => p.solved).map(p => p.time ?? 0);
    const who = regByUid(uid) || mine[0] || {};
    return {
      name: who.name || '', roll: who.roll || '', college: who.college || '', dept: who.dept || '', lang: mine.at(-1)?.lang || '',
      problems, score: problems.reduce((a, p) => a + p.got, 0), solvedCount: problems.filter(p => p.solved).length,
      completion: times.length ? Math.max(...times) : null, updatedAt: fs.serverTimestamp()
    };
  }
  async function judge(s, status) {
    const all = subs.map(x => x.id === s.id ? { ...x, status } : x);
    const entry = scoreFor(s.uid, all);
    const p = entry.problems.find(x => x.id === s.qid);
    const batch = fs.writeBatch(db);
    batch.update(fs.doc(db, 'submissions', s.id), { status, points: p?.acceptedId === s.id ? p.got : 0, judgedAt: fs.serverTimestamp() });
    batch.set(fs.doc(db, 'leaderboard', s.uid), entry);
    await batch.commit();
  }
  function judgeModal(s) {
    const q = qs.find(x => x.id === s.qid), at = ms(s.at), el = elapsedMin(s);
    modal({
      title: `${s.name} · Problem ${s.qid}`, wide: true, confirm: null, cancel: 'Close',
      body: `<p>${esc(s.roll)} · ${esc(s.lang)} · submitted ${at ? fmtTime(at) : '—'}${el != null ? ` (${fmtMins(el)} into the contest)` : ''} · ${subBadge(s)}</p>
        ${q?.samples?.[0] ? `<div class="sample" style="margin-top:14px"><div><header>Sample input</header><pre>${esc(q.samples[0].in)}</pre></div><div><header>Expected output</header><pre>${esc(q.samples[0].out)}</pre></div></div>` : ''}
        <pre style="margin-top:14px;max-height:50vh;overflow:auto;padding:14px;border:1px solid var(--border);border-radius:var(--r);background:var(--bg-2);font-family:var(--mono);font-size:13px;white-space:pre">${esc(s.code)}</pre>
        <div style="display:flex;gap:8px;margin-top:20px;flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" data-v="accepted">${icon('check')} Accept</button>
          <button class="btn btn-danger btn-sm" data-v="rejected">${icon('x')} Reject</button>
          <button class="btn btn-ghost btn-sm" data-copy>${icon('copy')} Copy code</button>
        </div>`,
      onOpen: dlg => {
        $('[data-copy]', dlg).onclick = () => copyText(s.code, 'Code copied');
        $$('[data-v]', dlg).forEach(b => b.onclick = async () => {
          $$('[data-v]', dlg).forEach(x => x.disabled = true);
          try { await judge(s, b.dataset.v); dlg.close(); toast(`${s.name} · ${s.qid}: ${b.dataset.v}`); }
          catch (e) { failed(e); $$('[data-v]', dlg).forEach(x => x.disabled = false); }
        });
      }
    });
  }
  let judgeFilter = 'pending';
  $$('#judge-filter button').forEach(b => b.onclick = () => {
    judgeFilter = b.dataset.f;
    $$('#judge-filter button').forEach(x => x.classList.toggle('active', x === b));
    renderResults();
  });
  $('#judge-body').addEventListener('click', e => {
    const row = e.target.closest('[data-sid]');
    if (row) judgeModal(subs.find(s => s.id === row.dataset.sid));
  });
  function renderResults() {
    const rows = rankRows([...board]);
    const pending = subs.filter(s => s.status === 'pending').length;
    $('#res-sub').textContent = COMP.status === 'published' ? 'Results are final and visible to participants.' : COMP.status === 'ended' ? 'Contest ended — finish judging, then publish.' : 'Judge submissions as they arrive. Scores stay private until you publish.';
    $('#res-kpis').innerHTML = [
      kpi('Competed', competing()), kpi('Average score', rows.length ? (rows.reduce((a, r) => a + r.score, 0) / rows.length).toFixed(0) : '—'),
      kpi('Solved everything', rows.filter(r => r.problems?.length && r.solvedCount === r.problems.length).length), kpi('To judge', pending)
    ].join('');
    const list = subs.filter(s => !judgeFilter || s.status === judgeFilter)
      .sort((a, b) => judgeFilter ? (ms(a.at) ?? 0) - (ms(b.at) ?? 0) : (ms(b.at) ?? 0) - (ms(a.at) ?? 0)).slice(0, 100);
    $('#judge-body').innerHTML = list.map(s => `<tr class="clickable" data-sid="${esc(s.id)}">
      <td class="num">${ms(s.at) ? `${fmtDate(ms(s.at), { day: 'numeric', month: 'short' })}, ${new Date(ms(s.at)).toLocaleTimeString('en-IN', { hour12: false })}` : '—'}</td>
      <td><strong>${esc(s.name)}</strong> <span class="muted">· ${esc(s.roll)}</span></td><td class="strong">${esc(s.qid)}</td><td>${esc(s.lang)}</td>
      <td>${subBadge(s)}</td><td class="right"><button class="btn btn-ghost btn-sm">${s.status === 'pending' ? 'Judge' : 'Review'}</button></td></tr>`).join('')
      || `<tr><td colspan="6"><div class="empty">${judgeFilter ? 'Nothing waiting to be judged.' : 'No submissions yet.'}</div></td></tr>`;
    $('#res-body').innerHTML = rows.slice(0, 10).map(r => `<tr>
      <td class="rank-cell ${r.rank <= 3 ? 'top' : ''}">${pad(r.rank)}</td><td class="strong">${esc(r.name)}</td><td>${esc(r.college)}</td>
      <td><span class="solved-dots">${(r.problems || []).map(p => `<i class="${p.solved ? 'on' : ''}">${esc(p.id)}</i>`).join('')}</span></td>
      <td class="right num strong">${r.score}</td><td class="right num">${fmtMins(r.completion)}</td></tr>`).join('')
      || '<tr><td colspan="6"><div class="empty">Scores appear here once you judge submissions.</div></td></tr>';
    $('#res-publish').disabled = COMP.status === 'published';
  }

  /* =======================================================================
     CERTIFICATES
     ======================================================================= */
  function renderCertsAdmin() {
    const rows = rankRows([...board]);
    const templates = COMP.certTemplates || {};
    $('#cert-kpis').innerHTML = [
      kpi('Participation', competing(), 'Everyone who submitted'),
      kpi('Excellence', Math.min(2, rows.length), 'Ranks 1 and 2'),
      kpi('Status', COMP.certsIssued ? 'Issued' : '—', COMP.certsIssued ? 'Visible in student dashboards' : 'Nothing issued yet')
    ].join('');
    $('#cert-template-participation-status').textContent = templates.participation ? 'Uploaded and ready' : 'Not uploaded';
    $('#cert-template-achievement-status').textContent = templates.achievement ? 'Uploaded and ready' : 'Not uploaded';
    $('#cert-body').innerHTML = rows.slice(0, 2).map(r => {
      const title = achievementTitle(r.rank), regId = regByUid(r.id)?.regId || '';
      return `<tr><td class="rank-cell ${r.rank <= 3 ? 'top' : ''}">${pad(r.rank)}</td><td class="strong">${esc(r.name)}</td><td>${title}</td><td class="num">${esc(regId ? regId + '-ACH' : '—')}</td>
        <td class="right"><a class="btn btn-ghost btn-sm" href="/certificate?type=achievement&name=${encodeURIComponent(r.name)}&title=${encodeURIComponent(title)}&reg=${encodeURIComponent(regId)}">Preview</a></td></tr>`;
    }).join('') || '<tr><td colspan="5"><div class="empty">Rankings appear after judging.</div></td></tr>';
    $('#issue-certs').disabled = !!COMP.certsIssued;
  }
  async function uploadTemplate(kind, input) {
    const file = input.files?.[0];
    if (!file) return;
    input.disabled = true;
    try {
      const url = await uploadCertificateTemplate(file, kind);
      await fs.setDoc(fs.doc(db, 'config', 'competition'), { certTemplates: { ...(COMP.certTemplates || {}), [kind]: url } }, { merge: true });
      toast(`${kind === 'achievement' ? 'Excellence' : 'Participation'} template uploaded`);
    } catch (error) { failed(error); }
    finally { input.disabled = false; }
  }
  $('#cert-template-participation').onchange = e => uploadTemplate('participation', e.target);
  $('#cert-template-achievement').onchange = e => uploadTemplate('achievement', e.target);
  $('#issue-certs').onclick = () => modal({
    title: 'Issue certificates?',
    body: `<p>${competing()} certificates will be generated. Ranks 1 and 2 receive certificates of excellence; every other competing participant receives a certificate of participation. Each recipient will also receive a PDF by email.</p>
      ${COMP.status !== 'published' ? '<p style="margin-top:10px;color:var(--warn)">Results aren’t published yet — achievement titles may still change.</p>' : ''}`,
    confirm: 'Issue certificates',
    onConfirm: async () => {
      const templates = COMP.certTemplates || {};
      if (!templates.participation || !templates.achievement) return toast('Upload both certificate templates first', 'error');
      try {
        const headers = await authHeaders();
        const response = await fetch('/api/issue-certificates', {
          method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ participationTemplateUrl: templates.participation, achievementTemplateUrl: templates.achievement, eventName: CONFIG.name })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Could not issue certificates.');
        toast(`${result.issued} certificates issued; ${result.emailed} email(s) sent${result.failures?.length ? `; ${result.failures.length} email(s) failed` : ''}`, result.failures?.length ? 'warn' : 'success');
      } catch (error) { failed(error); }
    }
  });

  /* =======================================================================
     SETTINGS — config/event and announcements
     ======================================================================= */
  const sForm = $('#settings-form');
  function renderSettings() {
    ['name', 'edition', 'date', 'venue', 'organiser', 'college', 'capacity', 'fee', 'durationMin', 'compUrl', 'resultsUrl'].forEach(k => {
      if (sForm.elements[k]) sForm.elements[k].value = CONFIG[k] ?? '';
    });
    sForm.elements.eligibleYears.value = (CONFIG.eligibleYears || []).join(', ');
    ['regOpen', 'tabWatch'].forEach(k => sForm.elements[k].checked = CONFIG[k] ?? true);
    renderAnnouncements();
  }
  sForm.addEventListener('submit', async e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(sForm));
    if (!f.name.trim()) return toast('Event name is required', 'error');
    if (!f.date) return toast('Pick a start date and time', 'error');
    const capacity = Number(f.capacity), fee = Number(f.fee), dur = Number(f.durationMin);
    if (!(capacity >= 1)) return toast('Capacity must be at least 1', 'error');
    if (!(fee >= 1)) return toast('Fee must be at least ₹1', 'error');
    if (!(dur >= 15 && dur <= 300)) return toast('Duration must be between 15 and 300 minutes', 'error');
    const event = {
      name: f.name.trim(), edition: f.edition.trim(), date: f.date, venue: f.venue.trim(), organiser: f.organiser.trim(), college: f.college.trim(), capacity, fee,
      durationMin: dur, compUrl: (f.compUrl || '').trim(), resultsUrl: (f.resultsUrl || '').trim(), eligibleYears: f.eligibleYears.split(/[\s,]+/).map(y => y.replace(/\D/g, '')).filter(Boolean),
      regOpen: !!f.regOpen, tabWatch: !!f.tabWatch
    };
    try {
      await Promise.all([fs.setDoc(fs.doc(db, 'config', 'event'), event, { merge: true }), COMP.status === 'scheduled' ? setComp({ durationMin: dur }) : null]);
      Object.assign(CONFIG, event);
      applyConfig(); renderChrome();
      toast('Settings saved — applied everywhere');
    } catch (err) { failed(err); }
  });


  function renderAnnouncements() {
    $('#ann-list').innerHTML = anns.map(a => `<li style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">
      <div><div class="when">${a.pinned ? '<span class="pin">Pinned</span> · ' : ''}${ms(a.at) ? ago(ms(a.at)) : 'Just now'}</div><h4>${esc(a.title)}</h4><p>${esc(a.body)}</p></div>
      <button class="btn btn-ghost btn-sm" type="button" data-del="${esc(a.id)}" aria-label="Delete announcement">${icon('trash')}</button></li>`).join('')
      || '<li><p class="muted">No announcements yet.</p></li>';
  }
  const aForm = $('#ann-form');
  aForm.addEventListener('submit', e => {
    e.preventDefault();
    const title = aForm.title.value.trim(), body = aForm.body.value.trim();
    if (!title || !body) return toast('Add a title and a message', 'warn');
    fs.addDoc(fs.collection(db, 'announcements'), { title, body, pinned: aForm.pinned.checked, at: fs.serverTimestamp() })
      .then(() => { aForm.reset(); toast('Announcement posted'); }, failed);
  });
  $('#ann-list').addEventListener('click', e => {
    const b = e.target.closest('[data-del]'); if (!b) return;
    modal({ title: 'Delete this announcement?', tone: 'danger', confirm: 'Delete', body: '<p>Students will no longer see it.</p>',
      onConfirm: () => { fs.deleteDoc(fs.doc(db, 'announcements', b.dataset.del)).then(() => toast('Announcement deleted', 'warn'), failed); } });
  });

  /* ---------- Wiring: live data → re-render the open view ---------- */
  const RENDER = {
    overview: renderOverview, participants: renderParticipants, payments: renderPayments, tickets: renderTickets,
    results: renderResults, certificates: renderCertsAdmin, settings: renderSettings
  };
  let current = 'overview';
  // Forms (settings) aren't re-rendered by live updates, so edits in progress survive
  function refresh() { renderChrome(); if (current !== 'settings') RENDER[current]?.(); }

  $$('[data-signout]').forEach(b => b.onclick = signOut);
  renderChrome();
  initAppShell({
    overview: 'Overview', participants: 'Participants', payments: 'Payments', tickets: 'Tickets',
    results: 'Results', certificates: 'Certificates', settings: 'Settings'
  }, id => { current = id; RENDER[id]?.(); });

  watchAll('registrations', list => { regs = list; fillDeptFilter(); refresh(); });
  watchAll('submissions', list => { subs = list; refresh(); });
  watchAll('leaderboard', list => { board = list; refresh(); });
  watchAll('announcements', list => { anns = announcementsSorted(list); renderAnnouncements(); });
  watchDoc('config/competition', c => { COMP = { status: 'scheduled', ...c }; refresh(); });
}

/* =========================================================================
   PAGE: ARENA — editor, live contest clock, submissions stored for judging.
   Code is not executed here: organisers judge every submission after review.
   ========================================================================= */
const LANG = {
  c: { label: 'C', file: 'main.c', cmd: 'gcc -O2 -std=c17 main.c -o main -lm' },
  cpp: { label: 'C++17', file: 'main.cpp', cmd: 'g++ -O2 -std=c++17 main.cpp -o main' },
  py: { label: 'Python 3', file: 'main.py', cmd: 'python3 -m py_compile main.py' },
  java: { label: 'Java 21', file: 'Main.java', cmd: 'javac Main.java' }
};

/** Starter code per language. */
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

async function initArena() {
  const me = requireStudent(); if (!me) return;
  // Drafts live in Firestore (drafts/{uid}), so they follow the student to any computer
  const draftRef = fs.doc(db, 'drafts', me.uid);
  const state = (await getData(`drafts/${me.uid}`)) ?? {};
  state.code ||= {}; state.lang ||= 'cpp'; state.q ||= 0;
  const save = () => fs.setDoc(draftRef, state).catch(() => setSave('saving', 'Not saved — check connection'));

  let qs = [], subs = [], busy = false, timeUpShown = false, tabSwitches = 0;
  const ta = $('#code'), pre = $('#highlight'), gutter = $('#gutter'), out = $('#console-out');
  const key = () => `${qs[state.q]?.id}:${state.lang}`;
  const starter = () => qs[state.q] ? TEMPLATES[state.lang](qs[state.q].title) : '';
  const codeFor = () => state.code[key()] ?? starter();

  /* ---------- Console helpers ---------- */
  const log = (html, cls = '') => { out.innerHTML += (cls ? `<span class="${cls}">${html}</span>` : html) + '\n'; out.parentElement.parentElement.scrollTop = 1e9; };
  const clearLog = () => { out.innerHTML = ''; $('#verdict').innerHTML = ''; };
  const banner = (cls, html) => $('#verdict').innerHTML = `<div class="verdict-banner ${cls}">${html}</div>`;
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
    ta.disabled = !qs.length;
    $('#lang').value = state.lang;
    $('#file-name').textContent = LANG[state.lang].file;
    paint();
  }

  /* Autosave: debounced write of the draft to this device, with a visible status */
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

  /* Editor keys: Tab indents (Esc then Tab leaves the editor), Enter keeps indentation, Ctrl+Enter submits */
  let escapeTab = false;
  // execCommand keeps the native undo stack and fires 'input'; setRangeText is the fallback
  const insert = text => { if (!document.execCommand('insertText', false, text)) { ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end'); ta.dispatchEvent(new Event('input')); } };
  ta.addEventListener('keydown', e => {
    if (e.key === 'Escape') { escapeTab = true; return; }
    if (e.key === 'Tab' && !escapeTab && !e.shiftKey) { e.preventDefault(); insert('    '); return; }
    escapeTab = false;
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); return; }
    if (e.key === 's' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); state.code[key()] = ta.value; save(); setSave('saved', 'Saved'); toast('Draft saved on this device'); return; }
    if (e.key === 'Enter' && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      const lineStart = ta.value.lastIndexOf('\n', ta.selectionStart - 1) + 1;
      const line = ta.value.slice(lineStart, ta.selectionStart);
      const indent = line.match(/^\s*/)[0] + (/[{:(\[]\s*$/.test(line) ? '    ' : '');
      insert('\n' + indent);
    }
  });

  /* ---------- Questions ---------- */
  const submittedFor = id => subs.filter(s => s.qid === id);
  function renderQuestionTabs() {
    $('#q-tabs').innerHTML = qs.map((q, i) => {
      const solved = submittedFor(q.id).some(s => s.status === 'accepted');
      return `<button class="q-tab ${i === state.q ? 'active' : ''} ${solved ? 'solved' : ''}" role="tab" aria-selected="${i === state.q}" data-q="${i}">
        <span class="l">${solved ? '✓' : esc(q.id)}</span><span style="min-width:0"><span class="t">${esc(q.title)}</span><small>${Number(q.points) || 0} pts · ${esc(q.difficulty)}</small></span></button>`;
    }).join('');
    $$('#q-tabs [data-q]').forEach(b => b.onclick = () => switchQuestion(Number(b.dataset.q)));
  }
  function renderProblem() {
    $('#problem').innerHTML = qs[state.q] ? problemHTML(qs[state.q]) : `<div class="empty" style="padding:56px 24px">
      <p style="color:var(--text);font-weight:600;font-size:15px">${COMP.status === 'scheduled' ? 'The contest has not started yet' : 'No problems available'}</p>
      <p style="margin-top:6px">Problems appear here the moment the organisers start the contest. Keep this page open.</p></div>`;
    $('#problem').scrollTop = 0;
  }
  function switchQuestion(i) {
    state.code[key()] = ta.value;
    state.q = i; save();
    renderQuestionTabs(); renderProblem(); loadEditor();
  }
  $('#lang').addEventListener('change', e => {
    state.code[key()] = ta.value;
    state.lang = e.target.value; save();
    loadEditor();
    log(`Switched to ${LANG[state.lang].label}. Code for each language is kept separately.`, 'dim');
  });
  $('#reset-code').onclick = () => {
    if (!qs[state.q]) return;
    modal({
      title: 'Reset to the starter template?', tone: 'danger', confirm: 'Reset code',
      body: `<p>Your ${LANG[state.lang].label} draft for problem ${esc(qs[state.q].id)} will be replaced. Other languages and problems are untouched.</p>`,
      onConfirm: () => { delete state.code[key()]; save(); loadEditor(); toast('Code reset to template', 'info'); }
    });
  };

  /* ---------- Submit: stored for the organisers to judge ---------- */
  async function submit() {
    if (busy) return;
    if (COMP.status !== 'live') return toast(COMP.status === 'scheduled' ? 'The contest has not started yet' : 'The contest has ended — submissions are locked', 'error');
    if (timeLeft() <= 0) return toast('Time is up — submissions are locked', 'error');
    const q = qs[state.q], code = ta.value;
    if (!q) return;
    if (!code.trim() || code === starter()) return toast('Write your solution before submitting', 'warn');
    if (code.length > 64000) return toast('Code is too long (limit 64 KB)', 'error');
    busy = true; setButtons();
    state.code[key()] = code; save();
    clearLog(); showTab('console');
    banner('', '<div class="spinner" style="width:16px;height:16px"></div><span>Submitting…</span>');
    try {
      await fs.addDoc(fs.collection(db, 'submissions'), {
        uid: me.uid, roll: me.roll, name: me.name, qid: q.id, lang: LANG[state.lang].label, code,
        at: fs.serverTimestamp(), status: 'pending', points: 0
      });
      banner('ok', `<strong>Submitted</strong><span>Problem ${esc(q.id)} · ${LANG[state.lang].label}</span><span class="muted" style="margin-left:auto">Judged by the organisers</span>`);
      log(`Submission for ${esc(q.id)}. ${esc(q.title)} received. Your latest accepted submission per problem counts.`, 'ok');
      toast(`Problem ${q.id} submitted`);
    } catch (e) {
      banner('bad', `<strong>Not submitted</strong><span>${esc(errorMessage(e))}</span>`);
      toast(errorMessage(e), 'error');
    }
    busy = false; setButtons();
  }
  const STATUS = { pending: ['Awaiting judgement', 'badge-info'], accepted: ['Accepted', 'badge-success'], rejected: ['Rejected', 'badge-danger'] };
  function renderSubs() {
    $('#sub-count').textContent = subs.length ? `(${subs.length})` : '';
    $('#subs').innerHTML = subs.length ? subs.map((s, i) => {
      const [label, cls] = STATUS[s.status] || STATUS.pending, at = ms(s.at), judged = ms(s.judgedAt);
      return `<tr>
      <td class="num">${subs.length - i}</td><td class="num">${at ? new Date(at).toLocaleTimeString('en-IN', { hour12: false }) : '—'}</td>
      <td class="strong">${esc(s.qid)}. ${esc(qs.find(q => q.id === s.qid)?.title ?? '')}</td><td>${esc(s.lang)}</td>
      <td><span class="badge ${cls}">${label}</span></td>
      <td class="right num">${s.status === 'accepted' && s.points ? '+' + s.points : '—'}</td><td class="right num">${judged ? new Date(judged).toLocaleTimeString('en-IN', { hour12: false }) : '—'}</td></tr>`;
    }).join('') : '<tr><td colspan="7"><div class="empty">No submissions yet.</div></td></tr>';
  }
  $('#submit-btn').onclick = submit;
  function setButtons() {
    $('#submit-btn').disabled = busy || COMP.status !== 'live' || timeLeft() <= 0 || !qs.length;
  }

  /* ---------- Contest clock (config/competition) ---------- */
  function timeLeft() {
    if (COMP.status === 'live') return ms(COMP.startedAt) + durationMin() * 60000 - Date.now();
    return COMP.status === 'scheduled' ? null : 0;
  }
  function renderMode() {
    $('#mode-badge').innerHTML = COMP.status === 'live' ? '<span class="badge badge-success">Live</span>'
      : COMP.status === 'scheduled' ? '<span class="badge badge-info">Not started</span>'
        : '<span class="badge badge-warn">Contest ended</span>';
    setButtons();
  }
  function tick() {
    const left = timeLeft();
    $('#timer-val').textContent = left == null ? '--:--:--' : fmtClock(left);
    $('#timer').className = 'timer' + (left == null ? '' : left <= 60000 ? ' crit' : left <= 10 * 60000 ? ' warn' : '');
    if (COMP.status === 'live' && left <= 0 && !timeUpShown) {
      timeUpShown = true; setButtons();
      modal({
        title: "Time's up", body: '<p>The contest clock has run out. Your submissions are with the organisers for judging.</p>',
        confirm: 'Go to my results', cancel: null, onConfirm: () => { location.href = '/dashboard#results'; }
      });
    }
  }
  setInterval(tick, 1000);

  // Live: the organiser starts/ends the contest → the arena reacts instantly
  let firstComp = true;
  watchDoc('config/competition', async c => {
    const before = COMP.status;
    COMP = { status: 'scheduled', ...c };
    if (contestOpen() && !qs.length) {
      qs = await loadQuestions();
      if (!qs[state.q]) state.q = 0;
      renderQuestionTabs(); renderProblem(); loadEditor();
    }
    timeUpShown = false; renderMode(); tick();
    if (!firstComp && before !== COMP.status) {
      const s = COMP.status;
      toast(s === 'live' ? 'The organisers started the competition — the clock is running' : s === 'ended' ? 'The competition has ended. Submissions are locked.' : `Competition: ${COMP_LABEL[s]}`, s === 'ended' ? 'warn' : 'info');
    }
    firstComp = false;
  });
  watchAll('submissions', list => {
    subs = list.sort((a, b) => (ms(b.at) ?? Date.now()) - (ms(a.at) ?? Date.now()));
    renderSubs(); renderQuestionTabs();
  }, fs.where('uid', '==', me.uid));

  /* ---------- Fullscreen prompt + tab-switch monitoring (detection only) ---------- */
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
      body: '<p>The arena runs in fullscreen so you can focus. Leaving fullscreen or switching tabs is recorded and visible to the organisers.</p>',
      confirm: 'Enter fullscreen', cancel: 'Continue windowed', onConfirm: enterFullscreen
    });
  }
  getData(`sessions/${me.uid}`).then(d => { tabSwitches = d?.tabSwitches || 0; });
  document.addEventListener('visibilitychange', () => {
    if (CONFIG.tabWatch === false || COMP.status !== 'live') return;
    if (document.hidden) {
      tabSwitches++;
      fs.setDoc(fs.doc(db, 'sessions', me.uid), { roll: me.roll, name: me.name, tabSwitches: fs.increment(1), lastSwitchAt: fs.serverTimestamp() }, { merge: true }).catch(() => {});
      return;
    }
    const n = tabSwitches;
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
    const done = qs.filter(q => submittedFor(q.id).length).length;
    modal({
      title: 'Finish and leave the arena?',
      body: `<p>You've submitted <strong style="color:var(--text)">${done} of ${qs.length}</strong> problems. Your drafts stay on this device; you can come back while the clock is running.</p>`,
      confirm: 'Finish', onConfirm: () => { if (document.fullscreenElement) document.exitFullscreen(); location.href = '/dashboard#results'; }
    });
  };

  /* ---------- Mobile panel switcher ---------- */
  $$('#panel-tabs button').forEach(b => b.onclick = () => {
    $('.arena').dataset.panel = b.dataset.panel;
    $$('#panel-tabs button').forEach(x => x.classList.toggle('active', x === b));
  });

  /* ---------- Boot ---------- */
  renderProblem();
  loadEditor();
  renderSubs();
  renderMode();
  tick();
  log(`${esc(CONFIG.name)} arena ready.`, 'dim');
  log('Ctrl+Enter submits · drafts autosave on this device.', 'dim');
  log('Submissions are judged by the organisers; results appear in your dashboard.', 'dim');
}

/* =========================================================================
   BOOT
   ========================================================================= */
/** All screens live in templates.html as <template id="page-X">; /X picks which one is mounted. */
let PAGE = location.pathname.replace(/^\/+|\/+$/g, '') || 'index';
function mountPage() {
  if (!document.getElementById('page-' + PAGE)) PAGE = 'index';
  const t = document.getElementById('page-' + PAGE), d = t.dataset;
  document.title = 'CODE ARENA';
  document.body.dataset.page = d.bodyPage;
  if (d.bodyClass) document.body.className = d.bodyClass;
  const content = t.content.cloneNode(true);
  
  // Remove previously mounted page contents (everything except scripts, templates, toasts, modals)
  $$('body > :not(script):not(template):not(.toasts):not(.modal):not(.scrim)').forEach(el => {
    if (el.id !== 'root') el.remove();
  });
  
  // Also clear root just in case
  const root = document.getElementById('root');
  if (root) root.innerHTML = '';
  
  document.body.prepend(content);
}

export async function boot() {
  // Mount immediately so authenticated pages do not wait for remote config.
  // Dynamic values remain placeholders until Firestore provides them.
  const isAuthGated = PAGE === 'admin' || PAGE === 'dashboard' || PAGE === 'arena';
  mountPage();
  hydrateIcons();
  applyConfig();
  if (!isAuthGated) {
    const params = new URLSearchParams(location.search);
    if (params.has('login')) openLogin(params.get('next') || '/dashboard');
  }

  // 3. Authenticate and refresh config concurrently
  await Promise.all([ready(), loadConfig()]);

  if (PAGE === 'index' && session.user && !session.isAdmin && session.reg?.payment === 'paid') {
    location.replace('/dashboard' + (location.hash === '#rules' ? '#rules' : ''));
    return;
  }

  if (PAGE === 'admin' && !session.isAdmin) PAGE = 'admin-login';
  if (PAGE === 'arena') {
    if (CONFIG.compUrl) {
      location.replace(CONFIG.compUrl);
      return;
    } else {
      location.replace('/dashboard#arena');
      return;
    }
  }

  if (isAuthGated) hydrateIcons();
  applyConfig();
  if (configured) {
    watchDoc('config/event', e => {
      if (e) {
        Object.assign(CONFIG, e);
        try { localStorage.setItem('ca_config', JSON.stringify(CONFIG)); } catch (_) {}
        applyConfig();
      }
    });
    watchDoc('config/competition', c => {
      if (c) {
        COMP = { status: 'scheduled', ...c };
        try { localStorage.setItem('ca_comp', JSON.stringify(COMP)); } catch (_) {}
        applyConfig();
      }
    });
    watchDoc('config/stats', s => {
      if (s) {
        PAID = Number.isFinite(Number(s.paid)) ? Number(s.paid) : null;
        try { localStorage.setItem('ca_stats', JSON.stringify(s)); } catch (_) {}
        applyConfig();
      }
    });
  }
  if (!configured) toast('This site is not connected to Firebase yet — add the Firebase settings to .env.', 'warn');
  await ({
    landing: initLanding, register: initRegister, ticket: initTicket, dashboard: initDashboard,
    leaderboard: initLeaderboard, certificate: initCertificate, admin: initAdmin, 'admin-login': initAdminLogin, arena: initArena
  })[document.body.dataset.page]?.();
}
