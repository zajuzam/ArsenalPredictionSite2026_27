/* ============================================================
   Arsenal Predictor — Application Logic (Local API)
   ============================================================ */

// ── State ────────────────────────────────────────────────────
let currentUser   = null;
let currentSeason = null;
let allFixtures   = [];
let allPredictions = {};
let predictionTallies = {};   // fixture_id → { arsenal, draw, opp }
let currentFilter = 'all';

const API = CONFIG.apiUrl;

// ── Bootstrap ────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', init);

async function init() {
  const saved = localStorage.getItem('predictor_user');
  if (saved) {
    try {
      currentUser = JSON.parse(saved);
      await enterApp();
    } catch {
      localStorage.removeItem('predictor_user');
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────
async function apiFetch(path, options = {}) {
  const res = await fetch(API + path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  return res.json();
}

// ── Supabase REST helpers ─────────────────────────────────────
const SB_URL   = CONFIG.supabaseUrl;
const SB_KEY   = CONFIG.supabaseKey;
const SB_TABLE = (name) => (CONFIG.tablePrefix || '') + name;

function sbHeaders(extra = {}) {
  return {
    'apikey': SB_KEY,
    'Authorization': 'Bearer ' + SB_KEY,
    'Content-Type': 'application/json',
    ...extra,
  };
}

// Push (insert) a row into a table. Returns { data } or { error }.
async function pushToTable(table, row) {
  try {
    const res = await fetch(`${SB_URL}/rest/v1/${SB_TABLE(table)}`, {
      method: 'POST',
      headers: sbHeaders({ 'Prefer': 'return=representation' }),
      body: JSON.stringify(row),
    });
    const body = await res.json();
    if (!res.ok) {
      return { error: { code: body.code, message: body.message || 'Insert failed' } };
    }
    return { data: Array.isArray(body) ? body[0] : body };
  } catch (err) {
    return { error: { message: err.message } };
  }
}

// Read rows from a table with a PostgREST query string (e.g. 'username=eq.saju').
async function selectFromTable(table, queryStr = '') {
  try {
    const url = `${SB_URL}/rest/v1/${SB_TABLE(table)}${queryStr ? '?' + queryStr : ''}`;
    const res = await fetch(url, { headers: sbHeaders() });
    const body = await res.json();
    if (!res.ok) return { error: { code: body.code, message: body.message } };
    return { data: body };
  } catch (err) {
    return { error: { message: err.message } };
  }
}

// Insert-or-update a row, resolving conflicts on the given unique columns.
async function upsertToTable(table, row, onConflict) {
  try {
    const res = await fetch(`${SB_URL}/rest/v1/${SB_TABLE(table)}?on_conflict=${onConflict}`, {
      method: 'POST',
      headers: sbHeaders({ 'Prefer': 'resolution=merge-duplicates,return=representation' }),
      body: JSON.stringify(row),
    });
    const body = await res.json();
    if (!res.ok) return { error: { code: body.code, message: body.message || 'Upsert failed' } };
    return { data: Array.isArray(body) ? body[0] : body };
  } catch (err) {
    return { error: { message: err.message } };
  }
}

// Update rows matching a PostgREST filter (e.g. 'id=eq.5').
async function patchTable(table, queryStr, patch) {
  try {
    const res = await fetch(`${SB_URL}/rest/v1/${SB_TABLE(table)}?${queryStr}`, {
      method: 'PATCH',
      headers: sbHeaders({ 'Prefer': 'return=representation' }),
      body: JSON.stringify(patch),
    });
    const body = await res.json();
    if (!res.ok) return { error: { code: body.code, message: body.message || 'Update failed' } };
    return { data: Array.isArray(body) ? body[0] : body };
  } catch (err) {
    return { error: { message: err.message } };
  }
}

// Match result helper: 'H' home win, 'A' away win, 'D' draw.
function getResult(home, away) {
  if (home > away) return 'H';
  if (home < away) return 'A';
  return 'D';
}

async function hashPin(pin) {
  const buf  = new TextEncoder().encode(pin + 'arsenal_salt');
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Auth ─────────────────────────────────────────────────────
function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');
  document.getElementById('auth-login').classList.toggle('hidden', tab !== 'login');
  document.getElementById('auth-register').classList.toggle('hidden', tab !== 'register');
}

async function login() {
  const username = document.getElementById('login-username').value.trim().toLowerCase();
  const pin      = document.getElementById('login-pin').value.trim();
  const errEl    = document.getElementById('login-error');
  errEl.style.display = 'none';

  if (!username || !pin) { showAuthError(errEl, 'Please fill in all fields.'); return; }
  if (!/^\d{4}$/.test(pin)) { showAuthError(errEl, 'PIN must be exactly 4 digits.'); return; }
  if (username === 'admin' && pin !== CONFIG.adminPin) {
    showAuthError(errEl, 'Invalid admin credentials.'); return;
  }

  const pin_hash = await hashPin(pin);
  const result = await selectFromTable('players',
    `username=eq.${encodeURIComponent(username)}&pin_hash=eq.${encodeURIComponent(pin_hash)}&select=*`);

  if (result.error || !result.data || result.data.length === 0) {
    showAuthError(errEl, 'Incorrect username or PIN.'); return;
  }

  currentUser = result.data[0];
  localStorage.setItem('predictor_user', JSON.stringify(currentUser));
  await enterApp();
}

async function register() {
  const username = document.getElementById('reg-username').value.trim().toLowerCase();
  const email    = document.getElementById('reg-email').value.trim();
  const pin      = document.getElementById('reg-pin').value.trim();
  const pin2     = document.getElementById('reg-pin2').value.trim();
  const errEl    = document.getElementById('register-error');
  errEl.style.display = 'none';

  if (!username || !email || !pin || !pin2) { showAuthError(errEl, 'Please fill in all fields.'); return; }
  if (username === 'admin' && pin !== CONFIG.adminPin) {
    showAuthError(errEl, 'Invalid admin PIN.'); return;
  }
  if (username !== 'admin' && !/^[a-z0-9_]{3,20}$/.test(username)) {
    showAuthError(errEl, 'Username: 3-20 chars, letters/numbers/underscore only.'); return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showAuthError(errEl, 'Please enter a valid email address.'); return;
  }
  if (!/^\d{4}$/.test(pin)) { showAuthError(errEl, 'PIN must be exactly 4 digits.'); return; }
  if (pin !== pin2) { showAuthError(errEl, 'PINs do not match.'); return; }

  const pin_hash = await hashPin(pin);
  const is_admin = username === 'admin';

  // Capture the visitor's IP + country (best-effort) for the leaderboard flag.
  const geo = await fetchGeo();

  // Push the new player straight into the Supabase arsenal_players table.
  // id is auto-generated (numeric) by the database, so we don't send one.
  const result = await pushToTable('players', {
    username,
    email,
    pin_hash,
    is_admin,
    ip_address:   geo.ip || null,
    country_code: geo.country_code || null,
  });

  if (result.error) {
    if (result.error.code === '23505') showAuthError(errEl, 'Username already taken.');
    else showAuthError(errEl, result.error.message || 'Could not create account.');
    return;
  }

  currentUser = result.data;
  localStorage.setItem('predictor_user', JSON.stringify(currentUser));
  showToast('Welcome, ' + currentUser.username + '! 🔴', 'success');
  await enterApp();
}

function showAuthError(el, msg) { el.textContent = msg; el.style.display = 'block'; }

function logout() {
  localStorage.removeItem('predictor_user');
  currentUser = null; currentSeason = null; allFixtures = []; allPredictions = {};
  document.getElementById('app-header').classList.add('hidden');
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-auth').classList.add('active');
  ['login-username','login-pin','reg-username','reg-email','reg-pin','reg-pin2'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
}

// ── App Entry ────────────────────────────────────────────────
async function enterApp() {
  document.getElementById('app-header').classList.remove('hidden');
  if (currentUser.is_admin) document.getElementById('nav-admin').classList.remove('hidden');
  await loadSeason();
  showPage('fixtures');
}

// ── Data ─────────────────────────────────────────────────────
async function loadSeason() {
  const res = await selectFromTable('seasons', 'is_active=eq.true&select=*');
  currentSeason = (res.data && res.data[0]) || null;
  if (currentSeason) {
    document.getElementById('season-badge').textContent   = currentSeason.name;
    document.getElementById('lb-season-badge').textContent = currentSeason.name;
  }
}

async function loadFixtures() {
  if (!currentSeason) return;
  const res = await selectFromTable('fixtures',
    `season_id=eq.${encodeURIComponent(currentSeason.id)}&order=match_week.asc&select=*`);
  allFixtures = res.data || [];
}

async function loadPredictions() {
  if (!currentUser) return;
  const res = await selectFromTable('predictions',
    `player_id=eq.${encodeURIComponent(currentUser.id)}&select=*`);
  allPredictions = {};
  (res.data || []).forEach(p => { allPredictions[p.fixture_id] = p; });
}

// Aggregate ALL players' predictions per fixture into Arsenal-win / draw / opponent-win counts.
async function loadPredictionTallies() {
  const res = await selectFromTable('predictions', 'select=fixture_id,predicted_home,predicted_away');
  predictionTallies = {};
  const fixtureById = {};
  allFixtures.forEach(f => { fixtureById[f.id] = f; });

  (res.data || []).forEach(p => {
    const f = fixtureById[p.fixture_id];
    if (!f) return;
    if (!predictionTallies[p.fixture_id]) predictionTallies[p.fixture_id] = { arsenal: 0, draw: 0, opp: 0 };
    const t = predictionTallies[p.fixture_id];
    if (p.predicted_home === p.predicted_away) { t.draw++; return; }
    const homeWon = p.predicted_home > p.predicted_away;
    const arsenalIsHome = f.home_team === 'Arsenal';
    if ((homeWon && arsenalIsHome) || (!homeWon && !arsenalIsHome)) t.arsenal++;
    else t.opp++;
  });
}

// ── Navigation ────────────────────────────────────────────────
function toggleNav() {
  document.getElementById('main-nav')?.classList.toggle('open');
}

async function showPage(page) {
  document.getElementById('main-nav')?.classList.remove('open');  // close mobile menu
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  const btn = document.getElementById('nav-' + page);
  if (btn) btn.classList.add('active');

  if (page === 'fixtures')    {
    document.getElementById('fixtures-list').innerHTML = skeletonCards(5);
    await loadFixtures(); await loadPredictions(); await loadPredictionTallies(); renderFixtures();
  }
  else if (page === 'leaderboard') { await renderLeaderboard(); }
  else if (page === 'mypicks')     { await renderMyPicks(); }
  else if (page === 'admin')       { await renderAdmin(); }
  else if (page === 'about')       { /* static */ }
}

// ── Stadium Map ───────────────────────────────────────────────
const STADIUMS = {
  'Arsenal':               'Emirates Stadium',
  'Coventry City':         'Coventry Building Society Arena',
  'Aston Villa':           'Villa Park',
  'Chelsea':               'Stamford Bridge',
  'Sunderland':            'Stadium of Light',
  'Brighton & Hove Albion':'Amex Stadium',
  'Leeds United':          'Elland Road',
  'Nottingham Forest':     'City Ground',
  'Everton':               'Everton Stadium',
  'Liverpool':             'Anfield',
  'Hull City':             'MKM Stadium',
  'Newcastle United':      "St James' Park",
  'Manchester City':       'Etihad Stadium',
  'Brentford':             'Gtech Community Stadium',
  'Tottenham Hotspur':     'Tottenham Hotspur Stadium',
  'Bournemouth':           'Vitality Stadium',
  'Manchester United':     'Old Trafford',
  'Crystal Palace':        'Selhurst Park',
  'Fulham':                'Craven Cottage',
  'Ipswich Town':          'Portman Road',
};

// ESPN team IDs → used to build club crest image URLs.
const TEAM_IDS = {
  'Arsenal': 359, 'Coventry City': 388, 'Aston Villa': 362, 'Chelsea': 363,
  'Sunderland': 366, 'Brighton & Hove Albion': 331, 'Leeds United': 357,
  'Nottingham Forest': 393, 'Everton': 368, 'Liverpool': 364, 'Hull City': 306,
  'Newcastle United': 361, 'Manchester City': 382, 'Brentford': 337,
  'Tottenham Hotspur': 367, 'Bournemouth': 349, 'Manchester United': 360,
  'Crystal Palace': 384, 'Fulham': 370, 'Ipswich Town': 373,
};

function crestUrl(team) {
  const id = TEAM_IDS[team];
  return id ? `https://a.espncdn.com/i/teamlogos/soccer/500/${id}.png` : '';
}

function crestImg(team) {
  const url = crestUrl(team);
  const initials = team.split(' ').map(w => w[0]).join('').slice(0, 3).toUpperCase();
  // Fall back to an initials badge if the crest image fails to load.
  return `<span class="fc-crest-wrap">
    <img class="fc-crest" src="${url}" alt="${escHtml(team)} crest" loading="lazy"
         onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
    <span class="fc-crest-fallback" style="display:none">${initials}</span>
  </span>`;
}

function stadiumMapUrl(stadium) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stadium)}`;
}

// Predictions close this many minutes before kick-off.
const LOCK_MINUTES = 30;

const NICKNAMES = {
  'Arsenal': 'The Gunners', 'Coventry City': 'The Sky Blues', 'Aston Villa': 'The Villans',
  'Chelsea': 'The Blues', 'Sunderland': 'The Black Cats', 'Brighton & Hove Albion': 'The Seagulls',
  'Leeds United': 'The Whites', 'Nottingham Forest': 'The Tricky Trees', 'Everton': 'The Toffees',
  'Liverpool': 'The Reds', 'Hull City': 'The Tigers', 'Newcastle United': 'The Magpies',
  'Manchester City': 'The Citizens', 'Brentford': 'The Bees', 'Tottenham Hotspur': 'Spurs',
  'Bournemouth': 'The Cherries', 'Manchester United': 'The Red Devils', 'Crystal Palace': 'The Eagles',
  'Fulham': 'The Cottagers', 'Ipswich Town': 'The Tractor Boys',
};

// Team captains — EDITABLE. Verify each season; promoted clubs especially may change.
const CAPTAINS = {
  'Arsenal': 'Martin Ødegaard', 'Coventry City': 'Ben Sheaf', 'Aston Villa': 'John McGinn',
  'Chelsea': 'Reece James', 'Sunderland': 'Dan Neil', 'Brighton & Hove Albion': 'Lewis Dunk',
  'Leeds United': 'Ethan Ampadu', 'Nottingham Forest': 'Ryan Yates', 'Everton': 'James Tarkowski',
  'Liverpool': 'Virgil van Dijk', 'Hull City': 'Lewie Coyle', 'Newcastle United': 'Bruno Guimarães',
  'Manchester City': 'Bernardo Silva', 'Brentford': 'Nathan Collins', 'Tottenham Hotspur': 'Cristian Romero',
  'Bournemouth': 'Adam Smith', 'Manchester United': 'Bruno Fernandes', 'Crystal Palace': 'Marc Guéhi',
  'Fulham': 'Tom Cairney', 'Ipswich Town': 'Sam Morsy',
};

function nicknameOf(team) { return NICKNAMES[team] || ''; }
function captainOf(team)  { return CAPTAINS[team]  || ''; }

// True once predictions are closed (LOCK_MINUTES before kick-off).
function isFixtureLocked(f, now = new Date()) {
  const lockTime = new Date(new Date(f.match_date).getTime() - LOCK_MINUTES * 60000);
  return now >= lockTime;
}

// Best-effort public IP + country lookup for a new signup.
async function fetchGeo() {
  try {
    const res = await fetch('https://ipapi.co/json/');
    if (!res.ok) return {};
    const d = await res.json();
    return { ip: d.ip || null, country_code: d.country_code || null };
  } catch { return {}; }
}

// ISO-3166 alpha-2 code → flag image (emoji flags don't render on Windows).
function countryFlag(code) {
  if (!code || code.length !== 2) return '';
  const cc = code.toLowerCase();
  const CC = code.toUpperCase();
  return `<img class="flag-img" src="https://flagcdn.com/24x18/${cc}.png" srcset="https://flagcdn.com/48x36/${cc}.png 2x" width="24" height="18" alt="${CC}" title="${CC}" loading="lazy" onerror="this.replaceWith(document.createTextNode('${CC}'))">`;
}

// ── Avatars ───────────────────────────────────────────────────
const AVATAR_COLORS = ['#EF0107','#9C824A','#1a2a5e','#0F6E56','#993C1D','#534AB7','#185FA5','#A32D2D','#3B6D11','#72243E'];
function avatarColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function avatarInitials(name) {
  const parts = String(name).replace(/[^a-zA-Z0-9 _]/g, '').split(/[ _]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return String(name).slice(0, 2).toUpperCase();
}
function avatarHtml(name, size = 34) {
  return `<span class="avatar" style="width:${size}px;height:${size}px;background:${avatarColor(name)};font-size:${Math.round(size * 0.4)}px">${escHtml(avatarInitials(name))}</span>`;
}

// ── Achievement badges (from a player's stats + rank) ─────────
function playerBadges(s, rank) {
  const b = [];
  if (rank === 1)      b.push({ icon: '👑', label: 'Leader' });
  if (s.exact >= 2)    b.push({ icon: '🎯', label: 'Sharp' });
  if (s.correct >= 3)  b.push({ icon: '✅', label: 'Consistent' });
  if (s.exact >= 1 && b.length < 2) b.push({ icon: '⭐', label: 'Exact score' });
  return b.slice(0, 2);
}
function badgesHtml(s, rank) {
  return playerBadges(s, rank).map(x => `<span class="badge" title="${x.label}">${x.icon} ${x.label}</span>`).join('');
}

// ── Confetti celebration ──────────────────────────────────────
function celebrate() {
  const colors = ['#EF0107', '#9C824A', '#ffffff', '#1a2a5e', '#FF4B4F'];
  const c = document.createElement('div');
  c.className = 'confetti';
  for (let i = 0; i < 70; i++) {
    const p = document.createElement('i');
    p.style.left = Math.random() * 100 + 'vw';
    p.style.background = colors[i % colors.length];
    p.style.animationDelay = (Math.random() * 0.35) + 's';
    p.style.animationDuration = (1.6 + Math.random() * 1.2) + 's';
    c.appendChild(p);
  }
  document.body.appendChild(c);
  setTimeout(() => c.remove(), 3200);
}

// ── Skeleton loaders ──────────────────────────────────────────
function skeletonCards(n = 4) {
  return Array.from({ length: n }).map(() => `
    <div class="skel-card">
      <div class="skel-bar" style="width:40%"></div>
      <div class="skel-teams"><div class="skel-circle"></div><div class="skel-bar" style="width:20%"></div><div class="skel-circle"></div></div>
      <div class="skel-bar" style="width:60%"></div>
    </div>`).join('');
}
function skeletonRows(n = 6) {
  return `<div class="leaderboard-table">${Array.from({ length: n }).map(() => `
    <div class="skel-row"><div class="skel-circle sm"></div><div class="skel-bar" style="width:45%"></div></div>`).join('')}</div>`;
}

// Small navy naval-captain (anchor) icon used next to captain names.
const CAPTAIN_ICON = `<svg class="cap-icon" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="#1a2a5e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="4.5" r="2"/><line x1="12" y1="6.5" x2="12" y2="21"/><line x1="8.5" y1="10" x2="15.5" y2="10"/><path d="M5 14a7 7 0 0 0 14 0"/></svg>`;

// Countdown-to-kickoff helpers.
function countdownParts(diff) {
  const mins = Math.floor(diff / 60000);
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

let countdownInterval = null;
function startCountdownTimers() {
  if (countdownInterval) return;
  countdownInterval = setInterval(updateCountdowns, 30000);
}
function updateCountdowns() {
  document.querySelectorAll('.fc-timer').forEach(el => {
    const diff = new Date(el.getAttribute('data-kickoff')) - new Date();
    el.innerHTML = diff <= 0 ? '⏳ <b>Kicking off…</b>' : `⏳ Starts in <b>${countdownParts(diff)}</b>`;
  });
}

// ── Fixtures ──────────────────────────────────────────────────
function filterFixtures(filter, btn) {
  currentFilter = filter;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderFixtures();
}

function renderFixtures() {
  const container = document.getElementById('fixtures-list');
  const now = new Date();
  let list = [...allFixtures];
  if (currentFilter === 'upcoming')  list = list.filter(f => f.status === 'scheduled' && new Date(f.match_date) > now);
  if (currentFilter === 'predicted') list = list.filter(f => allPredictions[f.id]);
  if (currentFilter === 'completed') list = list.filter(f => f.status === 'completed');
  if (currentFilter === 'home')      list = list.filter(f => f.home_team === 'Arsenal');
  if (currentFilter === 'away')      list = list.filter(f => f.away_team === 'Arsenal');

  if (!list.length) {
    container.innerHTML = `<div class="empty-state"><div class="icon">📋</div><p>No fixtures in this filter.</p></div>`;
    return;
  }
  container.innerHTML = list.map(f => renderFixtureCard(f, now)).join('');
  startCountdownTimers();
}

function renderFixtureCard(f, now) {
  const prediction    = allPredictions[f.id];
  const kickoffTime   = new Date(f.match_date);
  const isCompleted   = f.status === 'completed';
  const isLocked      = isFixtureLocked(f, now);   // predictions closed (30 min before)
  const hasKickedOff  = now >= kickoffTime;
  const homeIsArsenal = f.home_team === 'Arsenal';
  const homeClass     = homeIsArsenal ? 'arsenal' : '';
  const awayClass     = f.away_team === 'Arsenal' ? 'arsenal' : '';
  const venueBadge    = homeIsArsenal ? '🏠 Home' : '✈ Away';
  const stadium       = STADIUMS[f.home_team] || '';

  let cardClass = '';
  if (isCompleted)     cardClass = 'completed';
  else if (isLocked)   cardClass = 'locked';
  else if (prediction) cardClass = 'predicted';

  // Middle block: final score, live ball, lock icon, or "VS".
  let midBlock;
  if (isCompleted) {
    midBlock = `<div class="fc-mid"><span class="fc-score">${f.home_score}</span><span class="fc-score-sep">–</span><span class="fc-score">${f.away_score}</span></div>`;
  } else if (hasKickedOff) {
    midBlock = `<div class="fc-mid"><span class="fc-ball">⚽</span></div>`;
  } else if (isLocked) {
    midBlock = `<div class="fc-mid"><span class="fc-ball">🔒</span></div>`;
  } else {
    midBlock = `<div class="fc-mid">VS</div>`;
  }

  const header = `
    <div class="fc-header">
      <div class="fc-header-left">
        <span class="fc-gw">GW ${f.match_week}</span>
        <span class="fc-venue">${venueBadge}</span>
      </div>
      <span class="fc-date">${formatDate(kickoffTime)}</span>
    </div>`;

  // Live countdown to kick-off (only before the match starts).
  const timerRow = (!isCompleted && !hasKickedOff)
    ? `<div class="fc-timer" data-kickoff="${f.match_date}">⏳ Starts in <b>${countdownParts(kickoffTime - now)}</b></div>`
    : '';

  const teamBlock = (team, cls) => {
    const nick = nicknameOf(team);
    const cap  = captainOf(team);
    return `<div class="fc-team">${crestImg(team)}
      <span class="fc-name ${cls}">${escHtml(team)}${nick ? ` <span class="fc-nick">(${escHtml(nick)})</span>` : ''}</span>
      ${cap ? `<span class="fc-captain">${CAPTAIN_ICON} ${escHtml(cap)}</span>` : ''}
    </div>`;
  };

  const teams = `
    <div class="fc-teams">
      ${teamBlock(f.home_team, homeClass)}
      ${midBlock}
      ${teamBlock(f.away_team, awayClass)}
    </div>`;

  const stadiumRow = stadium ? `
    <div class="fc-stadium">📍 ${escHtml(stadium)}
      <a class="fc-map" href="${stadiumMapUrl(stadium)}" target="_blank" rel="noopener">· View map</a>
    </div>` : '';

  // Prediction breakdown across all players.
  const opponent   = homeIsArsenal ? f.away_team : f.home_team;
  const t          = predictionTallies[f.id] || { arsenal: 0, draw: 0, opp: 0 };
  const totalVotes = t.arsenal + t.draw + t.opp;
  const pct        = n => totalVotes ? Math.round((n / totalVotes) * 100) : 0;
  const votesRow = `
    <div class="fc-votes">
      <div class="fc-votes-head"><span>How players predicted</span><span class="fc-votes-total">${totalVotes} ${totalVotes === 1 ? 'pick' : 'picks'}</span></div>
      ${totalVotes ? `<div class="fc-votes-bar">
        <div class="seg win"  style="width:${pct(t.arsenal)}%"></div>
        <div class="seg draw" style="width:${pct(t.draw)}%"></div>
        <div class="seg loss" style="width:${pct(t.opp)}%"></div>
      </div>` : ''}
      <div class="fc-votes-legend">
        <span><i class="dot win"></i>Arsenal win <b>${t.arsenal}</b></span>
        <span><i class="dot draw"></i>Draw <b>${t.draw}</b></span>
        <span><i class="dot loss"></i>${escHtml(opponent)} win <b>${t.opp}</b></span>
      </div>
    </div>`;

  // Footer differs by match state.
  let footer;
  if (isCompleted) {
    const pts = prediction ? prediction.points_earned : null;
    const ptsClass = pts === 3 ? 'pts-3' : pts === 1 ? 'pts-1' : pts === 0 ? 'pts-0' : 'pts-pending';
    const ptsText  = pts !== null
      ? `<span class="points-badge ${ptsClass}">${pts===3?'⭐ Exact!':pts===1?'✓ Correct result':'✗ Wrong'} · ${pts}pt${pts!==1?'s':''}</span>`
      : `<span class="points-badge pts-pending">No prediction</span>`;
    const predText = prediction ? `Predicted: ${prediction.predicted_home}–${prediction.predicted_away}` : 'No prediction made';
    footer = `<div class="fc-footer"><span class="prediction-label">${predText}</span>${ptsText}</div>`;
  } else if (isLocked) {
    const predText = prediction ? `Predicted: ${prediction.predicted_home}–${prediction.predicted_away}` : 'No prediction made';
    const pill = hasKickedOff ? 'In Progress' : 'Locked';
    footer = `<div class="fc-footer"><span class="prediction-label">${predText}</span><span class="status-pill status-locked">${pill}</span></div>`;
  } else {
    const ph = prediction ? prediction.predicted_home : '';
    const pa = prediction ? prediction.predicted_away : '';
    footer = `<div class="fc-footer">
      <input class="score-input" type="number" min="0" max="20" value="${ph}" id="ph-${f.id}" placeholder="0">
      <span class="score-sep">–</span>
      <input class="score-input" type="number" min="0" max="20" value="${pa}" id="pa-${f.id}" placeholder="0">
      <button class="predict-btn" onclick="savePrediction('${f.id}')">${prediction ? 'Update' : 'Predict'}</button>
      <span class="fc-closes">Closes ${LOCK_MINUTES} min before kick-off</span>
    </div>`;
  }

  return `<div class="fixture-card v2 ${cardClass}">${header}${timerRow}${teams}${stadiumRow}${votesRow}${footer}</div>`;
}

// ── Save Prediction ───────────────────────────────────────────
async function savePrediction(fixtureId) {
  const fixture = allFixtures.find(x => x.id === fixtureId);
  if (fixture && isFixtureLocked(fixture)) {
    showToast(`Predictions closed — locked ${LOCK_MINUTES} min before kick-off.`, 'error');
    renderFixtures(); return;
  }
  const home = parseInt(document.getElementById('ph-' + fixtureId)?.value);
  const away = parseInt(document.getElementById('pa-' + fixtureId)?.value);
  if (isNaN(home) || isNaN(away) || home < 0 || away < 0 || home > 20 || away > 20) {
    showToast('Enter valid scores (0–20) for both teams.', 'error'); return;
  }
  // Upsert on (player_id, fixture_id) so re-predicting updates the existing row.
  const res = await upsertToTable('predictions', {
    player_id: currentUser.id,
    fixture_id: fixtureId,
    predicted_home: home,
    predicted_away: away,
    updated_at: new Date().toISOString(),
  }, 'player_id,fixture_id');
  if (res.error) { showToast('Could not save prediction.', 'error'); return; }
  allPredictions[fixtureId] = res.data;
  showToast('Prediction saved! 🔴', 'success');
  celebrate();
  await loadPredictionTallies();
  renderFixtures();
}

// ── Leaderboard ───────────────────────────────────────────────
async function renderLeaderboard() {
  const container = document.getElementById('leaderboard-list');
  container.innerHTML = skeletonRows(6);

  const res = await selectFromTable('players',
    'is_admin=eq.false&order=total_points.desc&select=id,username,total_points,country_code');
  const players = res.data || [];

  // Need fixture statuses to compute accuracy (predictions on completed games).
  if (!allFixtures.length) await loadFixtures();
  const completedIds = new Set(allFixtures.filter(f => f.status === 'completed').map(f => f.id));

  const predRes = await selectFromTable('predictions', 'select=player_id,fixture_id,points_earned');
  const stats = {};
  (predRes.data || []).forEach(p => {
    if (!stats[p.player_id]) stats[p.player_id] = { exact: 0, correct: 0, played: 0 };
    if (completedIds.has(p.fixture_id)) {
      stats[p.player_id].played++;
      if (p.points_earned === 3) stats[p.player_id].exact++;
      else if (p.points_earned === 1) stats[p.player_id].correct++;
    }
  });
  const accOf = s => s.played ? Math.round(((s.exact + s.correct) / s.played) * 100) : null;

  if (!players.length) {
    container.innerHTML = `<div class="empty-state"><div class="icon">🏆</div><p>No players yet. Be the first to predict!</p></div>`; return;
  }

  // Podium: 2nd, 1st, 3rd for the classic centre-tallest look.
  const podiumOrder = [players[1], players[0], players[2]];
  const podiumPlace = [2, 1, 3];
  const podium = `<div class="podium">${podiumOrder.map((u, idx) => {
    const place = podiumPlace[idx];
    if (!u) return `<div class="podium-col empty place-${place}"></div>`;
    const isMe = u.id === currentUser?.id;
    return `<div class="podium-col place-${place} ${isMe ? 'me' : ''}">
      <div class="podium-medal">${place === 1 ? '🥇' : place === 2 ? '🥈' : '🥉'}</div>
      ${avatarHtml(u.username, place === 1 ? 60 : 50)}
      <div class="podium-name">${escHtml(u.username)}${u.country_code ? ` <span class="lb-flag">${countryFlag(u.country_code)}</span>` : ''}</div>
      <div class="podium-pts">${u.total_points} pts</div>
      <div class="podium-stand">${place}</div>
    </div>`;
  }).join('')}</div>`;

  const rows = players.map((u, i) => {
    const rank = i + 1;
    const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;
    const isMe = u.id === currentUser?.id;
    const s = stats[u.id] || { exact: 0, correct: 0, played: 0 };
    const acc = accOf(s);
    return `<div class="lb-row ${isMe ? 'me' : ''}">
      <div class="lb-rank ${rank <= 3 ? `rank-${rank}` : ''}">${medal}</div>
      <div class="lb-name">${avatarHtml(u.username, 30)}<span class="lb-name-txt"><span class="lb-uname">${escHtml(u.username)} ${isMe ? '<span class="me-tag">You</span>' : ''}</span><span class="lb-badges">${badgesHtml(s, rank)}</span></span></div>
      <div class="lb-country" style="text-align:center">${u.country_code ? `<span class="lb-flag">${countryFlag(u.country_code)}</span>` : '—'}</div>
      <div class="lb-pts" style="text-align:center">${u.total_points}</div>
      <div class="lb-acc" style="text-align:center">${acc === null ? '—' : acc + '%'}</div>
      <div class="lb-exact" style="text-align:center">${s.exact}</div>
      <div class="lb-correct" style="text-align:center">${s.correct}</div>
    </div>`;
  }).join('');

  container.innerHTML = `${podium}
    <div class="leaderboard-table">
      <div class="lb-header">
        <div>#</div><div>Player</div>
        <div style="text-align:center">Country</div>
        <div style="text-align:center">Points</div>
        <div style="text-align:center">Acc</div>
        <div style="text-align:center">⭐ Exact</div>
        <div style="text-align:center">✓ Result</div>
      </div>
      ${rows}
    </div>`;
}

// ── My Picks (personal profile) ───────────────────────────────
async function renderMyPicks() {
  const body = document.getElementById('mypicks-body');
  if (!currentUser) { body.innerHTML = ''; return; }
  body.innerHTML = skeletonRows(5);

  if (!allFixtures.length) await loadFixtures();
  await loadPredictions();
  const completedIds = new Set(allFixtures.filter(f => f.status === 'completed').map(f => f.id));

  const preds = Object.values(allPredictions);
  let exact = 0, correct = 0, played = 0, points = 0;
  preds.forEach(p => {
    points += p.points_earned || 0;
    if (completedIds.has(p.fixture_id)) {
      played++;
      if (p.points_earned === 3) exact++;
      else if (p.points_earned === 1) correct++;
    }
  });
  const acc = played ? Math.round(((exact + correct) / played) * 100) : null;

  const statCards = `
    <div class="mp-stats">
      <div class="mp-stat"><div class="mp-num">${points}</div><div class="mp-label">Points</div></div>
      <div class="mp-stat"><div class="mp-num">${preds.length}</div><div class="mp-label">Predictions</div></div>
      <div class="mp-stat"><div class="mp-num">${exact}</div><div class="mp-label">⭐ Exact</div></div>
      <div class="mp-stat"><div class="mp-num">${correct}</div><div class="mp-label">✓ Results</div></div>
      <div class="mp-stat"><div class="mp-num">${acc === null ? '—' : acc + '%'}</div><div class="mp-label">Accuracy</div></div>
    </div>`;

  const header = `
    <div class="mp-header">
      ${avatarHtml(currentUser.username, 56)}
      <div>
        <div class="mp-name">${escHtml(currentUser.username)}${currentUser.country_code ? ` <span class="lb-flag">${countryFlag(currentUser.country_code)}</span>` : ''}</div>
        <div class="mp-sub">${badgesHtml({ exact, correct }, 0) || 'Make predictions to earn badges'}</div>
      </div>
    </div>`;

  const byWeek = allFixtures.slice().sort((a, b) => a.match_week - b.match_week);
  const list = byWeek.map(f => {
    const p = allPredictions[f.id];
    if (!p) return '';
    const opp = f.home_team === 'Arsenal' ? f.away_team : f.home_team;
    const done = f.status === 'completed';
    const pts = p.points_earned || 0;
    const badge = done
      ? `<span class="points-badge ${pts === 3 ? 'pts-3' : pts === 1 ? 'pts-1' : 'pts-0'}">${pts} pt${pts !== 1 ? 's' : ''}</span>`
      : `<span class="status-pill status-open">Pending</span>`;
    const result = done ? ` · Final ${f.home_score}–${f.away_score}` : '';
    return `<div class="mp-row">
      <div><span class="mp-gw">GW${f.match_week}</span> ${escHtml(f.home_team)} vs ${escHtml(f.away_team)}</div>
      <div class="mp-pred">You: ${p.predicted_home}–${p.predicted_away}${result} ${badge}</div>
    </div>`;
  }).join('');

  body.innerHTML = header + statCards +
    (list ? `<div class="mp-list">${list}</div>` : `<div class="empty-state"><div class="icon">📝</div><p>You haven't made any predictions yet. Head to Fixtures to start!</p></div>`);
}

// ── Admin ─────────────────────────────────────────────────────
async function renderAdmin() {
  if (!currentUser?.is_admin) return;
  await loadFixtures();

  // Stats computed directly from Supabase.
  const [playersRes, predsRes] = await Promise.all([
    selectFromTable('players', 'is_admin=eq.false&select=id'),
    selectFromTable('predictions', 'select=id'),
  ]);
  const playerCount = (playersRes.data || []).length;
  const predCount   = (predsRes.data || []).length;
  const completed   = allFixtures.filter(f => f.status === 'completed').length;
  document.getElementById('stat-players').textContent     = playerCount;
  document.getElementById('stat-predictions').textContent = predCount;
  document.getElementById('stat-completed').textContent   = completed;
  document.getElementById('stat-remaining').textContent   = 38 - completed;
  document.getElementById('fetch-api-btn').classList.toggle('hidden', !CONFIG.footballDataApiKey);

  await renderAdminPlayers();

  const now     = new Date();
  const pending = allFixtures.filter(f => f.status === 'scheduled' && new Date(f.match_date) <= now);
  const listEl  = document.getElementById('admin-pending-list');

  if (!pending.length) {
    listEl.innerHTML = `<div class="empty-state" style="padding:24px 0"><div class="icon">✅</div><p>No pending results!</p></div>`; return;
  }
  listEl.innerHTML = pending.map(f => `
    <div class="result-fixture">
      <div>
        <div class="result-teams">GW${f.match_week}: ${escHtml(f.home_team)} vs ${escHtml(f.away_team)}</div>
        <div class="result-date">${formatDate(new Date(f.match_date))}</div>
      </div>
      <div class="result-inputs">
        <input class="score-input" type="number" min="0" max="20" id="rh-${f.id}" placeholder="H">
        <span class="score-sep">–</span>
        <input class="score-input" type="number" min="0" max="20" id="ra-${f.id}" placeholder="A">
        <button class="predict-btn" onclick="submitResult('${f.id}')">Save</button>
      </div>
    </div>`).join('');
}

// ── Admin: Manage Players (PIN reset) ─────────────────────────
async function renderAdminPlayers() {
  const listEl = document.getElementById('admin-players-list');
  if (!listEl) return;
  const res = await selectFromTable('players', 'is_admin=eq.false&order=username.asc&select=id,username,email,country_code');
  const players = res.data || [];
  if (!players.length) {
    listEl.innerHTML = `<div class="empty-state" style="padding:24px 0"><div class="icon">👥</div><p>No players yet.</p></div>`;
    return;
  }
  listEl.innerHTML = players.map(p => `
    <div class="result-fixture">
      <div>
        <div class="result-teams">${p.country_code?`<span class="lb-flag">${countryFlag(p.country_code)}</span> `:''}${escHtml(p.username)}</div>
        <div class="result-date">${escHtml(p.email || 'no email')}${p.country_code?` · ${escHtml(p.country_code)}`:''}</div>
      </div>
      <div class="result-inputs">
        <input class="score-input" style="width:64px" type="password" maxlength="4"
               inputmode="numeric" placeholder="New PIN" id="pin-${p.id}">
        <button class="predict-btn" onclick="adminResetPin('${p.id}')">Reset PIN</button>
      </div>
    </div>`).join('');
}

async function adminResetPin(playerId) {
  if (!currentUser?.is_admin) { showToast('Admins only.', 'error'); return; }
  const inputEl = document.getElementById('pin-' + playerId);
  const newPin  = (inputEl && inputEl.value ? inputEl.value : '').trim();
  if (!/^\d{4}$/.test(newPin)) { showToast('PIN must be exactly 4 digits.', 'error'); return; }

  const pin_hash = await hashPin(newPin);
  const res = await patchTable('players', `id=eq.${playerId}`, { pin_hash: pin_hash });
  if (res.error) { showToast('Could not reset PIN.', 'error'); return; }
  if (inputEl) inputEl.value = '';
  showToast('PIN reset done', 'success');
}

function adminOpenResultsModal() {
  const now     = new Date();
  const pending = allFixtures.filter(f => f.status === 'scheduled' && new Date(f.match_date) <= now);
  if (!pending.length) { showToast('No pending results at this time.', 'info'); return; }
  document.getElementById('modal-title').textContent = `Enter Results (${pending.length} pending)`;
  document.getElementById('modal-body').innerHTML = pending.map(f => `
    <div class="result-fixture">
      <div>
        <div class="result-teams" style="font-size:0.85rem;font-weight:700">GW${f.match_week}: ${escHtml(f.home_team)} vs ${escHtml(f.away_team)}</div>
        <div class="result-date">${formatDate(new Date(f.match_date))}</div>
      </div>
      <div class="result-inputs">
        <input class="score-input" type="number" min="0" max="20" id="mh-${f.id}" placeholder="H">
        <span class="score-sep">–</span>
        <input class="score-input" type="number" min="0" max="20" id="ma-${f.id}" placeholder="A">
        <button class="predict-btn" onclick="submitResult('${f.id}','modal')">✓</button>
      </div>
    </div>`).join('');
  document.getElementById('modal-overlay').classList.add('open');
}

async function submitResult(fixtureId, source) {
  const pre  = source === 'modal' ? 'mh-' : 'rh-';
  const preA = source === 'modal' ? 'ma-' : 'ra-';
  const h    = parseInt(document.getElementById(pre  + fixtureId)?.value);
  const a    = parseInt(document.getElementById(preA + fixtureId)?.value);
  if (isNaN(h) || isNaN(a) || h < 0 || a < 0) { showToast('Enter valid scores.', 'error'); return; }

  const ok = await applyResult(fixtureId, h, a);
  if (!ok) { showToast('Failed to save result.', 'error'); return; }

  const f = allFixtures.find(x => x.id === fixtureId);
  if (f) { f.home_score = h; f.away_score = a; f.status = 'completed'; }
  showToast(`Result saved: ${h}–${a} ✅`, 'success');
  if (source === 'modal') closeModal();
  await renderAdmin();
}

// Save a fixture result and (re)score all predictions on it. Returns true on success.
async function applyResult(fixtureId, h, a) {
  const fixRes = await patchTable('fixtures', `id=eq.${encodeURIComponent(fixtureId)}`,
    { home_score: h, away_score: a, status: 'completed' });
  if (fixRes.error) return false;

  const predsRes = await selectFromTable('predictions', `fixture_id=eq.${encodeURIComponent(fixtureId)}&select=*`);
  const actual = getResult(h, a);
  for (const p of (predsRes.data || [])) {
    let pts = 0;
    if (p.predicted_home === h && p.predicted_away === a) pts = 3;
    else if (getResult(p.predicted_home, p.predicted_away) === actual) pts = 1;

    const prev = p.points_earned || 0;
    await patchTable('predictions', `id=eq.${p.id}`, { points_earned: pts });

    const plRes = await selectFromTable('players', `id=eq.${p.player_id}&select=total_points`);
    const curTotal = plRes.data?.[0]?.total_points || 0;
    const newTotal = Math.max(0, curTotal - prev + pts);
    await patchTable('players', `id=eq.${p.player_id}`, { total_points: newTotal });
  }
  return true;
}

// ── Auto-fetch Results ────────────────────────────────────────
async function adminFetchResults() {
  if (!CONFIG.footballDataApiKey) { showToast('Add your football-data.org API key in config.js.', 'info'); return; }
  showToast('Fetching results…', 'info');
  try {
    const res  = await fetch(`https://api.football-data.org/v4/competitions/PL/matches?status=FINISHED&season=${CONFIG.season.year}`, { headers: { 'X-Auth-Token': CONFIG.footballDataApiKey } });
    const json = await res.json();
    let updated = 0;
    for (const m of (json.matches || [])) {
      const home = normalizeTeamName(m.homeTeam.name);
      const away = normalizeTeamName(m.awayTeam.name);
      const fix  = allFixtures.find(f => normalizeTeamName(f.home_team) === home && normalizeTeamName(f.away_team) === away && f.status === 'scheduled');
      if (fix && m.score?.fullTime?.home != null) {
        await applyResult(fix.id, m.score.fullTime.home, m.score.fullTime.away);
        fix.status = 'completed'; fix.home_score = m.score.fullTime.home; fix.away_score = m.score.fullTime.away;
        updated++;
      }
    }
    showToast(`Updated ${updated} result${updated !== 1 ? 's' : ''}.`, 'success');
    await renderAdmin();
  } catch (err) { showToast('API fetch failed.', 'error'); console.error(err); }
}

function normalizeTeamName(name) {
  const map = { 'Arsenal FC':'Arsenal','Coventry City FC':'Coventry City','Aston Villa FC':'Aston Villa','Chelsea FC':'Chelsea','Sunderland AFC':'Sunderland','Brighton & Hove Albion FC':'Brighton & Hove Albion','Leeds United FC':'Leeds United','Nottingham Forest FC':'Nottingham Forest','Everton FC':'Everton','Liverpool FC':'Liverpool','Hull City AFC':'Hull City','Newcastle United FC':'Newcastle United','Manchester City FC':'Manchester City','Brentford FC':'Brentford','Tottenham Hotspur FC':'Tottenham Hotspur','AFC Bournemouth':'Bournemouth','Manchester United FC':'Manchester United','Crystal Palace FC':'Crystal Palace','Fulham FC':'Fulham','Ipswich Town FC':'Ipswich Town' };
  return map[name] || name.replace(/ FC$| AFC$/,'');
}

// ── Modal ─────────────────────────────────────────────────────
function closeModal(e) {
  if (e && e.target !== document.getElementById('modal-overlay')) return;
  document.getElementById('modal-overlay').classList.remove('open');
}

// ── Toast ─────────────────────────────────────────────────────
function showToast(message, type = 'info') {
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = message;
  document.getElementById('toast-container').appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

// ── Helpers ───────────────────────────────────────────────────
function formatDate(date) {
  if (!(date instanceof Date) || isNaN(date)) return '—';
  return date.toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
}
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.querySelector('.page.active')?.id === 'page-auth') {
    document.getElementById('auth-login').classList.contains('hidden') ? register() : login();
  }
});
