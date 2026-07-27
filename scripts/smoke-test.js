#!/usr/bin/env node
/* ============================================================
   Arsenal Predictor — Smoke Test
   ------------------------------------------------------------
   Runnable, self-cleaning end-to-end test of the live Supabase
   backend. Exercises the exact REST calls the web/mobile app
   makes (auth, fixtures, predictions, scoring, leaderboard).

   It creates a throwaway test player and a throwaway test
   fixture (match_week 999), runs every check against them, then
   deletes everything it created — leaving your real data
   untouched. Safe to run before and after launch.

   Requirements: Node 18+ (uses global fetch).
   Run:  node scripts/smoke-test.js
   Reads Supabase URL/key/prefix straight from ../config.js.
   Exit code 0 = all passed, 1 = one or more failures.
   ============================================================ */

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

// ── Load config.js (no module.exports there, so parse it) ────
function loadConfig() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'config.js'), 'utf8');
  const pick = (key) => {
    const m = src.match(new RegExp(key + "\\s*:\\s*'([^']*)'"));
    return m ? m[1] : null;
  };
  const cfg = {
    supabaseUrl: pick('supabaseUrl'),
    supabaseKey: pick('supabaseKey'),
    tablePrefix: pick('tablePrefix') || '',
  };
  const exact   = src.match(/exactScore\s*:\s*(\d+)/);
  const correct = src.match(/correctResult\s*:\s*(\d+)/);
  cfg.scoring = { exactScore: exact ? +exact[1] : 3, correctResult: correct ? +correct[1] : 1 };
  if (!cfg.supabaseUrl || !cfg.supabaseKey) {
    throw new Error('Could not read supabaseUrl / supabaseKey from config.js');
  }
  return cfg;
}

const CONFIG = loadConfig();
const SB_URL = CONFIG.supabaseUrl.replace(/\/$/, '');
const SB_KEY = CONFIG.supabaseKey;
const T = (name) => CONFIG.tablePrefix + name;   // arsenal_players, etc.

function headers(extra = {}) {
  return { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', ...extra };
}

// ── REST helpers (mirror app.js) ─────────────────────────────
async function sbSelect(table, query = '') {
  const url = `${SB_URL}/rest/v1/${T(table)}${query ? '?' + query : ''}`;
  const res = await fetch(url, { headers: headers() });
  const body = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data: body };
}
async function sbInsert(table, row) {
  const res = await fetch(`${SB_URL}/rest/v1/${T(table)}`, {
    method: 'POST', headers: headers({ Prefer: 'return=representation' }), body: JSON.stringify(row),
  });
  const body = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data: Array.isArray(body) ? body[0] : body };
}
async function sbUpsert(table, row, onConflict) {
  const res = await fetch(`${SB_URL}/rest/v1/${T(table)}?on_conflict=${onConflict}`, {
    method: 'POST', headers: headers({ Prefer: 'resolution=merge-duplicates,return=representation' }), body: JSON.stringify(row),
  });
  const body = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data: Array.isArray(body) ? body[0] : body };
}
async function sbPatch(table, query, patch) {
  const res = await fetch(`${SB_URL}/rest/v1/${T(table)}?${query}`, {
    method: 'PATCH', headers: headers({ Prefer: 'return=representation' }), body: JSON.stringify(patch),
  });
  const body = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data: Array.isArray(body) ? body[0] : body };
}
async function sbDelete(table, query) {
  const res = await fetch(`${SB_URL}/rest/v1/${T(table)}?${query}`, { method: 'DELETE', headers: headers() });
  return { ok: res.ok, status: res.status };
}

// ── Same PIN hash the app uses ───────────────────────────────
function hashPin(pin) {
  return crypto.createHash('sha256').update(pin + 'arsenal_salt').digest('hex');
}
// Pure scoring rule (mirrors app.js getResult + points logic)
function result(h, a) { return h > a ? 'H' : a > h ? 'A' : 'D'; }
function score(ph, pa, ah, aa) {
  if (ph === ah && pa === aa) return CONFIG.scoring.exactScore;      // exact
  if (result(ph, pa) === result(ah, aa)) return CONFIG.scoring.correctResult; // right result
  return 0;
}

// ── Tiny test runner ─────────────────────────────────────────
let passed = 0, failed = 0;
const line = (s) => process.stdout.write(s + '\n');
function ok(name, cond, detail = '') {
  if (cond) { passed++; line(`  ✓ ${name}`); }
  else { failed++; line(`  ✗ ${name}${detail ? '  — ' + detail : ''}`); }
}

async function run() {
  line('\nArsenal Predictor — smoke test');
  line('Target: ' + SB_URL + '  (prefix "' + CONFIG.tablePrefix + '")\n');

  const stamp   = Date.now();
  const uname   = `__smoketest_${stamp}`;
  const pin     = '4242';
  const pinHash = hashPin(pin);
  const tempFix = `smoketest-fix-${stamp}`;
  let playerId = null, seasonId = null;

  try {
    // 1. Connectivity + active season
    line('Connectivity & season');
    const seasons = await sbSelect('seasons', 'is_active=eq.true&select=*');
    ok('reach Supabase REST (anon key)', seasons.ok, `HTTP ${seasons.status}`);
    ok('exactly one active season', Array.isArray(seasons.data) && seasons.data.length === 1,
       `got ${Array.isArray(seasons.data) ? seasons.data.length : 'n/a'}`);
    seasonId = seasons.data && seasons.data[0] && seasons.data[0].id;

    // 2. Fixtures
    line('\nFixtures');
    const fixtures = await sbSelect('fixtures', 'select=*&order=match_week.asc');
    const realFix = (fixtures.data || []).filter(f => !String(f.id).startsWith('smoketest-'));
    ok('38 league fixtures present', realFix.length === 38, `got ${realFix.length}`);
    const badTeam = realFix.find(f => f.home_team !== 'Arsenal' && f.away_team !== 'Arsenal');
    ok('every fixture involves Arsenal', !badTeam, badTeam ? `GW${badTeam.match_week}` : '');
    const completed = realFix.filter(f => f.status === 'completed').length;
    line(`  ℹ ${completed} fixture(s) currently marked completed`);

    // 3. Registration (insert player, id auto-generated)
    line('\nAuth');
    const reg = await sbInsert('players', { username: uname, email: `${uname}@example.com`, pin_hash: pinHash, is_admin: false });
    ok('register new player', reg.ok && reg.data && reg.data.id != null, `HTTP ${reg.status}`);
    playerId = reg.data && reg.data.id;

    // 4. Duplicate username rejected (unique constraint)
    const dup = await sbInsert('players', { username: uname, email: 'dup@example.com', pin_hash: pinHash });
    ok('duplicate username rejected', !dup.ok && dup.status === 409, `HTTP ${dup.status}`);

    // 5. Login: correct + wrong PIN
    const good = await sbSelect('players', `username=eq.${uname}&pin_hash=eq.${pinHash}&select=*`);
    ok('login with correct PIN', good.ok && good.data.length === 1);
    const bad = await sbSelect('players', `username=eq.${uname}&pin_hash=eq.${hashPin('0000')}&select=*`);
    ok('login with wrong PIN fails', bad.ok && bad.data.length === 0);

    // 6. Temp fixture for isolated prediction/scoring
    line('\nPredictions & scoring');
    const tf = await sbInsert('fixtures', {
      id: tempFix, season_id: seasonId, match_week: 999,
      home_team: 'Arsenal', away_team: 'Coventry City',
      match_date: '2099-01-01T15:00:00+00', status: 'scheduled',
    });
    ok('create temp fixture', tf.ok, `HTTP ${tf.status}`);

    // 7. Save prediction (upsert on player_id,fixture_id)
    const p1 = await sbUpsert('predictions', {
      player_id: playerId, fixture_id: tempFix, predicted_home: 1, predicted_away: 0,
      updated_at: new Date().toISOString(),
    }, 'player_id,fixture_id');
    ok('save prediction', p1.ok, `HTTP ${p1.status}`);

    // 8. Update prediction via upsert (should overwrite, not duplicate)
    await sbUpsert('predictions', {
      player_id: playerId, fixture_id: tempFix, predicted_home: 2, predicted_away: 0,
      updated_at: new Date().toISOString(),
    }, 'player_id,fixture_id');
    const check = await sbSelect('predictions', `player_id=eq.${playerId}&fixture_id=eq.${tempFix}&select=*`);
    ok('prediction updates in place (no dup)', check.data.length === 1 && check.data[0].predicted_home === 2,
       `rows=${check.data.length}`);

    // 9. Scoring rule (pure) — exhaustive small cases
    ok('score: exact = 3', score(2, 0, 2, 0) === 3);
    ok('score: right result, wrong score = 1', score(2, 0, 3, 1) === 1);
    ok('score: draw predicted, draw actual = 1', score(1, 1, 2, 2) === 1);
    ok('score: wrong result = 0', score(2, 0, 0, 1) === 0);

    // 10. Scoring integration: finalise temp fixture 2–0 (exact), recompute like the app
    const ah = 2, aa = 0;
    await sbPatch('fixtures', `id=eq.${tempFix}`, { home_score: ah, away_score: aa, status: 'completed' });
    const preds = (await sbSelect('predictions', `fixture_id=eq.${tempFix}&select=*`)).data || [];
    for (const p of preds) {
      const pts = score(p.predicted_home, p.predicted_away, ah, aa);
      await sbPatch('predictions', `id=eq.${p.id}`, { points_earned: pts });
      const cur = (await sbSelect('players', `id=eq.${p.player_id}&select=total_points`)).data[0].total_points || 0;
      await sbPatch('players', `id=eq.${p.player_id}`, { total_points: Math.max(0, cur - (p.points_earned || 0) + pts) });
    }
    const scored = (await sbSelect('predictions', `player_id=eq.${playerId}&fixture_id=eq.${tempFix}&select=points_earned`)).data[0];
    ok('prediction scored 3 (exact) end-to-end', scored.points_earned === 3, `got ${scored.points_earned}`);
    const me = (await sbSelect('players', `id=eq.${playerId}&select=total_points`)).data[0];
    ok('player total updated to 3', me.total_points === 3, `got ${me.total_points}`);

    // 11. Leaderboard query returns non-admins ordered by points
    line('\nLeaderboard');
    const lb = await sbSelect('players', 'is_admin=eq.false&order=total_points.desc&select=id,username,total_points');
    ok('leaderboard query works', lb.ok && Array.isArray(lb.data), `HTTP ${lb.status}`);

  } catch (err) {
    failed++; line('  ✗ unexpected error: ' + err.message);
  } finally {
    // ── Cleanup: remove everything this test created ──────────
    line('\nCleanup');
    let cleanOk = true;
    if (playerId != null) { const r = await sbDelete('predictions', `player_id=eq.${playerId}`); cleanOk = cleanOk && r.ok; }
    const rf = await sbDelete('predictions', `fixture_id=eq.${tempFix}`); cleanOk = cleanOk && rf.ok;
    const rx = await sbDelete('fixtures', `id=eq.${tempFix}`); cleanOk = cleanOk && rx.ok;
    if (playerId != null) { const rp = await sbDelete('players', `id=eq.${playerId}`); cleanOk = cleanOk && rp.ok; }
    ok('removed all test data', cleanOk);
  }

  line(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

run();
